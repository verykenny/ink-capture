import type {
  CollectionEntry,
  CollectionEntryKey,
  NewCollectionEntry,
} from '../models/collectionEntry';

/** Project an entry-like value down to its merge identity. */
export const collectionEntryKey = (
  e: CollectionEntryKey,
): CollectionEntryKey => ({
  cardId: e.cardId,
  finish: e.finish,
  condition: e.condition,
});

/** Two entries belong to the same stack iff their identities are equal. */
export const isSameStack = (
  a: CollectionEntryKey,
  b: CollectionEntryKey,
): boolean =>
  a.cardId === b.cardId && a.finish === b.finish && a.condition === b.condition;

/**
 * What an addition should do, as a pure intent:
 * - `increment`: bump an existing stack — carries the matched `targetId` and the
 *   NEW summed `quantity` only (NOT the full entry — so B3's write can't clobber
 *   concurrently-changed fields, and incoming `notes` are intentionally dropped).
 * - `create`: persist a brand-new stack — carries the incoming entry.
 */
export type AddOutcome =
  | {
      readonly kind: 'increment';
      readonly targetId: string;
      readonly quantity: number;
    }
  | { readonly kind: 'create'; readonly entry: NewCollectionEntry };

/**
 * Resolve how an incoming addition merges into the current collection: increment
 * the stack with the same (cardId, finish, condition) identity, or create a new
 * one. PURE — no id/timestamp generation, no I/O, no mutation; B3 maps the
 * outcome to a write.
 *
 * `existing` may be the full collection or a pre-queried candidate slice.
 * Throws if it contains more than one stack for the incoming identity: that is
 * data corruption, and B3 must enforce a UNIQUE index on
 * (cardId, finish, condition) to make it impossible.
 */
export const resolveAddition = (
  existing: readonly CollectionEntry[],
  incoming: NewCollectionEntry,
): AddOutcome => {
  const matches = existing.filter(entry => isSameStack(entry, incoming));

  if (matches.length === 0) {
    return { kind: 'create', entry: incoming };
  }

  if (matches.length > 1) {
    throw new Error(
      `resolveAddition: found ${matches.length} stacks for identity ` +
        `(cardId=${incoming.cardId}, finish=${incoming.finish}, ` +
        `condition=${incoming.condition}); expected at most one. B3 must ` +
        'enforce a UNIQUE index on (cardId, finish, condition).',
    );
  }

  const [match] = matches;
  return {
    kind: 'increment',
    targetId: match.id,
    quantity: match.quantity + incoming.quantity,
  };
};
