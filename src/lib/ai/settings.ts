import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { sql } from "drizzle-orm";

export interface AISettingsResult {
  provider: string;
  modelId: string;
  baseUrl: string | null;
  apiKey: string;
}

/** Read and decrypt AI settings from the database. Returns null if not configured. */
export async function getAISettings(): Promise<AISettingsResult | null> {
  const row = db
    .select()
    .from(aiSettings)
    .orderBy(sql`${aiSettings.updatedAt} DESC`)
    .get();

  if (!row) return null;

  const apiKey = decrypt({
    ciphertext: row.encryptedApiKey,
    iv: row.iv,
    authTag: row.authTag,
    encryptedDek: row.encryptedDek,
  });

  return {
    provider: row.provider,
    modelId: row.modelId,
    baseUrl: row.baseUrl,
    apiKey,
  };
}
