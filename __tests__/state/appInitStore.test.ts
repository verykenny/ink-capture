/**
 * appInitStore — the startup state machine that gates the app.
 *
 * Pure orchestration over the persistence / catalog / collection-store ports, so
 * it is driven entirely by fakes — no native DB, no real network. The collection
 * store is the REAL vanilla store over a TestSqliteDatabase (node:sqlite) so
 * "the collection was loaded" is proven, not mocked; the catalog is a hand fake
 * whose `getAllCards` models the LOCAL cache and whose `sync` models the network.
 *
 * The headline guard is the offline-with-cache bug fix: a cached catalog must
 * boot straight to `ready` even when the network (sync) is down — the cache check
 * is a LOCAL read that must precede any network call.
 *
 * @format
 */

import { createAppInitStore, createCollectionStore } from '@state';
import type { AppInitPhase } from '@state';
import {
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService, PersistenceService } from '@services';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA, newEntry } from '../fixtures/cards';

const FIXED_NOW = '2026-06-21T00:00:00.000Z';

/**
 * A real collection store over a fresh in-memory DB. When `seed` is set the row
 * is written to the DB directly (not through the store), so the store starts
 * empty and only surfaces the row if start() actually runs load().
 */
const makeCollection = async (
  seed: boolean,
): Promise<{
  db: TestSqliteDatabase;
  collectionStore: ReturnType<typeof createCollectionStore>;
}> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  if (seed) {
    await repo.add(newEntry({ quantity: 2 }));
  }
  return { db, collectionStore: createCollectionStore(repo) };
};

const okPersistence = (): PersistenceService => ({
  init: jest.fn(async () => undefined),
});

const failingPersistence = (message: string): PersistenceService => ({
  init: jest.fn(async () => {
    throw new Error(message);
  }),
});

/** A catalog fake: `getAllCards` is the LOCAL cache, `sync` is the network. */
const fakeCatalog = (over: Partial<CatalogService> = {}): CatalogService => ({
  sync: jest.fn(async () => ({ updated: false })),
  getAllCards: jest.fn(async () => []),
  findByCollectorNumber: jest.fn(async () => null),
  ...over,
});

/** Let a fire-and-forget background sync settle before asserting. */
const flush = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

describe('createAppInitStore', () => {
  test('first run with no cache downloads the catalog, then becomes ready', async () => {
    const { db, collectionStore } = await makeCollection(false);
    const catalog = fakeCatalog({
      getAllCards: jest.fn(async () => []), // no local cache yet
      sync: jest.fn(async () => ({ updated: true })),
    });
    const store = createAppInitStore({
      persistence: okPersistence(),
      catalog,
      collectionStore,
    });
    const seen: AppInitPhase[] = [];
    const unsub = store.subscribe(s => seen.push(s.phase));

    await store.getState().start();
    unsub();

    expect(seen).toEqual(['starting', 'first-run-downloading', 'ready']);
    expect(catalog.sync).toHaveBeenCalledTimes(1);
    await db.close();
  });

  test('offline WITH a cached catalog → ready (the bug fix): never blocks on the network', async () => {
    const { db, collectionStore } = await makeCollection(true);
    const catalog = fakeCatalog({
      getAllCards: jest.fn(async () => [CARD_ELSA]), // local cache present
      sync: jest.fn(async () => {
        throw new Error('offline'); // the network is down
      }),
    });
    const store = createAppInitStore({
      persistence: okPersistence(),
      catalog,
      collectionStore,
    });

    await store.getState().start();
    await flush(); // let the fire-and-forget background refresh settle

    expect(store.getState().phase).toBe('ready'); // NOT 'error'
    expect(store.getState().error).toBeUndefined();
    // The cache is intact and the persisted collection was loaded into the store.
    expect(await catalog.getAllCards()).toHaveLength(1);
    expect(collectionStore.getState().entries).toHaveLength(1);
    await db.close();
  });

  test('a background-sync failure is swallowed and never disturbs the ready app', async () => {
    const { db, collectionStore } = await makeCollection(false);
    const sync = jest.fn(async () => {
      throw new Error('refresh failed');
    });
    const catalog = fakeCatalog({
      getAllCards: jest.fn(async () => [CARD_ELSA]), // cached → sync is a refresh
      sync,
    });
    const store = createAppInitStore({
      persistence: okPersistence(),
      catalog,
      collectionStore,
    });

    await store.getState().start();
    await flush();

    expect(sync).toHaveBeenCalledTimes(1); // the refresh WAS attempted...
    expect(store.getState().phase).toBe('ready'); // ...and its rejection swallowed
    await db.close();
  });

  test('first run with no cache and no network → first-run-failed, with the error recorded', async () => {
    const { db, collectionStore } = await makeCollection(false);
    const catalog = fakeCatalog({
      getAllCards: jest.fn(async () => []), // no local cache...
      sync: jest.fn(async () => {
        throw new Error('offline'); // ...and no network to download one
      }),
    });
    const store = createAppInitStore({
      persistence: okPersistence(),
      catalog,
      collectionStore,
    });

    await store.getState().start();

    // offline-no-cache and a first-run download error are the SAME recoverable
    // state — a setup-needed gate, not a hard `error`.
    expect(store.getState().phase).toBe('first-run-failed');
    expect(store.getState().error).toMatch(/offline/);
    await db.close();
  });

  test('retry() after a first-run failure recovers to ready once the network returns', async () => {
    const { db, collectionStore } = await makeCollection(false);
    const sync = jest.fn(async () => ({ updated: true }));
    sync.mockRejectedValueOnce(new Error('offline')); // fails once, then succeeds
    const catalog = fakeCatalog({
      getAllCards: jest.fn(async () => []),
      sync,
    });
    const store = createAppInitStore({
      persistence: okPersistence(),
      catalog,
      collectionStore,
    });

    await store.getState().start();
    expect(store.getState().phase).toBe('first-run-failed');

    await store.getState().retry();

    expect(store.getState().phase).toBe('ready');
    expect(store.getState().error).toBeUndefined();
    expect(sync).toHaveBeenCalledTimes(2); // the failed attempt, then the retry
    await db.close();
  });

  test('a migration/DB failure short-circuits to error before any cache or network read', async () => {
    const { db, collectionStore } = await makeCollection(false);
    const catalog = fakeCatalog();
    const store = createAppInitStore({
      persistence: failingPersistence('migration boom'),
      catalog,
      collectionStore,
    });

    await store.getState().start();

    expect(store.getState().phase).toBe('error');
    expect(store.getState().error).toMatch(/migration boom/);
    expect(catalog.getAllCards).not.toHaveBeenCalled(); // never touched the cache
    await db.close();
  });
});
