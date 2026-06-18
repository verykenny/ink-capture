/**
 * Test-only SqliteDatabase adapter over an in-memory better-sqlite3 connection.
 *
 * NOT a spec — it is excluded from Jest's testMatch via testPathIgnorePatterns.
 * It lets the migration + repository specs run the SAME SQL the production
 * OpSqliteDatabase runs, against a real SQLite engine, so the UNIQUE index,
 * CHECK constraints, and merge-on-insert are genuinely enforced in Jest rather
 * than faked. The `.reader` branch mirrors how op-sqlite splits result-returning
 * statements (SELECT / RETURNING / PRAGMA-read) from writes and DDL.
 *
 * @format
 */

import Database from 'better-sqlite3';
import type {
  SqliteDatabase,
  SqlParam,
  SqlResult,
} from '@services/persistence/sqlite/SqliteDatabase';

export class BetterSqliteDatabase implements SqliteDatabase {
  private readonly db: Database.Database;

  constructor(filename = ':memory:') {
    this.db = new Database(filename);
  }

  async execute(sql: string, params?: readonly SqlParam[]): Promise<SqlResult> {
    const bind = params ? [...params] : [];
    const statement = this.db.prepare(sql);
    if (statement.reader) {
      const rows = statement.all(...bind) as Array<Record<string, unknown>>;
      return { rows, rowsAffected: 0 };
    }
    const info = statement.run(...bind);
    return {
      rows: [],
      rowsAffected: info.changes,
      insertId: Number(info.lastInsertRowid),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
