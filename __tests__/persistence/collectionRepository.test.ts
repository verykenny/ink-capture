/**
 * SqliteCollectionRepository — CRUD round-trips against real in-memory SQLite.
 *
 * Rows are seeded via raw adapter SQL so getById/list/update/remove are tested
 * independently of add() (whose merge logic lands in the next commit). A fixed
 * clock makes updated_at deterministic.
 *
 * @format
 */

import { createCollectionRepository } from '@services/persistence/SqliteCollectionRepository';
import { runMigrations } from '@services/persistence/migrations';
import type { SqlParam } from '@services/persistence/sqlite/SqliteDatabase';
import type { CollectionRepository } from '@services';
import { TestSqliteDatabase } from './testDatabase';

const FIXED_NOW = '2026-06-17T12:00:00.000Z';

/** Insert a row directly (bypassing add) and return its domain id. */
const seed = async (
  db: TestSqliteDatabase,
  overrides: Partial<{
    cardId: string;
    quantity: number;
    finish: string;
    condition: string;
    notes: SqlParam;
    addedAt: string;
    updatedAt: string;
  }> = {},
): Promise<string> => {
  const result = await db.execute(
    'INSERT INTO collection_entries ' +
      '(card_id, quantity, finish, condition, notes, added_at, updated_at) ' +
      'VALUES (?,?,?,?,?,?,?) RETURNING id',
    [
      overrides.cardId ?? 'TFC-042',
      overrides.quantity ?? 1,
      overrides.finish ?? 'normal',
      overrides.condition ?? 'NM',
      overrides.notes ?? null,
      overrides.addedAt ?? '2020-01-01T00:00:00.000Z',
      overrides.updatedAt ?? '2020-01-01T00:00:00.000Z',
    ],
  );
  return String(result.rows[0].id);
};

describe('SqliteCollectionRepository', () => {
  let db: TestSqliteDatabase;
  let repo: CollectionRepository;

  beforeEach(async () => {
    db = new TestSqliteDatabase();
    await runMigrations(db);
    repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('getById', () => {
    test('maps a stored row back to a CollectionEntry (snake → camel)', async () => {
      const id = await seed(db, {
        cardId: 'TFC-042',
        quantity: 3,
        finish: 'foil',
        condition: 'LP',
        notes: 'signed',
        addedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-02-02T00:00:00.000Z',
      });

      expect(await repo.getById(id)).toEqual({
        id,
        cardId: 'TFC-042',
        quantity: 3,
        finish: 'foil',
        condition: 'LP',
        notes: 'signed',
        addedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-02-02T00:00:00.000Z',
      });
    });

    test('a NULL-notes row maps to an entry with no notes', async () => {
      const id = await seed(db, { notes: null });
      const entry = await repo.getById(id);
      expect(entry).not.toBeNull();
      expect(entry?.notes).toBeUndefined();
      expect('notes' in (entry as object)).toBe(false);
    });

    test('returns null for an unknown id', async () => {
      expect(await repo.getById('9999')).toBeNull();
    });
  });

  describe('list', () => {
    test('returns every entry ordered by id', async () => {
      const first = await seed(db, { cardId: 'A' });
      const second = await seed(db, { cardId: 'B' });
      const third = await seed(db, { cardId: 'C' });

      const ids = (await repo.list()).map(entry => entry.id);
      expect(ids).toEqual([first, second, third]);
    });

    test('is empty when nothing is stored', async () => {
      expect(await repo.list()).toEqual([]);
    });
  });

  describe('update', () => {
    test('writes provided fields and bumps updated_at, leaving the rest', async () => {
      const id = await seed(db, {
        quantity: 1,
        notes: 'old',
        addedAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      });

      const updated = await repo.update(id, { quantity: 5, notes: 'new' });

      expect(updated.quantity).toBe(5);
      expect(updated.notes).toBe('new');
      expect(updated.updatedAt).toBe(FIXED_NOW);
      expect(updated.addedAt).toBe('2020-01-01T00:00:00.000Z'); // untouched
    });

    test('can clear notes by passing undefined', async () => {
      const id = await seed(db, { notes: 'remove me' });
      const updated = await repo.update(id, { notes: undefined });
      expect(updated.notes).toBeUndefined();
    });

    test('empty changes returns the current row unchanged (no updated_at bump)', async () => {
      const id = await seed(db, { updatedAt: '2020-01-01T00:00:00.000Z' });
      const updated = await repo.update(id, {});
      expect(updated.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    });

    test('throws for an unknown id', async () => {
      await expect(repo.update('9999', { quantity: 2 })).rejects.toThrow(
        /9999/,
      );
    });
  });

  describe('remove', () => {
    test('deletes an existing entry', async () => {
      const id = await seed(db);
      await repo.remove(id);
      expect(await repo.getById(id)).toBeNull();
    });

    test('is silent when the id does not exist', async () => {
      await expect(repo.remove('9999')).resolves.toBeUndefined();
    });
  });

  describe('add (stubbed until the merge-on-insert commit)', () => {
    test('throws an announced not-yet-implemented error', async () => {
      await expect(
        repo.add({
          cardId: 'TFC-042',
          quantity: 1,
          finish: 'normal',
          condition: 'NM',
        }),
      ).rejects.toThrow(/next commit/i);
    });
  });
});
