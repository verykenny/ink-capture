import type { Finish, Condition } from './attributes';

/**
 * A user-owned stack. MINIMAL A3 placeholder so the persistence contract can reference it.
 * B1 finalizes value types, validation, and the merge rule.
 */
export interface CollectionEntry {
  id: string;
  cardId: string; // → Card.id
  quantity: number; // count of this card + finish + condition stack
  finish: Finish;
  condition: Condition;
  notes?: string;
  addedAt: string; // ISO timestamp (B1 may switch to Date)
  updatedAt: string;
}
