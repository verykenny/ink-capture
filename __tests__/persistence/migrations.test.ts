/**
 * Schema migration runner + migrations 001/002.
 *
 * Runs the real migration SQL against an in-memory node:sqlite engine via the
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
import { RecordingSqliteDatabase, TestSqliteDatabase } from './testDatabase';

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

  test('fresh DB ends at the latest version with the catalog tables + indexes', async () => {
    await runMigrations(db);

    expect(await userVersion(db)).toBe(MIGRATIONS.length);
    const tables = await tableNames(db);
    expect(tables).toContain('catalog_cards');
    expect(tables).toContain('catalog_meta');
    const indexes = await indexNames(db);
    expect(indexes).toContain('ix_catalog_collector');
    expect(indexes).toContain('ix_catalog_normalized_name');
  });

  test('forward-only: a v1 DB gets the pending migrations applied, preserving collection data', async () => {
    // Simulate an app installed at schema v1 (migration 001 only).
    await MIGRATIONS[0](db);
    await db.execute('PRAGMA user_version = 1');
    await rawInsert(db, { cardId: 'PRE-EXISTING' });

    await runMigrations(db);

    expect(await userVersion(db)).toBe(MIGRATIONS.length);
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

describe('runMigrations gates on user_version (no blind re-runs)', () => {
  let inner: TestSqliteDatabase;

  beforeEach(() => {
    inner = new TestSqliteDatabase();
  });

  afterEach(async () => {
    await inner.close();
  });

  const ddlFor = (recording: RecordingSqliteDatabase): string[] =>
    recording.executed.filter(sql => /CREATE (TABLE|INDEX)/i.test(sql));

  test('a second run emits no migration DDL and starts no transaction', async () => {
    await runMigrations(inner);

    const recording = new RecordingSqliteDatabase(inner);
    await runMigrations(recording);

    // Up-to-date DB: only the user_version probe runs; no CREATE, no BEGIN/COMMIT.
    expect(ddlFor(recording)).toEqual([]);
    expect(recording.verbs).not.toContain('BEGIN');
    expect(recording.verbs).not.toContain('CREATE');
  });

  test('from v1 it runs the pending migrations (001 is not re-executed)', async () => {
    await MIGRATIONS[0](inner);
    await inner.execute('PRAGMA user_version = 1');

    const recording = new RecordingSqliteDatabase(inner);
    await runMigrations(recording);

    const ddl = ddlFor(recording);
    // 002's objects are created…
    expect(ddl.some(sql => /catalog_cards/.test(sql))).toBe(true);
    // …and 001's table is NOT re-created (it was skipped, not just IF NOT EXISTS).
    expect(ddl.some(sql => /collection_entries/.test(sql))).toBe(false);
    expect(await userVersion(inner)).toBe(MIGRATIONS.length);
  });
});

describe('migration 003 — custom_cards (off-catalog manual store)', () => {
  let db: TestSqliteDatabase;

  beforeEach(() => {
    db = new TestSqliteDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  test('fresh DB gains the custom_cards table and stamps the latest version', async () => {
    await runMigrations(db);

    expect(await tableNames(db)).toContain('custom_cards');
    expect(await userVersion(db)).toBe(MIGRATIONS.length);
  });

  test('available_finishes defaults to the closed finish set when omitted', async () => {
    await runMigrations(db);
    await db.execute(
      'INSERT INTO custom_cards (name, created_at) VALUES (?, ?)',
      ['Homemade Hero', '2026-06-21T00:00:00.000Z'],
    );

    const rows = await db.execute(
      'SELECT name, available_finishes FROM custom_cards',
    );
    expect(rows.rows[0]).toMatchObject({
      name: 'Homemade Hero',
      available_finishes: '["normal","foil"]',
    });
  });

  test('name is required (NOT NULL) — set/number/rarity/version are not', async () => {
    await runMigrations(db);

    await expect(
      db.execute('INSERT INTO custom_cards (created_at) VALUES (?)', ['t']),
    ).rejects.toThrow(/NOT NULL/i);

    // name-only insert is accepted (everything else is nullable / defaulted).
    await expect(
      db.execute('INSERT INTO custom_cards (name, created_at) VALUES (?, ?)', [
        'Name Only',
        't',
      ]),
    ).resolves.toBeDefined();
  });

  test('forward-only: a v2 DB gets 003 applied, preserving collection data', async () => {
    // Simulate an app installed at schema v2 (migrations 001 + 002 only).
    await MIGRATIONS[0](db);
    await MIGRATIONS[1](db);
    await db.execute('PRAGMA user_version = 2');
    await rawInsert(db, { cardId: 'PRE-EXISTING' });

    await runMigrations(db);

    expect(await userVersion(db)).toBe(MIGRATIONS.length);
    expect(await tableNames(db)).toContain('custom_cards');
    // the v2 collection row is untouched by the forward migration
    const surviving = await db.execute(
      'SELECT card_id FROM collection_entries WHERE card_id=?',
      ['PRE-EXISTING'],
    );
    expect(surviving.rows).toHaveLength(1);
  });
});
