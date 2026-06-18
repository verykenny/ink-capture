/**
 * Public surface of the persistence layer.
 *
 * Re-exports the contracts (still defined in CollectionRepository.ts, the
 * canonical type site) alongside the SQLite implementation: the repository and
 * PersistenceService factories, the DB bootstrap (openDatabase), and the driver
 * seam consumers need to wire a custom adapter.
 *
 * @format
 */

export * from './CollectionRepository';
export {
  createCollectionRepository,
  type RepositoryDeps,
} from './SqliteCollectionRepository';
export { openDatabase, createPersistenceService } from './connection';
export { runMigrations, MIGRATIONS } from './migrations';
export {
  withTransaction,
  type SqliteDatabase,
  type SqlParam,
  type SqlResult,
} from './sqlite/SqliteDatabase';
