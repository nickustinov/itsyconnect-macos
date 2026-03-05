import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";
import { eq, ne, sql } from "drizzle-orm";
import { validateApiKey } from "@/lib/ai/provider-factory";
import { parseBody } from "@/lib/api-helpers";
import {
  DEFAULT_LOCAL_OPENAI_BASE_URL,
  ensureLocalModelLoaded,
  isLocalOpenAIProvider,
  normalizeOpenAICompatibleBaseUrl,
  resolveLocalOpenAIApiKey,
} from "@/lib/ai/local-provider";

export async function GET() {
  const settings = db
    .select({
      id: aiSettings.id,
      provider: aiSettings.provider,
      modelId: aiSettings.modelId,
      baseUrl: aiSettings.baseUrl,
    })
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();

  return NextResponse.json({
    settings: settings
      ? { ...settings, hasApiKey: true }
      : null,
  });
}

const updateSchema = z.object({
  provider: z.string().trim().min(1),
  modelId: z.string().trim().min(1),
  baseUrl: z.string().trim().optional(),
  apiKey: z.string().optional(),
});

export async function PUT(request: Request) {
  const parsed = await parseBody(request, updateSchema);
  if (parsed instanceof Response) return parsed;

  const provider = parsed.provider.trim();
  const modelId = parsed.modelId.trim();
  const apiKey = parsed.apiKey?.trim();
  const baseUrl = parsed.baseUrl?.trim();
  const isLocalProvider = isLocalOpenAIProvider(provider);

  let normalizedBaseUrl: string | null = null;
  if (isLocalProvider) {
    if (baseUrl) {
      normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
      if (!normalizedBaseUrl) {
        return NextResponse.json(
          { error: "Invalid local server URL" },
          { status: 400 },
        );
      }
    } else {
      normalizedBaseUrl = DEFAULT_LOCAL_OPENAI_BASE_URL;
    }
  }

  const existing = db
    .select({ id: aiSettings.id, provider: aiSettings.provider })
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();

  async function validateLocalModelLoad(candidateApiKey: string) {
    if (!isLocalProvider) return null;
    return ensureLocalModelLoaded(
      modelId,
      normalizedBaseUrl ?? undefined,
      candidateApiKey,
    );
  }

  if (apiKey) {
    const localLoadError = await validateLocalModelLoad(apiKey);
    if (localLoadError) {
      return NextResponse.json({ error: localLoadError }, { status: 422 });
    }

    // Validate the key before saving
    const validationError = await validateApiKey(
      provider,
      modelId,
      apiKey,
      normalizedBaseUrl ?? undefined,
    );
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
        baseUrl: normalizedBaseUrl,
        updatedAt: new Date().toISOString(),
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();
  } else {
    // No key: update provider/model only if settings exist
    if (!existing) {
      if (isLocalProvider) {
        const localApiKey = resolveLocalOpenAIApiKey(undefined);
        const localLoadError = await validateLocalModelLoad(localApiKey);
        if (localLoadError) {
          return NextResponse.json({ error: localLoadError }, { status: 422 });
        }
        const validationError = await validateApiKey(
          provider,
          modelId,
          localApiKey,
          normalizedBaseUrl ?? undefined,
        );
        if (validationError) {
          return NextResponse.json({ error: validationError }, { status: 422 });
        }

        const encrypted = encrypt(localApiKey);
        db.insert(aiSettings)
          .values({
            id: ulid(),
            provider,
            modelId,
            baseUrl: normalizedBaseUrl,
            updatedAt: new Date().toISOString(),
            encryptedApiKey: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            encryptedDek: encrypted.encryptedDek,
          })
          .run();

        return NextResponse.json({ ok: true });
      }

      return NextResponse.json(
        { error: "API key is required for initial setup" },
        { status: 400 },
      );
    }

    if (provider !== existing.provider) {
      if (isLocalProvider) {
        const localApiKey = resolveLocalOpenAIApiKey(undefined);
        const localLoadError = await validateLocalModelLoad(localApiKey);
        if (localLoadError) {
          return NextResponse.json({ error: localLoadError }, { status: 422 });
        }
        const validationError = await validateApiKey(
          provider,
          modelId,
          localApiKey,
          normalizedBaseUrl ?? undefined,
        );
        if (validationError) {
          return NextResponse.json({ error: validationError }, { status: 422 });
        }

        db.delete(aiSettings).run();
        const encrypted = encrypt(localApiKey);
        db.insert(aiSettings)
          .values({
            id: ulid(),
            provider,
            modelId,
            baseUrl: normalizedBaseUrl,
            updatedAt: new Date().toISOString(),
            encryptedApiKey: encrypted.ciphertext,
            iv: encrypted.iv,
            authTag: encrypted.authTag,
            encryptedDek: encrypted.encryptedDek,
          })
          .run();

        return NextResponse.json({ ok: true });
      }

      return NextResponse.json(
        { error: "Switching provider requires a new API key" },
        { status: 400 },
      );
    }

    if (isLocalProvider) {
      const localApiKey = resolveLocalOpenAIApiKey(undefined);
      const localLoadError = await validateLocalModelLoad(localApiKey);
      if (localLoadError) {
        return NextResponse.json({ error: localLoadError }, { status: 422 });
      }
    }

    db.update(aiSettings)
      .set({ provider, modelId, baseUrl: normalizedBaseUrl, updatedAt: new Date().toISOString() })
      .where(eq(aiSettings.id, existing.id))
      .run();

    // Cleanup stale rows so every code path resolves the same active settings.
    db.delete(aiSettings)
      .where(ne(aiSettings.id, existing.id))
      .run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  db.delete(aiSettings).run();
  return NextResponse.json({ ok: true });
}
