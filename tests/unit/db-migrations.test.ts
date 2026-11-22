import { describe, it, expect, afterEach } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** A copy of the migrations folder holding only those before `tag`. */
function migrationsBefore(tag: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "itsyconnect-migrations-"));
  cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const cut = journal.entries.findIndex((e: { tag: string }) => e.tag === tag);
  journal.entries = journal.entries.slice(0, cut);
  writeFileSync(journalPath, JSON.stringify(journal));
  tempDirs.push(dir);
  return dir;
}

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("0009_rerun_analytics_backfill", () => {
  it("clears the backfill marks so every app backfills again after the upgrade", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: migrationsBefore("0009_rerun_analytics_backfill") });
    sqlite.prepare("INSERT INTO analytics_backfill (app_id, completed_at) VALUES (?, ?)").run("app-1", "2026-11-01T00:00:00.000Z");

    migrate(db, { migrationsFolder: MIGRATIONS });

    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM analytics_backfill").get()).toEqual({ n: 0 });
  });

  it("leaves marks made after the upgrade alone", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: MIGRATIONS });
    sqlite.prepare("INSERT INTO analytics_backfill (app_id, completed_at) VALUES (?, ?)").run("app-1", "2026-11-23T00:00:00.000Z");

    migrate(db, { migrationsFolder: MIGRATIONS });

    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM analytics_backfill").get()).toEqual({ n: 1 });
  });
});
