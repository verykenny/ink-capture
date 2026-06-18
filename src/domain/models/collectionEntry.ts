import type { Finish, Condition } from './attributes';

/**
 * A user-owned stack: every owned copy of one card in one finish + condition is
 * counted as `quantity` on a single entry (the merge rule in matching/ enforces
 * this identity). Timestamps are ISO 8601 UTC strings so the domain stays
 * trivially serializable (SQLite TEXT / JSON); the UI formats them on render.
 */
export interface CollectionEntry {
  id: string;
  cardId: string; // → Card.id
  quantity: number; // positive integer; count of this card + finish + condition stack
  finish: Finish;
  condition: Condition;
  notes?: string;
  addedAt: string; // ISO 8601 UTC, e.g. '2026-06-17T12:00:00.000Z'
  updatedAt: string; // ISO 8601 UTC
}

/**
 * A new entry before its persisted id/timestamps are assigned.
 * Lives here (not in @services) so domain logic can consume it without an
 * outward dependency; re-exported from @services/persistence for consumers.
 */
export type NewCollectionEntry = Omit<
  CollectionEntry,
  'id' | 'addedAt' | 'updatedAt'
>;

/** The merge identity: a stack is unique per (card + finish + condition). */
export type CollectionEntryKey = Pick<
  CollectionEntry,
  'cardId' | 'finish' | 'condition'
>;
