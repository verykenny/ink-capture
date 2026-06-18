/**
 * Driver seam between the persistence layer and the concrete SQLite engine.
 *
 * The repository and migrations depend only on this minimal interface — never on
 * op-sqlite directly — so the exact same SQL runs against op-sqlite on a device
 * (OpSqliteDatabase) and a real in-memory SQLite in Jest (BetterSqliteDatabase,
 * a test helper). That keeps the UNIQUE constraint, CHECKs, and merge-on-insert
 * genuinely enforced in tests rather than faked.
 *
 * @format
 */

/** The only scalar shapes the persistence layer binds to SQL placeholders. */
export type SqlParam = string | number | null;

/** Normalized result every adapter returns from {@link SqliteDatabase.execute}. */
export interface SqlResult {
  /** Result rows (SELECT or `RETURNING`); empty for non-returning writes/DDL. */
  rows: Array<Record<string, unknown>>;
  /** Rows changed by an INSERT/UPDATE/DELETE; 0 for reads and DDL. */
  rowsAffected: number;
  /** rowid of the last INSERT, when the engine reports one. */
  insertId?: number;
}

/** The minimal SQLite driver the persistence layer programs against. */
export interface SqliteDatabase {
  execute(sql: string, params?: readonly SqlParam[]): Promise<SqlResult>;
  close(): Promise<void>;
}

/**
 * Run `fn` inside a single transaction: BEGIN, then COMMIT on success or
 * ROLLBACK (and rethrow the original error) on any failure. A failing ROLLBACK
 * is swallowed so the original error is always what surfaces. Expressed only
 * through `execute`, keeping the seam minimal and engine-agnostic.
 */
export const withTransaction = async <T>(
  db: SqliteDatabase,
  fn: () => Promise<T>,
): Promise<T> => {
  await db.execute('BEGIN');
  try {
    const result = await fn();
    await db.execute('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      // Surface the original failure, not a rollback hiccup.
    }
    throw error;
  }
};
