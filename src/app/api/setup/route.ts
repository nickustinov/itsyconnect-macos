import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials, aiSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";

const setupSchema = z.object({
  // ASC credentials – required
  name: z.string().trim().default("My team"),
  issuerId: z.string().min(1, "Issuer ID is required").trim(),
  keyId: z.string().min(1, "Key ID is required").trim(),
  privateKey: z.string().min(1, "Private key is required"),
  // AI settings – optional
  aiProvider: z.string().optional(),
  aiModelId: z.string().optional(),
  aiApiKey: z.string().optional(),
});

export async function POST(request: Request) {
  // Check no active credentials exist (setup already done)
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

  // Validate input
  const parsed = await parseBody(request, setupSchema);
  if (parsed instanceof Response) return parsed;

  const data = parsed;

  // Validate AI key before saving anything
  if (data.aiProvider && data.aiModelId && data.aiApiKey) {
    const aiValidationError = await validateApiKey(data.aiProvider, data.aiModelId, data.aiApiKey);
    if (aiValidationError) {
      return NextResponse.json({ error: aiValidationError }, { status: 422 });
    }
  }

  // Store ASC credentials
  const encrypted = encrypt(data.privateKey);
  db.insert(ascCredentials)
    .values({
      id: ulid(),
      name: data.name,
      issuerId: data.issuerId,
      keyId: data.keyId,
      encryptedPrivateKey: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptedDek: encrypted.encryptedDek,
    })
    .run();

  // Store AI settings (already validated above)
  if (data.aiProvider && data.aiModelId && data.aiApiKey) {
    const aiEncrypted = encrypt(data.aiApiKey);
    db.insert(aiSettings)
      .values({
        id: ulid(),
        provider: data.aiProvider,
        modelId: data.aiModelId,
        encryptedApiKey: aiEncrypted.ciphertext,
        iv: aiEncrypted.iv,
        authTag: aiEncrypted.authTag,
        encryptedDek: aiEncrypted.encryptedDek,
      })
      .run();
  }

  // Start background sync now that credentials are stored
  const { startSyncWorker } = await import("@/lib/sync/worker");
  startSyncWorker();

  return NextResponse.json({ ok: true });
}
