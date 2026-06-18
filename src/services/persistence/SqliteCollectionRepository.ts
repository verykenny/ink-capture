/**
 * SQLite-backed CollectionRepository.
 *
 * Maps domain CollectionEntry values to/from the collection_entries table (B3's
 * migration 001) over the SqliteDatabase seam. The clock is injected so
 * timestamps are deterministic in tests; the repository trusts its typed
 * NewCollectionEntry input (the schema CHECKs are the structural backstop),
 * consistent with B1's loose→strict validation living at the C2 form boundary.
 *
 * add()'s merge-on-insert (resolveAddition → create/increment) lands in the next
 * commit; here it is an announced stub so the interface is satisfied.
 *
 * @format
 */

import type {
  CollectionEntry,
  Condition,
  Finish,
  NewCollectionEntry,
} from '@domain';
import type { CollectionRepository } from './CollectionRepository';
import type { SqliteDatabase, SqlParam } from './sqlite/SqliteDatabase';

/** Tuning knobs for the repository; constructor params are not part of the contract. */
export interface RepositoryDeps {
  /** Returns the current time as an ISO 8601 UTC string. Injected for tests. */
  now?: () => string;
}

const TABLE = 'collection_entries';

/** Mutable domain fields → their columns; drives update()'s dynamic SET. */
const COLUMN_BY_FIELD: Record<keyof NewCollectionEntry, string> = {
  cardId: 'card_id',
  quantity: 'quantity',
  finish: 'finish',
  condition: 'condition',
  notes: 'notes',
};

/** Map a raw row to a CollectionEntry (snake_case → camelCase, id → string). */
const rowToEntry = (row: Record<string, unknown>): CollectionEntry => {
  const entry: CollectionEntry = {
    id: String(row.id),
    cardId: String(row.card_id),
    quantity: Number(row.quantity),
    finish: row.finish as Finish,
    condition: row.condition as Condition,
    addedAt: String(row.added_at),
    updatedAt: String(row.updated_at),
  };
  // notes is optional: a SQL NULL maps to an absent property, not `undefined`.
  return row.notes == null ? entry : { ...entry, notes: String(row.notes) };
};

export const createCollectionRepository = (
  db: SqliteDatabase,
  deps: RepositoryDeps = {},
): CollectionRepository => {
  const now = deps.now ?? (() => new Date().toISOString());

  const findById = async (id: string): Promise<CollectionEntry | null> => {
    const result = await db.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [
      Number(id),
    ]);
    const [row] = result.rows;
    return row ? rowToEntry(row) : null;
  };

  const update = async (
    id: string,
    changes: Partial<NewCollectionEntry>,
  ): Promise<CollectionEntry> => {
    const assignments: string[] = [];
    const params: SqlParam[] = [];
    const fields = Object.keys(COLUMN_BY_FIELD) as Array<
      keyof NewCollectionEntry
    >;
    for (const field of fields) {
      if (field in changes) {
        const value = changes[field];
        assignments.push(`${COLUMN_BY_FIELD[field]} = ?`);
        params.push(value === undefined ? null : value);
      }
    }

    if (assignments.length === 0) {
      const current = await findById(id);
      if (current === null) {
        throw new Error(`update: no collection entry with id ${id}`);
      }
      return current;
    }

    assignments.push('updated_at = ?');
    params.push(now());
    params.push(Number(id));

    const result = await db.execute(
      `UPDATE ${TABLE} SET ${assignments.join(', ')} WHERE id = ? RETURNING *`,
      params,
    );
    const [row] = result.rows;
    if (row === undefined) {
      throw new Error(`update: no collection entry with id ${id}`);
    }
    return rowToEntry(row);
  };

  return {
    add: async (): Promise<CollectionEntry> => {
      throw new Error(
        'add() is implemented in the next commit (merge-on-insert).',
      );
    },

    list: async (): Promise<CollectionEntry[]> => {
      const result = await db.execute(`SELECT * FROM ${TABLE} ORDER BY id`);
      return result.rows.map(rowToEntry);
    },

    getById: findById,

    update,

    remove: async (id: string): Promise<void> => {
      await db.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [Number(id)]);
    },
  };
};
