import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { ascCredentials, aiSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  normalizeOpenAICompatibleBaseUrl,
  resolveLocalOpenAIApiKey,
} from "@/lib/ai/local-provider";

const setupSchema = z.object({
  // ASC credentials – required
  name: z.string().trim().default("My team"),
  issuerId: z.string().min(1, "Issuer ID is required").trim(),
  keyId: z.string().min(1, "Key ID is required").trim(),
  privateKey: z.string().min(1, "Private key is required"),
  // AI settings – optional
  aiProvider: z.string().optional(),
  aiModelId: z.string().optional(),
  aiBaseUrl: z.string().optional(),
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
  const aiProvider = data.aiProvider?.trim();
  const aiModelId = data.aiModelId?.trim();
  const aiApiKey = data.aiApiKey?.trim();
  const aiBaseUrl = data.aiBaseUrl?.trim();
  const isLocalProvider = aiProvider ? isLocalOpenAIProvider(aiProvider) : false;

  let normalizedAiBaseUrl: string | null = null;
  if (isLocalProvider) {
    if (aiBaseUrl) {
      normalizedAiBaseUrl = normalizeOpenAICompatibleBaseUrl(aiBaseUrl);
      if (!normalizedAiBaseUrl) {
        return NextResponse.json(
          { error: "Invalid local server URL" },
          { status: 400 },
        );
      }
    } else {
      normalizedAiBaseUrl = DEFAULT_LOCAL_OPENAI_BASE_URL;
    }
  }

  const resolvedAiApiKey =
    isLocalProvider
      ? resolveLocalOpenAIApiKey(aiApiKey)
      : aiApiKey;

  const hasAIConfig =
    !!aiProvider &&
    !!aiModelId &&
    (!!resolvedAiApiKey || isLocalProvider);

  // Validate AI key before saving anything
  if (hasAIConfig) {
    if (isLocalProvider) {
      const loadError = await ensureLocalModelLoaded(
        aiModelId!,
        normalizedAiBaseUrl ?? undefined,
        resolvedAiApiKey!,
      );
      if (loadError) {
        return NextResponse.json({ error: loadError }, { status: 422 });
      }
    }

    const aiValidationError = await validateApiKey(
      aiProvider!,
      aiModelId!,
      resolvedAiApiKey!,
      normalizedAiBaseUrl ?? undefined,
    );
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
  if (hasAIConfig) {
    const aiEncrypted = encrypt(resolvedAiApiKey!);
    db.insert(aiSettings)
      .values({
        id: ulid(),
        provider: aiProvider!,
        modelId: aiModelId!,
        baseUrl: normalizedAiBaseUrl,
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
