/**
 * catalogCache — read/write over B3's catalog_cards + catalog_meta tables.
 *
 * Runs the real production SQL against an in-memory node:sqlite engine (the
 * SqliteDatabase seam via TestSqliteDatabase), so the round-trip, the JSON
 * finishes encode/decode, and — crucially — the transactional, atomic replace
 * are genuinely enforced, not faked. RecordingSqliteDatabase pins the
 * BEGIN→…→COMMIT vs BEGIN→…→ROLLBACK ordering and lets us inject a mid-replace
 * failure to prove the prior cache survives.
 *
 * @format
 */

import {
  CATALOG_META_KEYS,
  countCards,
  findCardByCollectorNumber,
  listAllCards,
  readCatalogVersion,
  replaceCatalog,
  rowToCard,
  type CatalogMeta,
} from '@services/catalog/catalogCache';
import { normalizeCardName } from '@services/catalog/normalizeName';
import { runMigrations } from '@services/persistence/migrations';
import type { Card } from '@domain';
import {
  RecordingSqliteDatabase,
  TestSqliteDatabase,
} from '../persistence/testDatabase';
import { CARD_ELSA, CARD_ELSA_ENCHANTED, CARD_MICKEY } from '../fixtures/cards';
import { MAPPED_ACTION } from '../fixtures/lorcanaCards';

const META: CatalogMeta = {
  generatedOn: '2026-05-26T19:11:58',
  formatVersion: '2.3.2',
  syncedAt: '2026-06-17T12:00:00.000Z',
};

const META_V2: CatalogMeta = {
  generatedOn: '2026-06-10T08:00:00',
  formatVersion: '2.3.2',
  syncedAt: '2026-06-17T13:00:00.000Z',
};

const THREE: readonly Card[] = [CARD_ELSA, CARD_ELSA_ENCHANTED, CARD_MICKEY];

