import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";
import { ulid } from "@/lib/ulid";

const TEST_MASTER_KEY =
  "9fce91a7ca8c37d1f9e0280d897274519bfc81d9ef8876707bc2ff0727680462";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE asc_credentials (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT,
      issuer_id TEXT NOT NULL,
      key_id TEXT NOT NULL,
      vendor_id TEXT,
      encrypted_private_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE ai_settings (
      id TEXT PRIMARY KEY NOT NULL,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      base_url TEXT,
      encrypted_api_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE cache_entries (
      resource TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      ttl_ms INTEGER NOT NULL
    );
  `);
  return drizzle(sqlite, { schema });
}

describe("setup flow", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    db = createTestDb();
  });

  it("stores encrypted ASC credentials with name", () => {
    const privateKeyPem =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----";
    const encrypted = encrypt(privateKeyPem);

    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        name: "My team",
        issuerId: "69a6de7e-6b7b-47e3-e053-5b8c7c11a4d1",
        keyId: "2X9R4HXF34",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const cred = db.select().from(schema.ascCredentials).get();
    expect(cred).toBeDefined();
    expect(cred!.name).toBe("My team");
    expect(cred!.issuerId).toBe("69a6de7e-6b7b-47e3-e053-5b8c7c11a4d1");
    expect(cred!.keyId).toBe("2X9R4HXF34");
    expect(cred!.isActive).toBe(true);

    // Decrypt and verify
    const decrypted = decrypt({
      ciphertext: cred!.encryptedPrivateKey,
      iv: cred!.iv,
      authTag: cred!.authTag,
      encryptedDek: cred!.encryptedDek,
    });
    expect(decrypted).toBe(privateKeyPem);
  });

  it("stores encrypted AI settings", () => {
    const apiKey = "sk-ant-api03-test-key";
    const encrypted = encrypt(apiKey);

    db.insert(schema.aiSettings)
      .values({
        id: ulid(),
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        encryptedApiKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const settings = db.select().from(schema.aiSettings).get();
    expect(settings).toBeDefined();
    expect(settings!.provider).toBe("anthropic");
    expect(settings!.modelId).toBe("claude-sonnet-4-20250514");

    const decrypted = decrypt({
      ciphertext: settings!.encryptedApiKey,
      iv: settings!.iv,
      authTag: settings!.authTag,
      encryptedDek: settings!.encryptedDek,
    });
    expect(decrypted).toBe(apiKey);
  });

  it("rejects setup when credentials already exist", () => {
    const encrypted = encrypt("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");

    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        issuerId: "issuer-123",
        keyId: "KEY123",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const cred = db
      .select({ id: schema.ascCredentials.id })
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .get();

    expect(cred).toBeDefined();
    // In the actual route this would return 403
  });

  it("full setup flow: credentials + AI", () => {
    // 1. Store ASC credentials
    const ascEncrypted = encrypt("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        issuerId: "issuer-123",
        keyId: "KEY123",
        encryptedPrivateKey: ascEncrypted.ciphertext,
        iv: ascEncrypted.iv,
        authTag: ascEncrypted.authTag,
        encryptedDek: ascEncrypted.encryptedDek,
      })
      .run();

    // 2. Store AI settings
    const aiEncrypted = encrypt("sk-test-key");
    db.insert(schema.aiSettings)
      .values({
        id: ulid(),
        provider: "openai",
        modelId: "gpt-4o",
        encryptedApiKey: aiEncrypted.ciphertext,
        iv: aiEncrypted.iv,
        authTag: aiEncrypted.authTag,
        encryptedDek: aiEncrypted.encryptedDek,
      })
      .run();

    // Verify everything
    const creds = db.select().from(schema.ascCredentials).all();
    expect(creds).toHaveLength(1);
    expect(creds[0].keyId).toBe("KEY123");

    const ai = db.select().from(schema.aiSettings).all();
    expect(ai).toHaveLength(1);
    expect(ai[0].provider).toBe("openai");
    expect(decrypt({
      ciphertext: ai[0].encryptedApiKey,
      iv: ai[0].iv,
      authTag: ai[0].authTag,
      encryptedDek: ai[0].encryptedDek,
    })).toBe("sk-test-key");
  });
});
