import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "../../helpers/test-db";

let testDb: ReturnType<typeof createTestDb>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(() => "decrypted-api-key"),
}));

import { getAISettings } from "@/lib/ai/settings";
import { aiSettings } from "@/db/schema";

describe("getAISettings", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns null when no settings exist", async () => {
    const result = await getAISettings();
    expect(result).toBeNull();
  });

  it("returns decrypted settings when configured", async () => {
    testDb.insert(aiSettings).values({
      id: "ai-1",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      encryptedApiKey: "encrypted",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      updatedAt: new Date().toISOString(),
    }).run();

    const result = await getAISettings();
    expect(result).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      baseUrl: null,
      apiKey: "decrypted-api-key",
    });
  });

  it("returns the most recently updated setting", async () => {
    testDb.insert(aiSettings).values({
      id: "ai-1",
      provider: "openai",
      modelId: "gpt-4o",
      encryptedApiKey: "old",
      iv: "iv",
      authTag: "tag",
      encryptedDek: "dek",
      updatedAt: "2025-01-01T00:00:00Z",
    }).run();

    testDb.insert(aiSettings).values({
      id: "ai-2",
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      encryptedApiKey: "new",
      iv: "iv2",
      authTag: "tag2",
      encryptedDek: "dek2",
      updatedAt: "2026-01-01T00:00:00Z",
    }).run();

    const result = await getAISettings();
    expect(result!.provider).toBe("anthropic");
    expect(result!.modelId).toBe("claude-sonnet-4-6");
  });
});
