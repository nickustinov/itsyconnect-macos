import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials, aiSettings, cacheEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { parseBody } from "@/lib/api-helpers";

export async function GET() {
  const cred = db
    .select({
      id: ascCredentials.id,
      issuerId: ascCredentials.issuerId,
      keyId: ascCredentials.keyId,
      isActive: ascCredentials.isActive,
      createdAt: ascCredentials.createdAt,
    })
    .from(ascCredentials)
    .where(eq(ascCredentials.isActive, true))
    .get();

  return NextResponse.json({ credential: cred ?? null });
}

const createSchema = z.object({
  issuerId: z.string().min(1).trim(),
  keyId: z.string().min(1).trim(),
  privateKey: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, createSchema);
  if (parsed instanceof Response) return parsed;

  const { issuerId, keyId, privateKey } = parsed;

  // Deactivate existing credentials
  db.update(ascCredentials)
    .set({ isActive: false })
    .where(eq(ascCredentials.isActive, true))
    .run();

  // Encrypt and store new credential
  const encrypted = encrypt(privateKey);
  db.insert(ascCredentials)
    .values({
      id: ulid(),
      issuerId,
      keyId,
      encryptedPrivateKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    })
    .run();

  // Start background sync with new credentials
  const { startSyncWorker } = await import("@/lib/sync/worker");
  startSyncWorker();

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  db.delete(ascCredentials).where(eq(ascCredentials.id, id)).run();

  // Clear all cached data and AI settings so the app resets to a clean state
  db.delete(cacheEntries).run();
  db.delete(aiSettings).run();

  return NextResponse.json({ ok: true });
}