describe('catalogCache', () => {
  let db: TestSqliteDatabase;

  beforeEach(async () => {
    db = new TestSqliteDatabase();
    await runMigrations(db);
  });

  afterEach(async () => {
    await db.close();
  });

  describe('replaceCatalog + reads round-trip', () => {
    beforeEach(async () => {
      await replaceCatalog(db, THREE, META);
    });

    test('countCards reflects the inserted rows', async () => {
      expect(await countCards(db)).toBe(3);
    });

    test('findByCollectorNumber returns the matching Card (indexed hit)', async () => {
      expect(await findCardByCollectorNumber(db, 'TFC', '042')).toEqual(
        CARD_ELSA,
      );
      expect(await findCardByCollectorNumber(db, 'TFC', '204')).toEqual(
        CARD_ELSA_ENCHANTED,
      );
    });

    test('findByCollectorNumber is null on a miss', async () => {
      expect(await findCardByCollectorNumber(db, 'TFC', '999')).toBeNull();
      expect(await findCardByCollectorNumber(db, 'XXX', '042')).toBeNull();
    });

    test('listAllCards round-trips every Card', async () => {
      const all = await listAllCards(db);
      expect(all).toHaveLength(3);
      expect(all).toEqual(expect.arrayContaining([...THREE]));
    });

    test('an image-bearing Card round-trips its imageUrl', async () => {
      await replaceCatalog(db, [MAPPED_ACTION], META);
      expect(await findCardByCollectorNumber(db, 'TFC', '17')).toEqual(
        MAPPED_ACTION,
      );
    });
  });

  describe('available_finishes JSON column', () => {
    test('finishes are stored as a JSON array', async () => {
      await replaceCatalog(db, THREE, META);
      const elsa = await db.execute(
        'SELECT available_finishes FROM catalog_cards WHERE id = ?',
        [CARD_ELSA.id],
      );
      expect(elsa.rows[0].available_finishes).toBe('["normal","foil"]');
      const ench = await db.execute(
        'SELECT available_finishes FROM catalog_cards WHERE id = ?',
        [CARD_ELSA_ENCHANTED.id],
      );
      expect(ench.rows[0].available_finishes).toBe('["foil"]');
    });

    test('rowToCard filters unknown finishes out of the decoded list', () => {
      const card = rowToCard({
        id: 'X-1',
        name: 'Test',
        normalized_name: 'test',
        version: null,
        set_code: 'X',
        collector_number: '1',
        rarity: 'Common',
        available_finishes: '["normal","glitter","foil"]',
        image_url: null,
      });
      expect(card.availableFinishes).toEqual(['normal', 'foil']);
    });

    test('rowToCard tolerates a malformed finishes column (empty list)', () => {
      const card = rowToCard({
        id: 'X-2',
        name: 'Test',
        normalized_name: 'test',
        version: null,
        set_code: 'X',
        collector_number: '2',
        rarity: 'Common',
        available_finishes: 'not json',
        image_url: null,
      });
      expect(card.availableFinishes).toEqual([]);
    });

    test('rowToCard omits version/imageUrl when the columns are NULL', () => {
      const card = rowToCard({
        id: 'X-3',
        name: 'Test',
        normalized_name: 'test',
        version: null,
        set_code: 'X',
        collector_number: '3',
        rarity: 'Common',
        available_finishes: '["normal"]',
        image_url: null,
      });
      expect('version' in card).toBe(false);
      expect('imageUrl' in card).toBe(false);
    });
  });

  describe('normalized_name column', () => {
    test('is derived from name + version via normalizeCardName', async () => {
      await replaceCatalog(db, THREE, META);
      const row = await db.execute(
        'SELECT normalized_name FROM catalog_cards WHERE id = ?',
        [CARD_ELSA.id],
      );
      expect(row.rows[0].normalized_name).toBe(
        normalizeCardName('Elsa Snow Queen'),
      );
    });

    test('a version-less card normalizes its name alone', async () => {
      await replaceCatalog(db, [MAPPED_ACTION], META);
      const row = await db.execute(
        'SELECT normalized_name FROM catalog_cards WHERE id = ?',
        [MAPPED_ACTION.id],
      );
      expect(row.rows[0].normalized_name).toBe(
        normalizeCardName('Sudden Chill'),
      );
    });
  });

  describe('catalog_meta version read/write', () => {
    test('readCatalogVersion is empty before any sync', async () => {
      expect(await readCatalogVersion(db)).toEqual({});
    });

    test('replaceCatalog writes generatedOn + formatVersion + syncedAt', async () => {
      await replaceCatalog(db, THREE, META);
      expect(await readCatalogVersion(db)).toEqual({
        generatedOn: META.generatedOn,
        formatVersion: META.formatVersion,
      });
      const synced = await db.execute(
        'SELECT value FROM catalog_meta WHERE key = ?',
        [CATALOG_META_KEYS.syncedAt],
      );
      expect(synced.rows[0].value).toBe(META.syncedAt);
    });

    test('a later replace upserts the version (no duplicate keys)', async () => {
      await replaceCatalog(db, THREE, META);
      await replaceCatalog(db, [CARD_MICKEY], META_V2);
      expect(await readCatalogVersion(db)).toEqual({
        generatedOn: META_V2.generatedOn,
        formatVersion: META_V2.formatVersion,
      });
      const metaRows = await db.execute(
        'SELECT COUNT(*) AS n FROM catalog_meta',
      );
      expect(Number(metaRows.rows[0].n)).toBe(3); // generatedOn, formatVersion, syncedAt
    });
  });

  describe('replaceCatalog is transactional + atomic', () => {
    test('opens BEGIN, replaces, COMMITs on success', async () => {
      const recording = new RecordingSqliteDatabase(db);
      await replaceCatalog(recording, THREE, META);
      expect(recording.verbs[0]).toBe('BEGIN');
      expect(recording.verbs).toContain('DELETE');
      expect(recording.verbs[recording.verbs.length - 1]).toBe('COMMIT');
    });

    test('a mid-replace failure ROLLBACKs and leaves the prior cache intact', async () => {
      // Seed an existing cache, then attempt a replace that fails on the 2nd
      // INSERT. The DELETE + first INSERT must roll back, restoring the old rows.
      await replaceCatalog(db, THREE, META);

      let inserts = 0;
      const recording = new RecordingSqliteDatabase(
        db,
        sql => /INSERT INTO catalog_cards/i.test(sql) && (inserts += 1) === 2,
      );

      await expect(
        replaceCatalog(
          recording,
          [CARD_MICKEY, CARD_ELSA, CARD_ELSA_ENCHANTED],
          META_V2,
        ),
      ).rejects.toThrow(/injected/);

      expect(recording.verbs).toContain('BEGIN');
      expect(recording.verbs).toContain('ROLLBACK');
      expect(recording.verbs).not.toContain('COMMIT');

      // Old cache fully intact: same count, same rows, same version.
      expect(await countCards(db)).toBe(3);
      expect(await findCardByCollectorNumber(db, 'TFC', '042')).toEqual(
        CARD_ELSA,
      );
      expect((await readCatalogVersion(db)).generatedOn).toBe(META.generatedOn);
    });
  });
});
