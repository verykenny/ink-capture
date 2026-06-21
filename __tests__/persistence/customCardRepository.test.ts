/**
 * SqliteCustomCardRepository — the off-catalog ("manual") card store over real
 * in-memory SQLite (node:sqlite via the SqliteDatabase seam, migration 003).
 *
 * create() mints a `manual:<rowid>` Card id from the table's INTEGER PK and maps
 * the row to the existing Card model (absent set/number/rarity → ''); getAll /
 * getById round-trip it. No CustomCard type, no network, no device.
 *
 * @format
 */

import { createCustomCardRepository } from '@services/persistence/SqliteCustomCardRepository';
import { runMigrations } from '@services/persistence/migrations';
import type { CustomCardRepository } from '@services';
import { TestSqliteDatabase } from './testDatabase';

const FIXED_NOW = '2026-06-21T12:00:00.000Z';

describe('SqliteCustomCardRepository', () => {
  let db: TestSqliteDatabase;
  let repo: CustomCardRepository;

  beforeEach(async () => {
    db = new TestSqliteDatabase();
    await runMigrations(db);
    repo = createCustomCardRepository(db, { now: () => FIXED_NOW });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('create', () => {
    test('mints a manual:<rowid> id and returns a Card with the input name', async () => {
      const card = await repo.create({ name: 'Homemade Hero' });
      expect(card.id).toMatch(/^manual:\d+$/);
      expect(card.name).toBe('Homemade Hero');
    });

    test('coalesces absent set/number/rarity to empty strings, defaults finishes, omits version', async () => {
      const card = await repo.create({ name: 'Name Only' });
      expect(card.setCode).toBe('');
      expect(card.collectorNumber).toBe('');
      expect(card.rarity).toBe('');
      expect(card.availableFinishes).toEqual(['normal', 'foil']);
      expect(card.version).toBeUndefined();
      expect('version' in card).toBe(false);
      expect(card.imageUrl).toBeUndefined();
    });

    test('carries through the optional fields when provided', async () => {
      const card = await repo.create({
        name: 'Custom Elsa',
        version: 'Homemade',
        setCode: 'XXX',
        collectorNumber: '999',
        rarity: 'Legendary',
      });
      expect(card).toMatchObject({
        name: 'Custom Elsa',
        version: 'Homemade',
        setCode: 'XXX',
        collectorNumber: '999',
        rarity: 'Legendary',
      });
    });

    test('rejects an empty name and persists nothing', async () => {
      await expect(repo.create({ name: '   ' })).rejects.toThrow(/name/i);
      expect(await repo.getAll()).toHaveLength(0);
    });

    test('mints a fresh id per add — two same-name adds are two distinct cards', async () => {
      const a = await repo.create({ name: 'Dup' });
      const b = await repo.create({ name: 'Dup' });
      expect(a.id).not.toBe(b.id);
      expect(await repo.getAll()).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    test('returns every custom card, ordered by id', async () => {
      await repo.create({ name: 'A' });
      await repo.create({ name: 'B' });
      expect((await repo.getAll()).map(card => card.name)).toEqual(['A', 'B']);
    });

    test('is empty when nothing is stored', async () => {
      expect(await repo.getAll()).toEqual([]);
    });
  });

  describe('getById', () => {
    test('round-trips a created card by its manual id', async () => {
      const created = await repo.create({ name: 'Findable' });
      expect(await repo.getById(created.id)).toEqual(created);
    });

    test('returns null for an unknown manual id', async () => {
      expect(await repo.getById('manual:9999')).toBeNull();
    });

    test('returns null for a non-manual or malformed id', async () => {
      expect(await repo.getById('TFC-042')).toBeNull();
      expect(await repo.getById('manual:abc')).toBeNull();
    });
  });
});
