/**
 * LorcanaCatalogService — the assembled CatalogService: metadata-gated sync,
 * atomic cache refresh, and the lookups C1 consumes.
 *
 * Wired with a REAL in-memory catalog (TestSqliteDatabase) and a FAKE
 * HttpJsonClient serving the tiny fixture — so the version-skip decision, the
 * refresh-on-change path, the leave-cache-intact-on-failure guarantee, and the
 * lookups are all proven end-to-end with no network and no react-native-config
 * (a `baseUrl` is injected, so Config is never read).
 *
 * @format
 */

import { createCatalogService } from '@services/catalog/LorcanaCatalogService';
import {
  CATALOG_META_KEYS,
  countCards,
  readCatalogVersion,
} from '@services/catalog/catalogCache';
import type { CatalogService } from '@services/catalog/CatalogService';
import type { HttpJsonClient } from '@services/catalog/HttpJsonClient';
import { runMigrations } from '@services/persistence/migrations';
import {
  RecordingSqliteDatabase,
  TestSqliteDatabase,
} from '../persistence/testDatabase';
import { CARD_ELSA, CARD_MICKEY } from '../fixtures/cards';
import {
  LORCANA_ALL_CARDS,
  LORCANA_METADATA,
  LORCANA_METADATA_V2,
  MAPPED_ACTION,
  RAW_CARDS,
} from '../fixtures/lorcanaCards';
import type {
  LorcanaAllCards,
  LorcanaMetadata,
} from '@services/catalog/lorcanaTypes';

const BASE = 'https://catalog.example.test/files/current/en';
const NOW = '2026-06-17T12:00:00.000Z';

/** A fake HttpJsonClient serving fixed metadata/allCards, recording every URL. */
const makeHttp = (
  metadata: LorcanaMetadata,
  allCards: LorcanaAllCards,
): { client: HttpJsonClient; urls: string[] } => {
  const urls: string[] = [];
  const client: HttpJsonClient = {
    getJson: async <T>(url: string): Promise<T> => {
      urls.push(url);
      if (url.endsWith('/metadata.json')) {
        return metadata as unknown as T;
      }
      if (url.endsWith('/allCards.json')) {
        return allCards as unknown as T;
      }
      throw new Error(`unexpected url ${url}`);
    },
  };
  return { client, urls };
};

/** A fake whose allCards.json fetch rejects (a failed/partial download). */
const makeFailingAllCardsHttp = (
  metadata: LorcanaMetadata,
): { client: HttpJsonClient; urls: string[] } => {
  const urls: string[] = [];
  const client: HttpJsonClient = {
    getJson: async <T>(url: string): Promise<T> => {
      urls.push(url);
      if (url.endsWith('/metadata.json')) {
        return metadata as unknown as T;
      }
      throw new Error('network: allCards.json failed');
    },
  };
  return { client, urls };
};

