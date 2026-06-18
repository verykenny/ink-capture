/**
 * Test-only SqliteDatabase adapter over Node's built-in node:sqlite engine.
 *
 * NOT a spec — it is excluded from Jest's testMatch via testPathIgnorePatterns.
 * It lets the migration + repository specs run the SAME SQL the production
 * OpSqliteDatabase runs, against a real SQLite engine, so the UNIQUE index,
 * CHECK constraints, and merge-on-insert are genuinely enforced in Jest rather
 * than faked.
 *
 * Why node:sqlite and not a native devDependency (e.g. better-sqlite3): native
 * (.node) addons load once per process, but Jest gives each test FILE its own
 * module sandbox. The second file to import the addon re-runs process.dlopen on
 * the already-loaded binary, which corrupts its state so that CHECK/UNIQUE
 * violations silently stop throwing — a non-deterministic suite. node:sqlite is
 * compiled into Node itself: no dlopen, no per-file corruption, deterministic
 * across the whole suite, and zero extra dependency.
 *
 * @format
 */

import { DatabaseSync } from 'node:sqlite';
import type {
  SqliteDatabase,
  SqlParam,
  SqlResult,
} from '@services/persistence/sqlite/SqliteDatabase';

export class TestSqliteDatabase implements SqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename);
  }

  async execute(sql: string, params?: readonly SqlParam[]): Promise<SqlResult> {
    const bind = params ? [...params] : [];
    const statement = this.db.prepare(sql);
    // columns().length > 0 ⇒ the statement yields rows (SELECT / RETURNING /
    // PRAGMA-read); otherwise it is a write or DDL. Mirrors how op-sqlite splits
    // result-returning statements from writes.
    if (statement.columns().length > 0) {
      const rows = statement.all(...bind) as Array<Record<string, unknown>>;
      return { rows, rowsAffected: 0 };
    }
    const info = statement.run(...bind);
    return {
      rows: [],
      rowsAffected: Number(info.changes),
      insertId: Number(info.lastInsertRowid),
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
