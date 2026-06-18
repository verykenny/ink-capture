/**
 * Schema migration runner + migration 001 (collection_entries).
 *
 * Runs the real migration SQL against an in-memory better-sqlite3 engine via the
 * SqliteDatabase seam, so the UNIQUE index and CHECK constraints — the structural
 * backstops B1 relies on — are genuinely enforced here, not mocked.
 *
 * @format
 */

import { MIGRATIONS, runMigrations } from '@services/persistence/migrations';
import { createPersistenceService } from '@services/persistence/connection';
import type {
  SqliteDatabase,
  SqlParam,
} from '@services/persistence/sqlite/SqliteDatabase';
import { TestSqliteDatabase } from './testDatabase';

const tableNames = async (db: SqliteDatabase): Promise<string[]> => {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  return result.rows.map(row => String(row.name));
};

const indexNames = async (db: SqliteDatabase): Promise<string[]> => {
  const result = await db.execute(
    "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name",
  );
  return result.rows.map(row => String(row.name));
};

const userVersion = async (db: SqliteDatabase): Promise<number> => {
  const result = await db.execute('PRAGMA user_version');
  return Number(result.rows[0]?.user_version);
};

const rawInsert = (
  db: SqliteDatabase,
  overrides: Partial<{
    cardId: string;
    quantity: number;
    finish: string;
    condition: string;
    notes: SqlParam;
    addedAt: string;
    updatedAt: string;
  }> = {},
): Promise<unknown> =>
  db.execute(
    'INSERT INTO collection_entries ' +
      '(card_id, quantity, finish, condition, notes, added_at, updated_at) ' +
      'VALUES (?,?,?,?,?,?,?)',
    [
      overrides.cardId ?? 'TFC-042',
      overrides.quantity ?? 1,
      overrides.finish ?? 'normal',
      overrides.condition ?? 'NM',
      overrides.notes ?? null,
      overrides.addedAt ?? '2026-06-17T00:00:00.000Z',
      overrides.updatedAt ?? '2026-06-17T00:00:00.000Z',
    ],
  );

describe('runMigrations', () => {
  let db: TestSqliteDatabase;

  beforeEach(() => {
    db = new TestSqliteDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  test('fresh DB → collection_entries + identity unique index, version stamped', async () => {
    await runMigrations(db);

    expect(await tableNames(db)).toContain('collection_entries');
    expect(await indexNames(db)).toContain('ux_collection_identity');
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
  });

  test('is idempotent: re-running is a no-op that preserves data', async () => {
    await runMigrations(db);
    await rawInsert(db, { cardId: 'KEEPER' });
    const versionAfterFirst = await userVersion(db);

    await expect(runMigrations(db)).resolves.toBeUndefined();

    expect(await userVersion(db)).toBe(versionAfterFirst);
    // No duplicate tables from a second create-pass.
    expect(
      (await tableNames(db)).filter(name => name === 'collection_entries'),
    ).toHaveLength(1);
    // The pre-existing row survives re-init (migrations never wipe).
    const surviving = await db.execute(
      'SELECT card_id FROM collection_entries WHERE card_id=?',
      ['KEEPER'],
    );
    expect(surviving.rows).toHaveLength(1);
  });

  test('UNIQUE (card_id, finish, condition) rejects a duplicate identity', async () => {
    await runMigrations(db);
    await rawInsert(db, { cardId: 'DUP', finish: 'foil', condition: 'NM' });

    await expect(
      rawInsert(db, { cardId: 'DUP', finish: 'foil', condition: 'NM' }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  test('UNIQUE allows the same card in a different finish or condition', async () => {
    await runMigrations(db);
    await rawInsert(db, { cardId: 'CARD', finish: 'normal', condition: 'NM' });

    await expect(
      rawInsert(db, { cardId: 'CARD', finish: 'foil', condition: 'NM' }),
    ).resolves.toBeDefined();
    await expect(
      rawInsert(db, { cardId: 'CARD', finish: 'normal', condition: 'LP' }),
    ).resolves.toBeDefined();
  });

  describe('CHECK constraints back the typed contract structurally', () => {
    beforeEach(async () => {
      await runMigrations(db);
    });

    test('quantity must be > 0', async () => {
      await expect(rawInsert(db, { quantity: 0 })).rejects.toThrow(/CHECK/i);
    });

    test('finish must be in the closed set', async () => {
      await expect(rawInsert(db, { finish: 'glitter' })).rejects.toThrow(
        /CHECK/i,
      );
    });

    test('condition must be a known grade', async () => {
      await expect(rawInsert(db, { condition: 'XX' })).rejects.toThrow(
        /CHECK/i,
      );
    });
  });
});

describe('createPersistenceService', () => {
  test('init() applies migrations to a fresh DB', async () => {
    const db = new TestSqliteDatabase();
    const service = createPersistenceService(db);

    await service.init();

    expect(await tableNames(db)).toContain('collection_entries');
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
    await db.close();
  });
});

describe('migration 002 — catalog cache (B3 creates, B2 populates)', () => {
  let db: TestSqliteDatabase;

  beforeEach(() => {
    db = new TestSqliteDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  test('fresh DB ends at version 2 with the catalog tables + indexes', async () => {
    await runMigrations(db);

    expect(await userVersion(db)).toBe(2);
    const tables = await tableNames(db);
    expect(tables).toContain('catalog_cards');
    expect(tables).toContain('catalog_meta');
    const indexes = await indexNames(db);
    expect(indexes).toContain('ix_catalog_collector');
    expect(indexes).toContain('ix_catalog_normalized_name');
  });

  test('forward-only: a v1 DB gets only 002 applied, preserving collection data', async () => {
    // Simulate an app installed at schema v1 (migration 001 only).
    await MIGRATIONS[0](db);
    await db.execute('PRAGMA user_version = 1');
    await rawInsert(db, { cardId: 'PRE-EXISTING' });

    await runMigrations(db);

    expect(await userVersion(db)).toBe(2);
    expect(await tableNames(db)).toContain('catalog_cards');
    // the v1 collection row is untouched by the forward migration
    const surviving = await db.execute(
      'SELECT card_id FROM collection_entries WHERE card_id=?',
      ['PRE-EXISTING'],
    );
    expect(surviving.rows).toHaveLength(1);
  });

  test('catalog_meta is an empty key/value store (B2 owns its contents)', async () => {
    await runMigrations(db);
    const rows = await db.execute('SELECT key, value FROM catalog_meta');
    expect(rows.rows).toEqual([]);
  });
});