describe('LorcanaCatalogService', () => {
  let db: TestSqliteDatabase;

  beforeEach(async () => {
    db = new TestSqliteDatabase();
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('sync — first run', () => {
    test('downloads, maps, and populates the cache (updated:true)', async () => {
      const { client, urls } = makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS);
      const service = createCatalogService({
        db,
        http: client,
        baseUrl: BASE,
        now: () => NOW,
      });

      const result = await service.sync();

      expect(result).toEqual({
        updated: true,
        version: LORCANA_METADATA.generatedOn,
      });
      expect(await countCards(db)).toBe(RAW_CARDS.length);
      // metadata polled before allCards downloaded
      expect(urls).toEqual([`${BASE}/metadata.json`, `${BASE}/allCards.json`]);
      // the service threads metadata.formatVersion + now() into the cache
      expect(await readCatalogVersion(db)).toEqual({
        generatedOn: LORCANA_METADATA.generatedOn,
        formatVersion: LORCANA_METADATA.formatVersion,
      });
      const synced = await db.execute(
        'SELECT value FROM catalog_meta WHERE key = ?',
        [CATALOG_META_KEYS.syncedAt],
      );
      expect(synced.rows[0].value).toBe(NOW);
    });
  });

  describe('sync — version skip', () => {
    test('unchanged generatedOn is a no-op: updated:false, no catalog writes', async () => {
      const first = makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS);
      await createCatalogService({
        db,
        http: first.client,
        baseUrl: BASE,
        now: () => NOW,
      }).sync();

      // Second sync over a RecordingSqliteDatabase so we can prove no writes.
      const recording = new RecordingSqliteDatabase(db);
      const second = makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS);
      const result = await createCatalogService({
        db: recording,
        http: second.client,
        baseUrl: BASE,
        now: () => NOW,
      }).sync();

      expect(result).toEqual({
        updated: false,
        version: LORCANA_METADATA.generatedOn,
      });
      // allCards.json was NOT fetched the second time.
      expect(second.urls).toEqual([`${BASE}/metadata.json`]);
      // No catalog mutation occurred.
      expect(recording.verbs).not.toContain('DELETE');
      expect(recording.verbs).not.toContain('INSERT');
      expect(recording.verbs).not.toContain('BEGIN');
    });
  });

  describe('sync — refresh on changed version', () => {
    test('a new generatedOn re-downloads and replaces the cache', async () => {
      await createCatalogService({
        db,
        http: makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS).client,
        baseUrl: BASE,
        now: () => NOW,
      }).sync();

      // v2 metadata + a single-card payload.
      const v2Cards: LorcanaAllCards = {
        ...LORCANA_ALL_CARDS,
        metadata: LORCANA_METADATA_V2,
        cards: [LORCANA_ALL_CARDS.cards[2]], // RAW_MICKEY
      };
      const result = await createCatalogService({
        db,
        http: makeHttp(LORCANA_METADATA_V2, v2Cards).client,
        baseUrl: BASE,
        now: () => NOW,
      }).sync();

      expect(result).toEqual({
        updated: true,
        version: LORCANA_METADATA_V2.generatedOn,
      });
      // Cache now reflects the v2 payload only.
      expect(await countCards(db)).toBe(1);
      const service = createCatalogService({
        db,
        http: makeHttp(LORCANA_METADATA_V2, v2Cards).client,
        baseUrl: BASE,
      });
      expect(await service.findByCollectorNumber('TFC', '115')).toEqual(
        CARD_MICKEY,
      );
      expect(await service.findByCollectorNumber('TFC', '042')).toBeNull();
    });
  });

  describe('sync — failed download leaves the cache intact', () => {
    test('an allCards.json rejection does not touch the prior cache', async () => {
      await createCatalogService({
        db,
        http: makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS).client,
        baseUrl: BASE,
        now: () => NOW,
      }).sync();

      // A changed version forces a re-download, but allCards.json fails.
      const failing = makeFailingAllCardsHttp(LORCANA_METADATA_V2);
      const service = createCatalogService({
        db,
        http: failing.client,
        baseUrl: BASE,
        now: () => NOW,
      });

      await expect(service.sync()).rejects.toThrow(/allCards/);
      // Prior cache and version untouched.
      expect(await countCards(db)).toBe(RAW_CARDS.length);
      expect(await service.findByCollectorNumber('TFC', '042')).toEqual(
        CARD_ELSA,
      );
    });
  });

  describe('lookups', () => {
    let service: ReturnType<typeof createCatalogService>;

    beforeEach(async () => {
      service = createCatalogService({
        db,
        http: makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS).client,
        baseUrl: BASE,
        now: () => NOW,
      });
      await service.sync();
    });

    test('findByCollectorNumber returns a mapped Card on a hit', async () => {
      expect(await service.findByCollectorNumber('TFC', '042')).toEqual(
        CARD_ELSA,
      );
      expect(await service.findByCollectorNumber('TFC', '17')).toEqual(
        MAPPED_ACTION,
      );
    });

    test('findByCollectorNumber is null on a miss', async () => {
      expect(await service.findByCollectorNumber('TFC', '000')).toBeNull();
    });

    test('getAllCards returns every cached card', async () => {
      const all = await service.getAllCards();
      expect(all).toHaveLength(RAW_CARDS.length);
      expect(all).toEqual(expect.arrayContaining([CARD_ELSA, MAPPED_ACTION]));
    });
  });

  describe('baseUrl handling', () => {
    test('a trailing slash on baseUrl does not double up the path', async () => {
      const http = makeHttp(LORCANA_METADATA, LORCANA_ALL_CARDS);
      const service = createCatalogService({
        db,
        http: http.client,
        baseUrl: `${BASE}/`,
        now: () => NOW,
      });
      await service.sync();
      expect(http.urls).toEqual([
        `${BASE}/metadata.json`,
        `${BASE}/allCards.json`,
      ]);
    });
  });

  describe('contract shape', () => {
    test('the factory returns the three CatalogService methods', () => {
      const noopHttp: HttpJsonClient = { getJson: async () => ({} as never) };
      const service: CatalogService = createCatalogService({
        db,
        http: noopHttp,
        baseUrl: BASE,
      });
      expect(typeof service.sync).toBe('function');
      expect(typeof service.findByCollectorNumber).toBe('function');
      expect(typeof service.getAllCards).toBe('function');
    });
  });
});
