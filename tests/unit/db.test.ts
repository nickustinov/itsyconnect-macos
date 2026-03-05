import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ulid } from "@/lib/ulid";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

function migrateTestDb(sqlite: InstanceType<typeof Database>) {
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
}

describe("ULID generator", () => {
  it("returns a 26-character string", () => {
    const id = ulid();
    expect(id).toHaveLength(26);
  });

  it("uses only Crockford Base32 characters", () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => ulid()));
    expect(ids.size).toBe(100);
  });

  it("has monotonically non-decreasing timestamp prefix", () => {
    const id1 = ulid();
    const id2 = ulid();
    // First 10 chars encode the timestamp – same or later ms
    expect(id1.slice(0, 10) <= id2.slice(0, 10)).toBe(true);
  });
});

describe("database schema", () => {
  let db: ReturnType<typeof drizzle>;
  let sqlite: InstanceType<typeof Database>;

  beforeEach(() => {
    const test = createTestDb();
    db = test.db;
    sqlite = test.sqlite;
    migrateTestDb(sqlite);
  });

  describe("ascCredentials", () => {
    it("inserts and queries a credential", () => {
      const id = ulid();
      const now = new Date().toISOString();

      db.insert(schema.ascCredentials).values({
        id,
        issuerId: "69a6de7e-6b7b-47e3-e053-5b8c7c11a4d1",
        keyId: "2X9R4HXF34",
        encryptedPrivateKey: "encrypted-data",
        iv: "random-iv",
        authTag: "tag",
        encryptedDek: "encrypted-dek",
        createdAt: now,
      }).run();

      const rows = db.select().from(schema.ascCredentials).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        issuerId: "69a6de7e-6b7b-47e3-e053-5b8c7c11a4d1",
        keyId: "2X9R4HXF34",
        isActive: true,
      });
    });

    it("defaults isActive to true", () => {
      const id = ulid();
      const now = new Date().toISOString();

      sqlite.prepare(
        `INSERT INTO asc_credentials (id, issuer_id, key_id, encrypted_private_key, iv, auth_tag, encrypted_dek, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, "issuer", "key", "enc", "iv", "tag", "dek", now);

      const rows = db
        .select()
        .from(schema.ascCredentials)
        .where(eq(schema.ascCredentials.id, id))
        .all();
      expect(rows[0].isActive).toBe(true);
    });
  });

  describe("aiSettings", () => {
    it("inserts and queries AI settings", () => {
      const id = ulid();
      const now = new Date().toISOString();

      db.insert(schema.aiSettings).values({
        id,
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        encryptedApiKey: "encrypted-key",
        iv: "random-iv",
        authTag: "tag",
        encryptedDek: "encrypted-dek",
        updatedAt: now,
      }).run();

      const rows = db.select().from(schema.aiSettings).all();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
      });
    });
  });

  describe("cacheEntries", () => {
    it("inserts and queries a cache entry", () => {
      const now = Date.now();

      db.insert(schema.cacheEntries).values({
        resource: "apps",
        data: JSON.stringify([{ id: "app-1", name: "My App" }]),
        fetchedAt: now,
        ttlMs: 3600000,
      }).run();

      const rows = db.select().from(schema.cacheEntries).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].resource).toBe("apps");
      expect(JSON.parse(rows[0].data)).toEqual([
        { id: "app-1", name: "My App" },
      ]);
    });

    it("upserts on conflict (resource is PK)", () => {
      const now = Date.now();

      db.insert(schema.cacheEntries).values({
        resource: "apps",
        data: "[]",
        fetchedAt: now,
        ttlMs: 3600000,
      }).run();

      // Upsert with new data
      db.insert(schema.cacheEntries)
        .values({
          resource: "apps",
          data: '[{"id":"app-1"}]',
          fetchedAt: now + 1000,
          ttlMs: 3600000,
        })
        .onConflictDoUpdate({
          target: schema.cacheEntries.resource,
          set: {
            data: '[{"id":"app-1"}]',
            fetchedAt: now + 1000,
          },
        })
        .run();

      const rows = db.select().from(schema.cacheEntries).all();
      expect(rows).toHaveLength(1);
      expect(rows[0].fetchedAt).toBe(now + 1000);
      expect(JSON.parse(rows[0].data)).toEqual([{ id: "app-1" }]);
    });

    it("detects stale entries by TTL", () => {
      const staleTime = Date.now() - 7200000; // 2 hours ago

      db.insert(schema.cacheEntries).values({
        resource: "apps",
        data: "[]",
        fetchedAt: staleTime,
        ttlMs: 3600000, // 1 hour TTL
      }).run();

      const rows = db
        .select()
        .from(schema.cacheEntries)
        .where(
          sql`${schema.cacheEntries.fetchedAt} + ${schema.cacheEntries.ttlMs} > ${Date.now()}`,
        )
        .all();

      expect(rows).toHaveLength(0); // stale, not returned
    });
  });
});
