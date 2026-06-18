/**
 * withTransaction — the BEGIN/COMMIT/ROLLBACK primitive the persistence layer
 * builds on.
 *
 * Tested against real in-memory node:sqlite so a rollback genuinely discards an
 * already-executed write (not just statement-level atomicity), and via a
 * recording decorator so the BEGIN→COMMIT vs BEGIN→ROLLBACK ordering — and the
 * "never COMMIT after a failure" guarantee — are pinned, not merely implied by
 * the end state.
 *
 * @format
 */

import { withTransaction } from '@services/persistence/sqlite/SqliteDatabase';
import type { SqliteDatabase } from '@services/persistence/sqlite/SqliteDatabase';
import { runMigrations } from '@services/persistence/migrations';
import { RecordingSqliteDatabase, TestSqliteDatabase } from './testDatabase';

const INSERT_ONE =
  'INSERT INTO collection_entries ' +
  '(card_id, quantity, finish, condition, notes, added_at, updated_at) ' +
  'VALUES (?,?,?,?,?,?,?)';
const ROW = ['TFC-1', 1, 'normal', 'NM', null, 't', 't'] as const;

describe('withTransaction', () => {
  let inner: TestSqliteDatabase;

  beforeEach(async () => {
    inner = new TestSqliteDatabase();
    await runMigrations(inner);
  });

  afterEach(async () => {
    await inner.close();
  });

  test('commits on success: the work persists, ordered BEGIN → work → COMMIT', async () => {
    const db = new RecordingSqliteDatabase(inner);

    const result = await withTransaction(db, async () => {
      await db.execute(INSERT_ONE, [...ROW]);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(db.verbs).toEqual(['BEGIN', 'INSERT', 'COMMIT']);
    expect(
      (await inner.execute('SELECT * FROM collection_entries')).rows,
    ).toHaveLength(1);
  });

  test('rolls back on failure: a prior successful write is discarded, COMMIT never issued', async () => {
    const db = new RecordingSqliteDatabase(inner);

    await expect(
      withTransaction(db, async () => {
        await db.execute(INSERT_ONE, [...ROW]); // succeeds inside the txn
        throw new Error('boom'); // a later step fails
      }),
    ).rejects.toThrow('boom');

    expect(db.verbs).toEqual(['BEGIN', 'INSERT', 'ROLLBACK']);
    expect(db.verbs).not.toContain('COMMIT');
    // the inserted row was rolled back — real multi-statement atomicity
    expect(
      (await inner.execute('SELECT * FROM collection_entries')).rows,
    ).toHaveLength(0);
  });

  test('a failing ROLLBACK surfaces the original error, not the rollback error', async () => {
    const calls: string[] = [];
    const fake: SqliteDatabase = {
      execute: async sql => {
        calls.push(sql.toUpperCase());
        if (sql.toUpperCase() === 'ROLLBACK') {
          throw new Error('rollback failed');
        }
        return { rows: [], rowsAffected: 0 };
      },
      close: async () => {},
    };

    await expect(
      withTransaction(fake, async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow('original');
    expect(calls).toEqual(['BEGIN', 'ROLLBACK']);
  });
});
