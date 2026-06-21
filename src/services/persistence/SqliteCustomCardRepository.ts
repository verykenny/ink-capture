/**
 * SQLite-backed CustomCardRepository.
 *
 * Maps the off-catalog `custom_cards` rows (migration 003) to the existing domain
 * `Card` over the SqliteDatabase seam. The synthetic id is `manual:<rowid>`,
 * minted from the table's INTEGER PK via `INSERT … RETURNING *` (mirrors how the
 * collection repository leans on the rowid; the `manual:` prefix records
 * provenance without a new type). Absent set/number/rarity coalesce to '' so a
 * name-only manual card is a structurally valid `Card`; the clock is injected so
 * `created_at` is deterministic in tests.
 *
 * @format
 */

import { assertValidCustomCard, isFinish } from '@domain';
import type { Card, Finish } from '@domain';
import type { CustomCardRepository } from './CustomCardRepository';
import type { SqliteDatabase } from './sqlite/SqliteDatabase';

/** Tuning knobs; constructor params are not part of the contract. */
export interface CustomCardRepositoryDeps {
  /** Returns the current time as an ISO 8601 UTC string. Injected for tests. */
  now?: () => string;
}

const TABLE = 'custom_cards';
const ID_PREFIX = 'manual:';
const DEFAULT_FINISHES: readonly Finish[] = ['normal', 'foil'];

/** Parse the stored available_finishes JSON, falling back to the full set. */
const parseFinishes = (raw: unknown): Finish[] => {
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const finishes = (parsed as unknown[]).filter(isFinish);
        if (finishes.length > 0) {
          return finishes;
        }
      }
    } catch {
      // Malformed JSON → fall through to the default.
    }
  }
  return [...DEFAULT_FINISHES];
};

/**
 * Map a custom_cards row to a Card: `manual:<rowid>` id; absent
 * set_code/collector_number/rarity coalesce to '' (they are non-optional on
 * Card); absent version/image_url map to an absent property (like notes).
 */
const rowToCard = (row: Record<string, unknown>): Card => {
  const card: Card = {
    id: `${ID_PREFIX}${row.id}`,
    name: String(row.name),
    setCode: row.set_code == null ? '' : String(row.set_code),
    collectorNumber:
      row.collector_number == null ? '' : String(row.collector_number),
    rarity: row.rarity == null ? '' : String(row.rarity),
    availableFinishes: parseFinishes(row.available_finishes),
  };
  const withVersion =
    row.version == null ? card : { ...card, version: String(row.version) };
  return row.image_url == null
    ? withVersion
    : { ...withVersion, imageUrl: String(row.image_url) };
};

/** Extract the integer rowid from a `manual:<rowid>` id, or null if it isn't one. */
const manualRowId = (id: string): number | null => {
  if (!id.startsWith(ID_PREFIX)) {
    return null;
  }
  const rowId = Number(id.slice(ID_PREFIX.length));
  return Number.isInteger(rowId) ? rowId : null;
};

export const createCustomCardRepository = (
  db: SqliteDatabase,
  deps: CustomCardRepositoryDeps = {},
): CustomCardRepository => {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    create: async input => {
      // The repository is the happy-path gate: name must be non-empty.
      assertValidCustomCard(input);
      const result = await db.execute(
        `INSERT INTO ${TABLE} ` +
          '(name, version, set_code, collector_number, rarity, ' +
          'available_finishes, image_url, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
        [
          input.name,
          input.version ?? null,
          input.setCode ?? null,
          input.collectorNumber ?? null,
          input.rarity ?? null,
          JSON.stringify(input.availableFinishes ?? DEFAULT_FINISHES),
          input.imageUrl ?? null,
          now(),
        ],
      );
      const [row] = result.rows;
      if (row === undefined) {
        throw new Error(
          'customCard/create: expected a returned row but got none',
        );
      }
      return rowToCard(row);
    },

    getAll: async () => {
      const result = await db.execute(`SELECT * FROM ${TABLE} ORDER BY id`);
      return result.rows.map(rowToCard);
    },

    getById: async id => {
      const rowId = manualRowId(id);
      if (rowId === null) {
        return null;
      }
      const result = await db.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [
        rowId,
      ]);
      const [row] = result.rows;
      return row ? rowToCard(row) : null;
    },
  };
};
