import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encrypt } from "@/lib/encryption";
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
      encrypted_private_key TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      encrypted_dek TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
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

function insertCred(
  db: ReturnType<typeof createTestDb>,
  overrides: { id?: string; name?: string; isActive?: boolean } = {},
) {
  const enc = encrypt("key");
  const id = overrides.id ?? ulid();
  db.insert(schema.ascCredentials)
    .values({
      id,
      name: overrides.name ?? "Team",
      issuerId: `issuer-${id}`,
      keyId: `KEY-${id}`,
      isActive: overrides.isActive ?? true,
      encryptedPrivateKey: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      encryptedDek: enc.encryptedDek,
    })
    .run();
  return id;
}

describe("credentials: activate (switch account)", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
    db = createTestDb();
  });

  it("switches active account: deactivates all, activates target", () => {
    const id1 = insertCred(db, { name: "Team A", isActive: true });
    const id2 = insertCred(db, { name: "Team B", isActive: false });

    // Deactivate all
    db.update(schema.ascCredentials).set({ isActive: false }).run();

    // Activate target
    db.update(schema.ascCredentials)
      .set({ isActive: true })
      .where(eq(schema.ascCredentials.id, id2))
      .run();

    const all = db.select().from(schema.ascCredentials).all();
    expect(all).toHaveLength(2);

    const active = all.filter((c) => c.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id2);
    expect(active[0].name).toBe("Team B");

    const inactive = all.filter((c) => !c.isActive);
    expect(inactive).toHaveLength(1);
    expect(inactive[0].id).toBe(id1);
  });

  it("only one credential is active after switching", () => {
    const id1 = insertCred(db, { name: "A", isActive: true });
    const id2 = insertCred(db, { name: "B", isActive: false });
    const id3 = insertCred(db, { name: "C", isActive: false });

    // Switch to C
    db.update(schema.ascCredentials).set({ isActive: false }).run();
    db.update(schema.ascCredentials)
      .set({ isActive: true })
      .where(eq(schema.ascCredentials.id, id3))
      .run();

    const active = db
      .select()
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .all();

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id3);
  });

  it("re-activating the already active credential keeps exactly one active", () => {
    const id1 = insertCred(db, { name: "Only", isActive: true });

    db.update(schema.ascCredentials).set({ isActive: false }).run();
    db.update(schema.ascCredentials)
      .set({ isActive: true })
      .where(eq(schema.ascCredentials.id, id1))
      .run();

    const active = db
      .select()
      .from(schema.ascCredentials)
      .where(eq(schema.ascCredentials.isActive, true))
      .all();

    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(id1);
  });
});
