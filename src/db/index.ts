import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

let _sqlite: InstanceType<typeof Database> | null = null;
let _db: DrizzleDB | null = null;

function init() {
  if (_db) return { sqlite: _sqlite!, db: _db };

  const dbPath = process.env.DATABASE_PATH;
  if (!dbPath) {
    throw new Error("DATABASE_PATH environment variable is not set");
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _sqlite.pragma("busy_timeout = 5000");
  _sqlite.pragma("synchronous = NORMAL");

  _db = drizzle(_sqlite, { schema });

  migrate(_db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  // Safety net: ensure schema from all migrations exists even if drizzle's
  // migrator skipped some (e.g. missing snapshot files in a prior release).
  // ALTER TABLE fails silently if column already exists; CREATE TABLE IF NOT
  // EXISTS is naturally idempotent.
  const safeguardStatements = [
    "ALTER TABLE ai_settings ADD COLUMN base_url text",
    "ALTER TABLE asc_credentials ADD COLUMN is_demo integer DEFAULT false",
    "CREATE TABLE IF NOT EXISTS app_preferences (key text PRIMARY KEY NOT NULL, value text NOT NULL)",
  ];
  for (const stmt of safeguardStatements) {
    try { _sqlite.exec(stmt); } catch { /* already applied */ }
  }

  return { sqlite: _sqlite, db: _db };
}

export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop, receiver) {
    return Reflect.get(init().db, prop, receiver);
  },
});

export const sqlite = new Proxy({} as InstanceType<typeof Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(init().sqlite, prop, receiver);
  },
});

export type DbClient = DrizzleDB;
