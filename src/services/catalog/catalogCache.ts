/**
 * Catalog cache persistence over B3's `catalog_cards` + `catalog_meta` tables.
 *
 * Programs only against the `SqliteDatabase` seam (never op-sqlite directly), so
 * the exact SQL here runs against op-sqlite on device and in-memory node:sqlite
 * in Jest. B2 populates tables B3 created empty — there is NO new migration.
 *
 * `available_finishes` is stored as a JSON array of finish strings and decoded
 * with `isFinish` filtering on read, so a stray value can never leak into the
 * domain `Card`. `normalized_name` is derived here (persistence-only) from the
 * Card's name + version via the shared `normalizeCardName`, the same function
 * C1 runs over OCR text — keeping the cached column and a scan comparable.
 *
 * @format
 */

import { isFinish } from '@domain';
import type { Card, Finish } from '@domain';
import {
  withTransaction,
  type SqliteDatabase,
} from '@services/persistence/sqlite/SqliteDatabase';
import { normalizeCardName } from './normalizeName';

const CARDS_TABLE = 'catalog_cards';
const META_TABLE = 'catalog_meta';

/** `catalog_meta` keys B2 owns. */
export const CATALOG_META_KEYS = {
  generatedOn: 'catalog.generatedOn',
  formatVersion: 'catalog.formatVersion',
  syncedAt: 'catalog.syncedAt',
} as const;

/** The version/sync metadata written alongside a catalog refresh. */
export interface CatalogMeta {
  /** Upstream `generatedOn` — the cache-skip change signal. */
  generatedOn: string;
  /** Upstream `formatVersion`. */
  formatVersion: string;
  /** When this sync ran (ISO 8601), for diagnostics. */
  syncedAt: string;
}

/** The cached version fields the service reads to decide whether to re-download. */
export interface CachedCatalogVersion {
  generatedOn?: string;
  formatVersion?: string;
}

/** Derive the persistence-only normalized name from a Card (name + version). */
const normalizedNameFor = (card: Card): string =>
  normalizeCardName(card.version ? `${card.name} ${card.version}` : card.name);

/** Encode the closed finish set as JSON text for storage. */
const encodeFinishes = (finishes: readonly Finish[]): string =>
  JSON.stringify(finishes);

/** Decode the stored finishes, dropping anything that isn't a known Finish. */
const decodeFinishes = (raw: unknown): Finish[] => {
  if (typeof raw !== 'string') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isFinish) : [];
};

/** Reconstruct a Card from a `catalog_cards` row (optionals omitted when NULL). */
export const rowToCard = (row: Record<string, unknown>): Card => {
  const card: Card = {
    id: String(row.id),
    name: String(row.name),
    setCode: String(row.set_code),
    collectorNumber: String(row.collector_number),
    rarity: String(row.rarity),
    availableFinishes: decodeFinishes(row.available_finishes),
  };
  const withVersion =
    row.version == null ? card : { ...card, version: String(row.version) };
  return row.image_url == null
    ? withVersion
    : { ...withVersion, imageUrl: String(row.image_url) };
};

const insertCard = (db: SqliteDatabase, card: Card): Promise<unknown> =>
  db.execute(
    `INSERT INTO ${CARDS_TABLE} ` +
      '(id, name, normalized_name, version, set_code, collector_number, ' +
      'rarity, available_finishes, image_url) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      card.id,
      card.name,
      normalizedNameFor(card),
      card.version ?? null,
      card.setCode,
      card.collectorNumber,
      card.rarity,
      encodeFinishes(card.availableFinishes),
      card.imageUrl ?? null,
    ],
  );

const upsertMeta = (
  db: SqliteDatabase,
  key: string,
  value: string,
): Promise<unknown> =>
  db.execute(
    `INSERT INTO ${META_TABLE} (key, value) VALUES (?, ?) ` +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );

/**
 * Atomically replace the cached catalog: DELETE all rows, re-INSERT the mapped
 * cards, and upsert the version metadata — all in one transaction. A failed or
 * partial download therefore throws before COMMIT and leaves the prior cache
 * fully intact (the DELETE rolls back with the rest).
 */
export const replaceCatalog = (
  db: SqliteDatabase,
  cards: readonly Card[],
  meta: CatalogMeta,
): Promise<void> =>
  withTransaction(db, async () => {
    await db.execute(`DELETE FROM ${CARDS_TABLE}`);
    for (const card of cards) {
      await insertCard(db, card);
    }
    await upsertMeta(db, CATALOG_META_KEYS.generatedOn, meta.generatedOn);
    await upsertMeta(db, CATALOG_META_KEYS.formatVersion, meta.formatVersion);
    await upsertMeta(db, CATALOG_META_KEYS.syncedAt, meta.syncedAt);
  });

/** Read the cached version fields (empty object before the first sync). */
export const readCatalogVersion = async (
  db: SqliteDatabase,
): Promise<CachedCatalogVersion> => {
  const result = await db.execute(
    `SELECT key, value FROM ${META_TABLE} WHERE key IN (?, ?)`,
    [CATALOG_META_KEYS.generatedOn, CATALOG_META_KEYS.formatVersion],
  );
  const byKey = new Map(
    result.rows.map(row => [String(row.key), row.value] as const),
  );
  const version: CachedCatalogVersion = {};
  const generatedOn = byKey.get(CATALOG_META_KEYS.generatedOn);
  if (generatedOn != null) {
    version.generatedOn = String(generatedOn);
  }
  const formatVersion = byKey.get(CATALOG_META_KEYS.formatVersion);
  if (formatVersion != null) {
    version.formatVersion = String(formatVersion);
  }
  return version;
};

/** Count cached cards — the service uses `> 0` to gate the version skip. */
export const countCards = async (db: SqliteDatabase): Promise<number> => {
  const result = await db.execute(
    `SELECT COUNT(*) AS count FROM ${CARDS_TABLE}`,
  );
  return Number(result.rows[0]?.count ?? 0);
};

/** Exact lookup on (set_code, collector_number) — uses `ix_catalog_collector`. */
export const findCardByCollectorNumber = async (
  db: SqliteDatabase,
  setCode: string,
  collectorNumber: string,
): Promise<Card | null> => {
  const result = await db.execute(
    `SELECT * FROM ${CARDS_TABLE} WHERE set_code = ? AND collector_number = ?`,
    [setCode, collectorNumber],
  );
  const [row] = result.rows;
  return row ? rowToCard(row) : null;
};

/** Every cached card, ordered by id — feeds C1's fuzzy pass. */
export const listAllCards = async (db: SqliteDatabase): Promise<Card[]> => {
  const result = await db.execute(`SELECT * FROM ${CARDS_TABLE} ORDER BY id`);
  return result.rows.map(rowToCard);
};
