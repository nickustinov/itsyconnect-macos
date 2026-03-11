# Database and migrations

SQLite database managed by [Drizzle ORM](https://orm.drizzle.team/) with `better-sqlite3`.

## Architecture

- **Schema**: `src/db/schema.ts` – single source of truth for all tables
- **Connection**: `src/db/index.ts` – lazy-init singleton, auto-runs migrations on first access
- **Migrations**: `drizzle/` folder – numbered SQL files + snapshot JSON metadata
- **Config**: `drizzle.config.ts` – tells `drizzle-kit` where the schema and output live

## How migrations work

Drizzle uses a **journal** (`drizzle/meta/_journal.json`) that lists every migration by index and tag. Each migration has:

1. **SQL file** (`drizzle/NNNN_name.sql`) – the actual DDL statements
2. **Snapshot file** (`drizzle/meta/NNNN_snapshot.json`) – full schema state after this migration

The migrator reads the journal, checks which migrations have been applied (via a `__drizzle_migrations` table in SQLite), and runs any pending ones in order.

**Critical**: every migration listed in `_journal.json` **must** have both an SQL file and a snapshot file. Missing snapshots cause the migrator to skip or fail silently, leaving tables uncreated.

## Adding a new table

1. Add the table definition to `src/db/schema.ts`
2. Run `npx drizzle-kit generate` – this creates the SQL file and snapshot automatically
3. Verify the generated SQL in `drizzle/NNNN_*.sql`
4. Verify the snapshot was created in `drizzle/meta/NNNN_snapshot.json`
5. Verify `drizzle/meta/_journal.json` has the new entry
6. Test: delete your local database and restart the app – all tables should be created from scratch

## Adding a column to an existing table

1. Add the column to the table in `src/db/schema.ts`
2. Run `npx drizzle-kit generate`
3. Check the generated `ALTER TABLE ... ADD COLUMN` SQL
4. Verify snapshot and journal as above
5. Test both fresh database and migration from previous state

## Safety net

`src/db/index.ts` has a safeguard block that runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN` statements after drizzle's migrator. This catches cases where the migrator fails (e.g. missing snapshots from a bad release). When adding new tables or columns, add a corresponding safeguard statement there.

## Checklist before committing migration changes

- [ ] SQL file exists in `drizzle/`
- [ ] Snapshot file exists in `drizzle/meta/`
- [ ] Journal entry exists in `drizzle/meta/_journal.json`
- [ ] Safeguard statement added to `src/db/index.ts`
- [ ] Fresh database test passes (delete db file, restart app)
- [ ] Incremental migration test passes (start app with old db, verify new schema)

## Common mistakes

- **Manually writing migration SQL without running `drizzle-kit generate`** – this skips snapshot generation and breaks the migrator for future runs
- **Editing `_journal.json` by hand** – the `idx`, `tag`, and `when` fields must match the actual files
- **Forgetting `NOT NULL`** – SQLite is lenient about this but the schema should match the migration SQL; use `.notNull().default(value)` in the schema definition
