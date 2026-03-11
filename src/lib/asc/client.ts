import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/encryption";
import { generateAscJwt } from "./jwt";
import { acquireToken } from "./rate-limit";
import { parseAscError, networkError } from "./errors";
import type { AscError } from "./errors";

const ASC_BASE = "https://api.appstoreconnect.apple.com";
const MAX_RETRIES = 3;

export class AscApiError extends Error {
  readonly ascError: AscError;

  constructor(ascError: AscError) {
    super(ascError.message);
    this.name = "AscApiError";
    this.ascError = ascError;
  }
}

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

  if (cred.isDemo) {
    throw new Error("ASC API is not available in demo mode");
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
  const method = options?.method ?? "GET";
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${ASC_BASE}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });
    } catch (err) {
      console.error(`[ASC] ${method} ${path} → network error`, err);
      const ascError = networkError();
      ascError.method = method;
      ascError.path = path;
      throw new AscApiError(ascError);
    }

    if (response.ok) {
      if (response.status === 204) return null as T;
      return response.json() as Promise<T>;
    }
    const retryable = (response.status === 429 || response.status >= 500) && method !== "POST";

    if (retryable && attempt < MAX_RETRIES - 1) {
      const text = await response.text().catch(() => "");
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[ASC] ${method} ${path} → ${response.status} (retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms): ${text.slice(0, 200)}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    const text = await response.text().catch(() => "");
    console.error(`[ASC] ${method} ${path} → ${response.status}: ${text.slice(0, 500)}`);
    const ascError = parseAscError(response.status, text);
    ascError.method = method;
    ascError.path = path;
    lastError = new AscApiError(ascError);
    break;
  }

  throw lastError ?? new AscApiError({ category: "api", message: "ASC API request failed" });
}

export function resetToken(): void {
  cachedToken = null;
}

export function hasCredentials(): boolean {
  return !!getActiveCredential();
}

export function isActiveDemoCredential(): boolean {
  const cred = getActiveCredential();
  return !!cred?.isDemo;
}
