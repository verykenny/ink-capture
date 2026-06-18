/**
 * Database bootstrap and the PersistenceService implementation.
 *
 * openDatabase() wires the production op-sqlite adapter; createPersistenceService
 * gives the composition root a PersistenceService whose init() applies pending
 * migrations. Both take/return the SqliteDatabase seam, so tests can substitute
 * an in-memory engine without touching the native binding.
 *
 * @format
 */

import type { PersistenceService } from './CollectionRepository';
import { runMigrations } from './migrations';
import {
  OpSqliteDatabase,
  type OpSqliteOptions,
} from './sqlite/OpSqliteDatabase';
import type { SqliteDatabase } from './sqlite/SqliteDatabase';

/** Open the production (op-sqlite) database. The composition root calls this once. */
export const openDatabase = (options?: OpSqliteOptions): SqliteDatabase =>
  new OpSqliteDatabase(options);

/**
 * A PersistenceService over any SqliteDatabase: init() runs forward-only
 * migrations (idempotent), bringing the schema to the latest version.
 */
export const createPersistenceService = (
  db: SqliteDatabase,
): PersistenceService => ({
  init: () => runMigrations(db),
});
