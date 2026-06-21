/**
 * SQLite-backed CollectionRepository.
 *
 * Maps domain CollectionEntry values to/from the collection_entries table (B3's
 * migration 001) over the SqliteDatabase seam. The clock is injected so
 * timestamps are deterministic in tests; the repository trusts its typed
 * NewCollectionEntry input (the schema CHECKs are the structural backstop),
 * consistent with B1's loose→strict validation living at the C2 form boundary.
 *
 * add() implements merge-on-insert: it resolves the incoming entry against its
 * identity-scoped stack with B1's resolveAddition, then maps the AddOutcome to a
 * create or increment write, transactionally.
 *
 * @format
 */

import { resolveAddition } from '@domain';
import type {
  CollectionEntry,
  Condition,
  Finish,
  NewCollectionEntry,
} from '@domain';
import type { CollectionRepository } from './CollectionRepository';
import {
  withTransaction,
  type SqliteDatabase,
  type SqlParam,
} from './sqlite/SqliteDatabase';

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

/** Take the single row a `RETURNING` statement is expected to yield, or fail loudly. */
const requireRow = (
  rows: ReadonlyArray<Record<string, unknown>>,
  context: string,
): Record<string, unknown> => {
  const [row] = rows;
  if (row === undefined) {
    throw new Error(`${context}: expected a returned row but got none`);
  }
  return row;
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

    // No mappable fields → nothing to write: return the current row unchanged
    // (no updated_at bump), or throw if it's gone. A pure read, so no transaction.
    if (assignments.length === 0) {
      const current = await findById(id);
      if (current === null) {
        throw new Error(`update: no collection entry with id ${id}`);
      }
      return current;
    }

    // A finish/condition/card edit can move the row onto another stack's identity
    // and hit the UNIQUE index. Resolve the resulting identity against the OTHER
    // stacks with B1's resolveAddition so the edit MERGES into an occupied tuple
    // instead of throwing — all in one transaction, so a partial merge (target
    // bumped but source not yet deleted) can never persist.
    return withTransaction(db, async () => {
      const current = await findById(id);
      if (current === null) {
        throw new Error(`update: no collection entry with id ${id}`);
      }

      const resulting: NewCollectionEntry = {
        cardId: changes.cardId ?? current.cardId,
        quantity: changes.quantity ?? current.quantity,
        finish: changes.finish ?? current.finish,
        condition: changes.condition ?? current.condition,
      };

      const others = await db.execute(
        `SELECT * FROM ${TABLE} ` +
          'WHERE card_id = ? AND finish = ? AND condition = ? AND id <> ?',
        [resulting.cardId, resulting.finish, resulting.condition, Number(id)],
      );
      const outcome = resolveAddition(others.rows.map(rowToEntry), resulting);

      if (outcome.kind === 'create') {
        // Free tuple (incl. editing onto the row's own identity): re-key the
        // source row in place with the requested changes.
        const result = await db.execute(
          `UPDATE ${TABLE} SET ${assignments.join(', ')}, updated_at = ? ` +
            'WHERE id = ? RETURNING *',
          [...params, now(), Number(id)],
        );
        return rowToEntry(requireRow(result.rows, 'update/create'));
      }

      // Occupied tuple: fold this row into the target stack — sum the quantity
      // onto the target (keeping the target's notes, dropping the source's), then
      // delete the now-merged source row.
      const merged = await db.execute(
        `UPDATE ${TABLE} SET quantity = ?, updated_at = ? WHERE id = ? RETURNING *`,
        [outcome.quantity, now(), Number(outcome.targetId)],
      );
      const mergedRow = requireRow(merged.rows, 'update/increment');
      await db.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [Number(id)]);
      return rowToEntry(mergedRow);
    });
  };

  /**
   * Merge-on-insert: resolve the incoming entry against its identity-scoped
   * stack (B1's resolveAddition), then map the resulting AddOutcome to a write.
   * Faithful to the outcome — no "improvements":
   *  - create    → INSERT a fresh row, id + added_at == updated_at == now().
   *  - increment → UPDATE ONLY quantity (to outcome.quantity) and updated_at,
   *                matched by outcome.targetId; notes and every other field are
   *                left untouched (incoming notes are intentionally dropped).
   * The whole thing runs in one transaction so a failed write leaves no trace.
   */
  const add = (entry: NewCollectionEntry): Promise<CollectionEntry> =>
    withTransaction(db, async () => {
      const identityMatches = await db.execute(
        `SELECT * FROM ${TABLE} WHERE card_id = ? AND finish = ? AND condition = ?`,
        [entry.cardId, entry.finish, entry.condition],
      );
      const outcome = resolveAddition(
        identityMatches.rows.map(rowToEntry),
        entry,
      );

      if (outcome.kind === 'create') {
        const created = outcome.entry;
        const timestamp = now();
        const result = await db.execute(
          `INSERT INTO ${TABLE} ` +
            '(card_id, quantity, finish, condition, notes, added_at, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
          [
            created.cardId,
            created.quantity,
            created.finish,
            created.condition,
            created.notes ?? null,
            timestamp,
            timestamp,
          ],
        );
        return rowToEntry(requireRow(result.rows, 'add/create'));
      }

      const result = await db.execute(
        `UPDATE ${TABLE} SET quantity = ?, updated_at = ? WHERE id = ? RETURNING *`,
        [outcome.quantity, now(), Number(outcome.targetId)],
      );
      return rowToEntry(requireRow(result.rows, 'add/increment'));
    });

  return {
    add,

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
