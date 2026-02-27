import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE asc_credentials (
      id TEXT PRIMARY KEY NOT NULL,
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
