import { NextResponse } from "next/server";
import { db } from "@/db";
import { ascCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ulid } from "@/lib/ulid";
import { encrypt } from "@/lib/encryption";
import { clearFreeSelectedAppId } from "@/lib/app-preferences";

export async function POST() {
  const existing = db
    .select({ id: ascCredentials.id })
    .from(ascCredentials)
    .where(eq(ascCredentials.isActive, true))
    .get();

  if (existing) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 },
    );
  }

  // Store a demo credential – no real API key needed.
  // The encrypted fields use a placeholder so the schema stays valid.
  clearFreeSelectedAppId();

  const placeholder = encrypt("demo-placeholder");

  db.insert(ascCredentials)
    .values({
      id: ulid(),
      name: "Demo account",
      issuerId: "00000000-0000-0000-0000-000000000000",
      keyId: "DEMO000000",
      encryptedPrivateKey: placeholder.ciphertext,
      iv: placeholder.iv,
      authTag: placeholder.authTag,
      encryptedDek: placeholder.encryptedDek,
      isDemo: true,
    })
    .run();

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  db.delete(ascCredentials)
    .where(eq(ascCredentials.isDemo, true))
    .run();

  return NextResponse.json({ ok: true });
}
