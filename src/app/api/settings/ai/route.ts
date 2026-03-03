import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { eq } from "drizzle-orm";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";

export async function GET() {
  const settings = db
    .select({
      id: aiSettings.id,
      provider: aiSettings.provider,
      modelId: aiSettings.modelId,
    })
    .from(aiSettings)
    .get();

  return NextResponse.json({
    settings: settings
      ? { ...settings, hasApiKey: true }
      : null,
  });
}

const updateSchema = z.object({
  provider: z.string().min(1),
  modelId: z.string().min(1),
  apiKey: z.string().min(1).optional(),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const { provider, modelId, apiKey } = parsed;

  if (apiKey) {
    // Validate the key before saving
    const validationError = await validateApiKey(provider, modelId, apiKey);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 422 });
    }

    // New key: replace everything
    db.delete(aiSettings).run();
    const encrypted = encrypt(apiKey);
    db.insert(aiSettings)
      .values({
        id: ulid(),
        provider,
        modelId,
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();
  } else {
    // No key: update provider/model only if settings exist
    const existing = db
      .select({ id: aiSettings.id, provider: aiSettings.provider })
      .from(aiSettings)
      .get();
    if (!existing) {
      return NextResponse.json(
        { error: "API key is required for initial setup" },
        { status: 400 },
      );
    }
    if (provider !== existing.provider) {
      return NextResponse.json(
        { error: "Switching provider requires a new API key" },
        { status: 400 },
      );
    }
    db.update(aiSettings)
      .set({ provider, modelId })
      .where(eq(aiSettings.id, existing.id))
      .run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  db.delete(aiSettings).run();
  return NextResponse.json({ ok: true });
}
