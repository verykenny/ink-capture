/**
 * SqliteCollectionRepository — CRUD + merge-on-insert against real in-memory
 * SQLite (node:sqlite via the SqliteDatabase seam).
 *
 * getById/list/update/remove are exercised against rows seeded with raw adapter
 * SQL (independent of add()); add()'s create/increment merge is then driven
 * through resolveAddition end-to-end. A fixed (or stepping) clock makes the
 * timestamps deterministic.
 *
 * @format
 */

import { createCollectionRepository } from '@services/persistence/SqliteCollectionRepository';
import { runMigrations } from '@services/persistence/migrations';
import type { SqlParam } from '@services/persistence/sqlite/SqliteDatabase';
import type { CollectionRepository } from '@services';
import { RecordingSqliteDatabase, TestSqliteDatabase } from './testDatabase';
import { newEntry } from '../fixtures/cards';

const FIXED_NOW = '2026-06-17T12:00:00.000Z';

/** A clock that returns each timestamp in turn, then sticks on the last. */
const stepClock = (...times: string[]): (() => string) => {
  let index = 0;
  return () => times[Math.min(index++, times.length - 1)];
};

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

    test('leaves unmentioned mutable columns (cardId/finish/condition) untouched', async () => {
      const id = await seed(db, {
        cardId: 'TFC-115',
        finish: 'foil',
        condition: 'MP',
        quantity: 1,
      });

      const updated = await repo.update(id, { quantity: 9 });

      expect(updated.cardId).toBe('TFC-115');
      expect(updated.finish).toBe('foil');
      expect(updated.condition).toBe('MP');
      expect(updated.quantity).toBe(9);
      // and it round-trips through the DB unchanged
      expect(await repo.getById(id)).toEqual(updated);
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

    test('an edit onto an occupied stack MERGES (summed quantity, source deleted, one row)', async () => {
      // Supersedes the old B3 "rejects (UNIQUE)" contract: moving a row onto
      // another stack's identity now folds the two together transactionally.
      const normalId = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
      });
      const foilId = await seed(db, {
        cardId: 'C',
        finish: 'foil',
        quantity: 3,
      });

      const merged = await repo.update(normalId, { finish: 'foil' });

      // The foil stack absorbs the normal stack: target id, summed quantity.
      expect(merged.id).toBe(foilId);
      expect(merged.finish).toBe('foil');
      expect(merged.quantity).toBe(5); // 3 (target) + 2 (source)
      expect(merged.updatedAt).toBe(FIXED_NOW);
      // The source row is gone and only the merged stack remains.
      expect(await repo.getById(normalId)).toBeNull();
      expect(await repo.list()).toHaveLength(1);
    });

    test('a simultaneous quantity-and-identity edit merges the SOURCE’s RESULTING quantity', async () => {
      // Distinguishes summing the source's resulting quantity (the edited value)
      // from summing its stale current quantity: current=2, resulting=10, so a
      // regression to current would give 3+2=5 instead of the correct 3+10=13.
      const normalId = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
      });
      const foilId = await seed(db, {
        cardId: 'C',
        finish: 'foil',
        quantity: 3,
      });

      const merged = await repo.update(normalId, {
        finish: 'foil',
        quantity: 10,
      });

      expect(merged.id).toBe(foilId);
      expect(merged.quantity).toBe(13); // 3 (target) + 10 (source's RESULTING qty)
      expect(await repo.getById(normalId)).toBeNull();
      expect(await repo.list()).toHaveLength(1);
    });

    test('a free re-key (identity onto an unoccupied tuple) updates in place — no merge', async () => {
      const id = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
      });

      const updated = await repo.update(id, { finish: 'foil' });

      expect(updated.id).toBe(id); // same row, re-keyed (not a merge target)
      expect(updated.finish).toBe('foil');
      expect(updated.quantity).toBe(2); // untouched
      expect(updated.updatedAt).toBe(FIXED_NOW);
      expect(await repo.list()).toHaveLength(1);
    });

    test('editing a field onto its own identity updates in place (no self-merge, no delete)', async () => {
      const id = await seed(db, {
        cardId: 'C',
        finish: 'foil',
        quantity: 1,
        updatedAt: '2020-01-01T00:00:00.000Z',
      });

      // finish is unchanged → resulting identity == current; the row must not
      // try to merge into itself (self is excluded from the identity query).
      const updated = await repo.update(id, { finish: 'foil' });

      expect(updated.id).toBe(id);
      expect(updated.finish).toBe('foil');
      expect(updated.updatedAt).toBe(FIXED_NOW); // a mappable field → bumped
      expect(await repo.list()).toHaveLength(1);
    });

    test('on a merge the target keeps its notes and the source notes are dropped', async () => {
      const normalId = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
        notes: 'source notes',
      });
      await seed(db, {
        cardId: 'C',
        finish: 'foil',
        quantity: 3,
        notes: 'target notes',
      });

      const merged = await repo.update(normalId, { finish: 'foil' });

      expect(merged.quantity).toBe(5);
      expect(merged.notes).toBe('target notes'); // target's notes kept (mirrors add())
      expect(await repo.getById(normalId)).toBeNull(); // source + its notes gone
    });

    test('a merge runs in one transaction: BEGIN → COMMIT, never ROLLBACK', async () => {
      const normalId = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
      });
      await seed(db, { cardId: 'C', finish: 'foil', quantity: 3 });
      const recording = new RecordingSqliteDatabase(db);
      const r = createCollectionRepository(recording, { now: () => FIXED_NOW });

      await r.update(normalId, { finish: 'foil' });

      expect(recording.verbs).toContain('BEGIN');
      expect(recording.verbs).toContain('COMMIT');
      expect(recording.verbs).not.toContain('ROLLBACK');
    });

    test('a mid-merge failure rolls back atomically: BEGIN → ROLLBACK, both rows intact', async () => {
      const normalId = await seed(db, {
        cardId: 'C',
        finish: 'normal',
        quantity: 2,
      });
      const foilId = await seed(db, {
        cardId: 'C',
        finish: 'foil',
        quantity: 3,
      });
      // Fail the source DELETE — AFTER the target was already bumped — so a
      // half-applied merge would persist unless the whole thing is atomic.
      const recording = new RecordingSqliteDatabase(db, sql =>
        /^DELETE/i.test(sql.trim()),
      );
      const r = createCollectionRepository(recording, { now: () => FIXED_NOW });

      await expect(r.update(normalId, { finish: 'foil' })).rejects.toThrow(
        /injected/,
      );

      expect(recording.verbs).toContain('BEGIN');
      expect(recording.verbs).toContain('ROLLBACK');
      expect(recording.verbs).not.toContain('COMMIT');
      // The target bump was rolled back and the source survives untouched.
      expect((await repo.getById(foilId))?.quantity).toBe(3);
      expect((await repo.getById(normalId))?.finish).toBe('normal');
      expect(await repo.list()).toHaveLength(2);
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

  describe('add (merge-on-insert)', () => {
    test('create: first add inserts a new stack with an id + equal timestamps from one clock read', async () => {
      // A stepping clock proves added_at and updated_at come from a SINGLE now()
      // read on create: a second read would surface 'T2'.
      const r = createCollectionRepository(db, { now: stepClock('T1', 'T2') });

      const created = await r.add(newEntry({ quantity: 2, notes: 'first' }));

      expect(created.id).toBeTruthy();
      expect(created.quantity).toBe(2);
      expect(created.notes).toBe('first');
      expect(created.addedAt).toBe('T1');
      expect(created.updatedAt).toBe('T1');
      // round-trips through the DB exactly as returned
      expect(await r.getById(created.id)).toEqual(created);
    });

    test('create: omitted notes persist as no notes', async () => {
      const r = createCollectionRepository(db, { now: () => FIXED_NOW });
      const created = await r.add(newEntry());
      expect(created.notes).toBeUndefined();
    });

    test('increment: a second add of the same identity sums quantity, bumps updatedAt, and preserves addedAt + the original notes', async () => {
      const r = createCollectionRepository(db, { now: stepClock('T1', 'T2') });

      const created = await r.add(newEntry({ quantity: 2, notes: 'original' }));
      const incremented = await r.add(
        newEntry({ quantity: 3, notes: 'dropped on increment' }),
      );

      expect(incremented.id).toBe(created.id); // same stack, not a new row
      expect(incremented.quantity).toBe(5); // 2 + 3
      expect(incremented.notes).toBe('original'); // incoming notes dropped (B1)
      expect(incremented.addedAt).toBe('T1'); // preserved
      expect(incremented.updatedAt).toBe('T2'); // bumped
      expect(await r.list()).toHaveLength(1);
    });

    test('duplicate identity is structurally impossible: repeated adds always increment one row', async () => {
      const r = createCollectionRepository(db, { now: () => FIXED_NOW });

      await r.add(newEntry({ quantity: 1 }));
      await r.add(newEntry({ quantity: 1 }));
      await r.add(newEntry({ quantity: 1 }));

      const rows = await r.list();
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe(3);
    });

    test('distinct identities create separate stacks', async () => {
      const r = createCollectionRepository(db, { now: () => FIXED_NOW });

      await r.add(newEntry({ finish: 'normal', condition: 'NM' }));
      await r.add(newEntry({ finish: 'foil', condition: 'NM' })); // different finish
      await r.add(newEntry({ finish: 'normal', condition: 'LP' })); // different condition
      await r.add(newEntry({ cardId: 'OTHER' })); // different card

      expect(await r.list()).toHaveLength(4);
    });

    test('a constraint violation in add() rejects and persists nothing', async () => {
      const r = createCollectionRepository(db, { now: () => FIXED_NOW });

      // quantity 0 is type-valid but fails the CHECK; the insert must not persist.
      await expect(
        r.add({
          cardId: 'BAD',
          quantity: 0,
          finish: 'normal',
          condition: 'NM',
        }),
      ).rejects.toThrow();
      expect(await r.list()).toHaveLength(0);
    });

    test('runs inside a transaction: a failed write triggers BEGIN → ROLLBACK, never COMMIT', async () => {
      // Force the INSERT itself to fail (a real CHECK-violation insert is atomic
      // on its own, so it can't prove the wrapper exists). The recording seam
      // pins that add() opens and rolls back a transaction around the write.
      const recording = new RecordingSqliteDatabase(db, sql =>
        /INSERT INTO/i.test(sql),
      );
      const r = createCollectionRepository(recording, { now: () => FIXED_NOW });

      await expect(r.add(newEntry())).rejects.toThrow(/injected/);

      expect(recording.verbs).toContain('BEGIN');
      expect(recording.verbs).toContain('ROLLBACK');
      expect(recording.verbs).not.toContain('COMMIT');
      // nothing reached the underlying DB
      expect(
        (await db.execute('SELECT * FROM collection_entries')).rows,
      ).toHaveLength(0);
    });
  });
});
