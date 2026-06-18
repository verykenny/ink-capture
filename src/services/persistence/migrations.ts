/**
 * Forward-only schema migrations and the runner that applies them.
 *
 * Versioning uses SQLite's PRAGMA user_version: every migration whose index is
 * >= the stored version runs once, each inside a transaction, then user_version
 * is advanced to MIGRATIONS.length. Re-running on an up-to-date DB is a no-op
 * (idempotent), and every migration is itself idempotent (IF NOT EXISTS). There
 * are no down migrations — this is forward-only by design.
 *
 * @format
 */

import { withTransaction, type SqliteDatabase } from './sqlite/SqliteDatabase';

/**
 * Migration 001 — the collection store and its identity UNIQUE index.
 *
 * The UNIQUE index on (card_id, finish, condition) is the structural backstop
 * for B1's merge rule: it makes more than one stack per identity impossible, so
 * resolveAddition's ">1 stack" corruption throw is unreachable in normal use.
 */
const migration001 = async (db: SqliteDatabase): Promise<void> => {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS collection_entries (
      id         INTEGER PRIMARY KEY,
      card_id    TEXT    NOT NULL,
      quantity   INTEGER NOT NULL CHECK (quantity > 0),
      finish     TEXT    NOT NULL CHECK (finish IN ('normal','foil')),
      condition  TEXT    NOT NULL CHECK (condition IN ('NM','LP','MP','HP','DMG')),
      notes      TEXT,
      added_at   TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    )`,
  );
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS ux_collection_identity
      ON collection_entries (card_id, finish, condition)`,
  );
};

/**
 * Migration 002 — the catalog cache. B3 creates the tables; B2 populates them.
 *
 * `catalog_cards` mirrors the Card model (LorcanaJSON-sourced, read-only), with
 * indexes for C1's lookups: an exact-hit (set_code, collector_number) — collector
 * numbers repeat across sets — and a normalized_name index for the fuzzy fallback.
 * `catalog_meta` is a generic key/value store for B2's catalog version/ETag.
 */
const migration002 = async (db: SqliteDatabase): Promise<void> => {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS catalog_cards (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      normalized_name    TEXT NOT NULL,
      version            TEXT,
      set_code           TEXT NOT NULL,
      collector_number   TEXT NOT NULL,
      rarity             TEXT NOT NULL,
      available_finishes TEXT NOT NULL,
      image_url          TEXT
    )`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS ix_catalog_collector
      ON catalog_cards (set_code, collector_number)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS ix_catalog_normalized_name
      ON catalog_cards (normalized_name)`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS catalog_meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    )`,
  );
};

/**
 * Ordered, forward-only migrations. Index 0 is schema version 1, index 1 is
 * version 2, and so on; the runner advances PRAGMA user_version to the array
 * length once all pending migrations have applied.
 */
export const MIGRATIONS: ReadonlyArray<(db: SqliteDatabase) => Promise<void>> =
  [migration001, migration002];

const readUserVersion = async (db: SqliteDatabase): Promise<number> => {
  const result = await db.execute('PRAGMA user_version');
  const value = result.rows[0]?.user_version;
  return typeof value === 'number' ? value : 0;
};

/**
 * Apply every migration whose index is >= the DB's current user_version, each in
 * its own transaction, then advance user_version to MIGRATIONS.length. Idempotent
 * at both levels: a DB already at the latest version runs nothing, and each
 * migration's DDL is itself re-runnable.
 */
export const runMigrations = async (db: SqliteDatabase): Promise<void> => {
  const startVersion = await readUserVersion(db);
  for (let index = startVersion; index < MIGRATIONS.length; index += 1) {
    const migration = MIGRATIONS[index];
    await withTransaction(db, () => migration(db));
  }
  if (startVersion < MIGRATIONS.length) {
    // PRAGMA values cannot be bound parameters; MIGRATIONS.length is a
    // controlled integer, so interpolating it is safe (no injection surface).
    await db.execute(`PRAGMA user_version = ${MIGRATIONS.length}`);
  }
};
