import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials, cacheEntries } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { cacheInvalidateAll } from "@/lib/cache";
import { resetToken } from "@/lib/asc/client";
import { parseBody } from "@/lib/api-helpers";

export async function GET() {
  const credentials = db
    .select({
      id: ascCredentials.id,
      name: ascCredentials.name,
      issuerId: ascCredentials.issuerId,
      keyId: ascCredentials.keyId,
      isActive: ascCredentials.isActive,
      createdAt: ascCredentials.createdAt,
    })
    .from(ascCredentials)
    .all();

  return NextResponse.json({ credentials });
}

const createSchema = z.object({
  name: z.string().trim().default("My team"),
  issuerId: z.string().min(1).trim(),
  keyId: z.string().min(1).trim(),
  privateKey: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = await parseBody(request, createSchema);
  if (parsed instanceof Response) return parsed;

  const { name, issuerId, keyId, privateKey } = parsed;

  // Reject duplicate issuer ID + key ID
  const existing = db
    .select({ id: ascCredentials.id })
    .from(ascCredentials)
    .where(
      and(
        eq(ascCredentials.issuerId, issuerId),
        eq(ascCredentials.keyId, keyId),
      ),
    )
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "A team with this issuer ID and key already exists" },
      { status: 409 },
    );
  }

  // Deactivate existing credentials
  db.update(ascCredentials)
    .set({ isActive: false })
    .where(eq(ascCredentials.isActive, true))
    .run();

  // Encrypt and store new credential
  const encrypted = encrypt(privateKey);
  const id = ulid();
  db.insert(ascCredentials)
    .values({
      id,
      name,
      issuerId,
      keyId,
      encryptedPrivateKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    })
    .run();

  // Clear cache and token – UI will fetch fresh data from ASC on next load
  cacheInvalidateAll();
  resetToken();

  return NextResponse.json({ ok: true, id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Check if the deleted row was active
  const deleted = db
    .select({ isActive: ascCredentials.isActive })
    .from(ascCredentials)
    .where(eq(ascCredentials.id, id))
    .get();

  db.delete(ascCredentials).where(eq(ascCredentials.id, id)).run();

  // Clear cached data (but NOT AI settings – those are independent)
  db.delete(cacheEntries).run();
  resetToken();

  // If deleted row was active and others remain, auto-activate the first one
  const remaining = db.select({ id: ascCredentials.id }).from(ascCredentials).all();

  if (deleted?.isActive && remaining.length > 0) {
    db.update(ascCredentials)
      .set({ isActive: true })
      .where(eq(ascCredentials.id, remaining[0].id))
      .run();

    cacheInvalidateAll();
  }

  return NextResponse.json({ ok: true, redirectToSetup: remaining.length === 0 });
}
