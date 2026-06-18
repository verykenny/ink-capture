/**
 * Production {@link SqliteDatabase} backed by op-sqlite's JSI driver.
 *
 * This is the ONLY module that imports @op-engineering/op-sqlite. Every other
 * file in the persistence layer depends solely on the SqliteDatabase seam, so
 * the native binding is isolated here — which is exactly why the rest of the
 * layer is unit-testable against an in-memory engine.
 *
 * @format
 */

import { open, type DB } from '@op-engineering/op-sqlite';
import type { SqliteDatabase, SqlParam, SqlResult } from './SqliteDatabase';

/** Default on-device database file name. */
export const DATABASE_NAME = 'inkcapture.db';

/** Options for opening the production database (all optional; sensible defaults). */
export interface OpSqliteOptions {
  name?: string;
  location?: string;
}

export class OpSqliteDatabase implements SqliteDatabase {
  private readonly db: DB;

  constructor(options: OpSqliteOptions = {}) {
    // Build params WITHOUT a `location` key unless one is provided: op-sqlite's
    // native open() rejects `location: undefined` ("Value is undefined, expected
    // a String") and crashes the app, whereas an absent key uses the default
    // location. (Caught on the iOS simulator — the mocked unit tests can't see it.)
    const params: { name: string; location?: string } = {
      name: options.name ?? DATABASE_NAME,
    };
    if (options.location !== undefined) {
      params.location = options.location;
    }
    this.db = open(params);
  }

  async execute(sql: string, params?: readonly SqlParam[]): Promise<SqlResult> {
    // Omit the params arg entirely when there are none — don't hand the native
    // bridge an explicit `undefined`.
    const result = await (params
      ? this.db.execute(sql, [...params])
      : this.db.execute(sql));
    return {
      rows: result.rows ?? [],
      rowsAffected: result.rowsAffected ?? 0,
      insertId: result.insertId,
    };
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
