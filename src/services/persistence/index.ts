/**
 * Public surface of the persistence layer.
 *
 * Re-exports the contracts (still defined in CollectionRepository.ts, the
 * canonical type site) alongside the SQLite implementation: the DB bootstrap
 * (openDatabase), the PersistenceService factory, and the driver seam consumers
 * need to wire a custom adapter. The repository factory is added by B3's CRUD
 * commit.
 *
 * @format
 */

export * from './CollectionRepository';
export { openDatabase, createPersistenceService } from './connection';
export { runMigrations, MIGRATIONS } from './migrations';
export {
  withTransaction,
  type SqliteDatabase,
  type SqlParam,
  type SqlResult,
} from './sqlite/SqliteDatabase';
