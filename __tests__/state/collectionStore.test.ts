/**
 * collectionStore — the Zustand vanilla store over a CollectionRepository.
 *
 * Built over the REAL SqliteCollectionRepository on a TestSqliteDatabase
 * (node:sqlite) — exactly the production repository + SQL — so merge-on-insert
 * (re-adding the same identity bumps quantity, never a duplicate row) is proven
 * through the store, not faked. Only the failure-path test swaps in a recording
 * adapter that injects a SELECT failure to drive the error branch.
 *
 * @format
 */

import { createCollectionStore } from '@state';
import type { CollectionStatus } from '@state';
import {
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import type { CollectionRepository } from '@services';
import {
  RecordingSqliteDatabase,
  TestSqliteDatabase,
} from '../persistence/testDatabase';
import { newEntry } from '../fixtures/cards';

const FIXED_NOW = '2026-06-17T12:00:00.000Z';

/** A store wired over the real repo on a fresh in-memory database. */
const makeStore = async (): Promise<{
  db: TestSqliteDatabase;
  repo: CollectionRepository;
  store: ReturnType<typeof createCollectionStore>;
}> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  return { db, repo, store: createCollectionStore(repo) };
};

describe('createCollectionStore', () => {
  test('starts idle with no entries', async () => {
    const { db, store } = await makeStore();
    expect(store.getState().status).toBe('idle');
    expect(store.getState().entries).toEqual([]);
    await db.close();
  });

  describe('load', () => {
    test('populates entries from the repository', async () => {
      const { db, repo, store } = await makeStore();
      await repo.add(newEntry({ quantity: 2 }));

      await store.getState().load();

      expect(store.getState().status).toBe('ready');
      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0].quantity).toBe(2);
      await db.close();
    });

    test('transitions idle → loading → ready', async () => {
      const { db, store } = await makeStore();
      const seen: CollectionStatus[] = [];
      const unsub = store.subscribe(state => seen.push(state.status));

      await store.getState().load();
      unsub();

      expect(seen).toEqual(['loading', 'ready']);
      await db.close();
    });

    test('a repository failure sets status:error and records the message', async () => {
      const db = new TestSqliteDatabase();
      await createPersistenceService(db).init();
      // Fail the list() SELECT so load()'s error branch runs against a real repo.
      const recording = new RecordingSqliteDatabase(db, sql =>
        /^SELECT/i.test(sql.trim()),
      );
      const repo = createCollectionRepository(recording, {
        now: () => FIXED_NOW,
      });
      const store = createCollectionStore(repo);

      await store.getState().load();

      expect(store.getState().status).toBe('error');
      expect(store.getState().error).toMatch(/injected/);
      await db.close();
    });
  });

  describe('add', () => {
    test('persists a new entry and reflects it in state', async () => {
      const { db, store } = await makeStore();

      const created = await store.getState().add(newEntry({ quantity: 1 }));

      expect(created.id).toBeTruthy();
      expect(store.getState().status).toBe('ready');
      expect(store.getState().entries).toHaveLength(1);
      expect(store.getState().entries[0].id).toBe(created.id);
      await db.close();
    });

    test('re-adding the same identity increments quantity, not a duplicate row', async () => {
      const { db, store } = await makeStore();

      await store.getState().add(newEntry({ quantity: 1 }));
      await store.getState().add(newEntry({ quantity: 2 })); // same card+finish+condition

      const { entries } = store.getState();
      expect(entries).toHaveLength(1); // merge-on-insert, not a second row
      expect(entries[0].quantity).toBe(3);
      await db.close();
    });

    test('distinct identities create separate entries', async () => {
      const { db, store } = await makeStore();

      await store.getState().add(newEntry({ finish: 'normal' }));
      await store.getState().add(newEntry({ finish: 'foil' }));

      expect(store.getState().entries).toHaveLength(2);
      await db.close();
    });

    test('a rejected write sets status:error and rethrows', async () => {
      const { db, store } = await makeStore();

      // quantity 0 is type-valid but violates the schema CHECK.
      await expect(
        store.getState().add(newEntry({ quantity: 0 })),
      ).rejects.toThrow();
      expect(store.getState().status).toBe('error');
      expect(store.getState().entries).toEqual([]);
      await db.close();
    });
  });
});
