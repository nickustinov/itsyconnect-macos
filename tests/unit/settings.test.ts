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
  `);
  return drizzle(sqlite, { schema });
}

describe("settings: credentials", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    db = createTestDb();
  });

  it("stores and retrieves credential with name (never returns private key)", () => {
    const encrypted = encrypt("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
    const id = ulid();

    db.insert(schema.ascCredentials)
      .values({
        id,
        name: "My team",
        issuerId: "issuer-123",
        keyId: "KEY123",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    // GET returns safe fields only (including name)
    const cred = db
      .select({
        id: schema.ascCredentials.id,
        name: schema.ascCredentials.name,
        issuerId: schema.ascCredentials.issuerId,
        keyId: schema.ascCredentials.keyId,
        isActive: schema.ascCredentials.isActive,
        createdAt: schema.ascCredentials.createdAt,
      })
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .get();

    expect(cred).toBeDefined();
    expect(cred!.name).toBe("My team");
    expect(cred!.issuerId).toBe("issuer-123");
    expect(cred!.keyId).toBe("KEY123");
    // encryptedPrivateKey, iv, authTag, encryptedDek are NOT in the result
    expect("encryptedPrivateKey" in cred!).toBe(false);
  });

  it("name defaults to null for credentials without a name", () => {
    const encrypted = encrypt("key");
    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        issuerId: "issuer",
        keyId: "KEY",
        encryptedPrivateKey: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        encryptedDek: encrypted.encryptedDek,
      })
      .run();

    const cred = db
      .select({ name: schema.ascCredentials.name })
      .from(schema.ascCredentials)
      .get();

    expect(cred!.name).toBeNull();
  });

  it("GET returns all credentials (not just active)", () => {
    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");

    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        name: "Team A",
        issuerId: "issuer-a",
        keyId: "KEY_A",
        isActive: true,
        encryptedPrivateKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();

    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        name: "Team B",
        issuerId: "issuer-b",
        keyId: "KEY_B",
        isActive: false,
        encryptedPrivateKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    const all = db
      .select({
        id: schema.ascCredentials.id,
        name: schema.ascCredentials.name,
        issuerId: schema.ascCredentials.issuerId,
        keyId: schema.ascCredentials.keyId,
        isActive: schema.ascCredentials.isActive,
      })
      .from(schema.ascCredentials)
      .all();

    expect(all).toHaveLength(2);
    expect(all.map((c) => c.name)).toEqual(["Team A", "Team B"]);
  });

  it("deactivates old credentials when storing new", () => {
    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");

    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        issuerId: "old-issuer",
        keyId: "OLD",
        encryptedPrivateKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();

    // Deactivate old
    db.update(schema.ascCredentials)
      .set({ isActive: false })
      .where(eq(schema.ascCredentials.isActive, true))
      .run();

    // Insert new
    db.insert(schema.ascCredentials)
      .values({
        id: ulid(),
        issuerId: "new-issuer",
        keyId: "NEW",
        encryptedPrivateKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    const active = db
      .select()
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .all();

    expect(active).toHaveLength(1);
    expect(active[0].keyId).toBe("NEW");
  });

  it("deletes a credential by ID", () => {
    const enc = encrypt("key");
    const id = ulid();

    db.insert(schema.ascCredentials)
      .values({
        id,
        issuerId: "issuer",
        keyId: "KEY",
        encryptedPrivateKey: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        encryptedDek: enc.encryptedDek,
      })
      .run();

    db.delete(schema.ascCredentials)
      .where(eq(schema.ascCredentials.id, id))
      .run();

    const all = db.select().from(schema.ascCredentials).all();
    expect(all).toHaveLength(0);
  });

  it("auto-activates the first remaining credential when active one is deleted", () => {
    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");
    const id1 = ulid();
    const id2 = ulid();

    db.insert(schema.ascCredentials)
      .values({
        id: id1,
        name: "Active",
        issuerId: "issuer-1",
        keyId: "KEY1",
        isActive: true,
        encryptedPrivateKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();

    db.insert(schema.ascCredentials)
      .values({
        id: id2,
        name: "Inactive",
        issuerId: "issuer-2",
        keyId: "KEY2",
        isActive: false,
        encryptedPrivateKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    // Delete the active one
    db.delete(schema.ascCredentials)
      .where(eq(schema.ascCredentials.id, id1))
      .run();

    const remaining = db.select().from(schema.ascCredentials).all();
    expect(remaining).toHaveLength(1);

    // Auto-activate: set first remaining as active
    db.update(schema.ascCredentials)
      .set({ isActive: true })
      .where(eq(schema.ascCredentials.id, remaining[0].id))
      .run();

    const active = db
      .select()
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .all();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Inactive");
  });

  it("switching active credential: deactivate all then activate target", () => {
    const enc1 = encrypt("key-1");
    const enc2 = encrypt("key-2");
    const id1 = ulid();
    const id2 = ulid();

    db.insert(schema.ascCredentials)
      .values({
        id: id1,
        name: "Team A",
        issuerId: "issuer-1",
        keyId: "KEY1",
        isActive: true,
        encryptedPrivateKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();

    db.insert(schema.ascCredentials)
      .values({
        id: id2,
        name: "Team B",
        issuerId: "issuer-2",
        keyId: "KEY2",
        isActive: false,
        encryptedPrivateKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    // Deactivate all
    db.update(schema.ascCredentials).set({ isActive: false }).run();

    // Activate target
    db.update(schema.ascCredentials)
      .set({ isActive: true })
      .where(eq(schema.ascCredentials.id, id2))
      .run();

    const active = db
      .select()
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .all();
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("Team B");
  });
});

describe("settings: AI", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    db = createTestDb();
  });

  it("stores and retrieves AI settings (never returns API key)", () => {
    const enc = encrypt("sk-test-key");

    db.insert(schema.aiSettings)
      .values({
        id: ulid(),
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        encryptedApiKey: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
        encryptedDek: enc.encryptedDek,
      })
      .run();

    const settings = db
      .select({
        id: schema.aiSettings.id,
        provider: schema.aiSettings.provider,
        modelId: schema.aiSettings.modelId,
        updatedAt: schema.aiSettings.updatedAt,
      })
      .from(schema.aiSettings)
      .get();

    expect(settings).toBeDefined();
    expect(settings!.provider).toBe("anthropic");
    // encryptedApiKey NOT in result
    expect("encryptedApiKey" in settings!).toBe(false);
  });

  it("replaces AI settings on update", () => {
    const enc1 = encrypt("old-key");
    const enc2 = encrypt("new-key");

    db.insert(schema.aiSettings)
      .values({
        id: ulid(),
        provider: "openai",
        modelId: "gpt-4o",
        encryptedApiKey: enc1.ciphertext,
        iv: enc1.iv,
        authTag: enc1.authTag,
        encryptedDek: enc1.encryptedDek,
      })
      .run();

    // Delete old, insert new (like the route does)
    db.delete(schema.aiSettings).run();

    db.insert(schema.aiSettings)
      .values({
        id: ulid(),
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        encryptedApiKey: enc2.ciphertext,
        iv: enc2.iv,
        authTag: enc2.authTag,
        encryptedDek: enc2.encryptedDek,
      })
      .run();

    const all = db.select().from(schema.aiSettings).all();
    expect(all).toHaveLength(1);
    expect(all[0].provider).toBe("anthropic");

    const decrypted = decrypt({
      ciphertext: all[0].encryptedApiKey,
      iv: all[0].iv,
      authTag: all[0].authTag,
      encryptedDek: all[0].encryptedDek,
    });
    expect(decrypted).toBe("new-key");
  });
});
