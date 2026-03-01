import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { generateAscJwt } from "./jwt";
import { acquireToken } from "./rate-limit";

const ASC_BASE = "https://api.appstoreconnect.apple.com";
const MAX_RETRIES = 3;

function getActiveCredential() {
  return db
    .select()
    .from(ascCredentials)
    .where(eq(ascCredentials.isActive, true))
    .get();
}

function decryptPrivateKey(cred: NonNullable<ReturnType<typeof getActiveCredential>>): string {
  return decrypt({
    ciphertext: cred.encryptedPrivateKey,
    iv: cred.iv,
    authTag: cred.authTag,
    encryptedDek: cred.encryptedDek,
  });
}

let cachedToken: { jwt: string; expiresAt: number } | null = null;

function getToken(): string {
  // Reuse token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.jwt;
  }

  const cred = getActiveCredential();
  if (!cred) {
    throw new Error("No active ASC credentials configured");
  }

  const privateKey = decryptPrivateKey(cred);
  const jwt = generateAscJwt(cred.issuerId, cred.keyId, privateKey);

  cachedToken = {
    jwt,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
  };

  return jwt;
}

export async function ascFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  await acquireToken();

  const token = getToken();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch(`${ASC_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (response.ok) {
      if (response.status === 204) return null as T;
      return response.json() as Promise<T>;
    }

    if (response.status === 429) {
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const text = await response.text().catch(() => "");
    const method = options?.method ?? "GET";
    console.error(`[ASC] ${method} ${path} → ${response.status}: ${text.slice(0, 500)}`);
    lastError = new Error(
      `ASC API ${response.status}: ${text.slice(0, 200)}`,
    );
    break;
  }

  throw lastError ?? new Error("ASC API request failed");
}

export function resetToken(): void {
  cachedToken = null;
}

export function hasCredentials(): boolean {
  return !!getActiveCredential();
}
