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

/**
 * Decorates a SqliteDatabase to (a) record every executed statement and (b)
 * optionally inject a failure on a chosen statement. Lets specs pin behavior the
 * end-state alone can't — e.g. that a transaction issues BEGIN then ROLLBACK and
 * never COMMIT on a mid-transaction failure, or that re-running migrations emits
 * no DDL. The fault is thrown BEFORE delegating, so the inner DB never sees the
 * failed statement (mirroring a write that errors).
 */
export class RecordingSqliteDatabase implements SqliteDatabase {
  /** Every SQL string passed to execute(), in order. */
  readonly executed: string[] = [];

  constructor(
    private readonly inner: SqliteDatabase,
    private readonly failOn?: (sql: string) => boolean,
  ) {}

  /** Leading keyword of each executed statement, upper-cased (BEGIN, COMMIT, …). */
  get verbs(): string[] {
    return this.executed.map(sql => sql.trim().split(/\s+/)[0].toUpperCase());
  }

  async execute(sql: string, params?: readonly SqlParam[]): Promise<SqlResult> {
    this.executed.push(sql);
    if (this.failOn?.(sql)) {
      throw new Error(`RecordingSqliteDatabase: injected failure on: ${sql}`);
    }
    return this.inner.execute(sql, params);
  }

  async close(): Promise<void> {
    return this.inner.close();
  }
}
