/**
 * Collection statistics — pure aggregation over the saved collection.
 *
 * `computeCollectionStats` is a PURE reducer: hand it the saved entries plus the
 * catalog cards (the completion *denominator*, derived in-memory — there is NO
 * `CatalogService` method and NO migration for this), and it returns per-set
 * completion plus an overall summary. It lives in `@domain` and imports only
 * domain models — no `@services`, no I/O.
 *
 * Counting rules (ratified, E3):
 * - "Collected" = a DISTINCT catalog `cardId` owned. Finish, condition, and
 *   quantity are irrelevant to *completion*: a card's normal + foil printings (two
 *   stacks, same `cardId`) count as ONE toward a set. Per set:
 *   `ownedDistinct / setSize`.
 * - A `cardId` starting with `manual:` is OFF-CATALOG; a `cardId` that is neither
 *   `manual:` nor present in the catalog index is UNKNOWN. Both are excluded from
 *   every set numerator/denominator and from overall completion, but their copies
 *   feed `totalCopies` and they are surfaced via their own distinct counts.
 * - Zero-guards: a set with nothing owned reports 0%; an empty catalog yields
 *   overall 0% (never NaN). Completion spans ALL distinct catalog rows including
 *   Enchanted/Special printings (a base-set-only view is a noted future
 *   refinement, deliberately not built here).
 *
 * `completionPct` is an exact percentage in [0, 100] (unrounded); the UI rounds
 * for display.
 *
 * @format
 */

import type { Card } from '../models/card';
import type { CollectionEntry } from '../models/collectionEntry';

/** Completion for one catalog set. */
export interface SetStat {
  setCode: string;
  /** Distinct catalog cardIds owned in this set. */
  ownedDistinct: number;
  /** Distinct catalog rows the set contains (the denominator). */
  setSize: number;
  /** `ownedDistinct / setSize` as a percentage in [0, 100]; 0 when setSize is 0. */
  completionPct: number;
  /** Sum of quantities across every owned stack in this set. */
  ownedCopies: number;
}

/** The aggregated view of a collection against the catalog. */
export interface CollectionStats {
  /** One entry per catalog set, sorted by `setCode` (stable). */
  perSet: SetStat[];
  overall: {
    /** Distinct catalog cardIds owned across all sets. */
    distinctCatalogOwned: number;
    /** Distinct rows in the whole catalog (the overall denominator). */
    catalogTotal: number;
    /** `distinctCatalogOwned / catalogTotal` as a percentage; 0 when empty. */
    completionPct: number;
    /** Sum of ALL entry quantities (catalog + off-catalog + unknown). */
    totalCopies: number;
    /** Distinct `manual:` (off-catalog) cardIds owned. */
    offCatalogDistinct: number;
    /** Distinct owned cardIds that resolve to neither the catalog nor `manual:`. */
    unknownDistinct: number;
  };
}

const MANUAL_PREFIX = 'manual:';

/** Percentage in [0, 100], guarding a zero denominator (→ 0, never NaN). */
const pct = (owned: number, total: number): number =>
  total === 0 ? 0 : (owned / total) * 100;

/** Mutable accumulator for one set while folding entries. */
interface SetAccumulator {
  setSize: number;
  ownedDistinct: Set<string>;
  ownedCopies: number;
}

export const computeCollectionStats = (
  entries: readonly CollectionEntry[],
  catalogCards: readonly Card[],
): CollectionStats => {
  // Index the catalog: cardId → setCode, and seed one accumulator per set with
  // its size (distinct catalog rows). Catalog ids are unique, so each row adds 1.
  const cardSet = new Map<string, string>();
  const sets = new Map<string, SetAccumulator>();
  for (const card of catalogCards) {
    cardSet.set(card.id, card.setCode);
    const acc = sets.get(card.setCode);
    if (acc) {
      acc.setSize += 1;
    } else {
      sets.set(card.setCode, {
        setSize: 1,
        ownedDistinct: new Set(),
        ownedCopies: 0,
      });
    }
  }

  let totalCopies = 0;
  const distinctCatalogOwned = new Set<string>();
  const offCatalogDistinct = new Set<string>();
  const unknownDistinct = new Set<string>();

  for (const entry of entries) {
    totalCopies += entry.quantity;
    const { cardId } = entry;

    if (cardId.startsWith(MANUAL_PREFIX)) {
      offCatalogDistinct.add(cardId);
      continue;
    }

    const setCode = cardSet.get(cardId);
    if (setCode === undefined) {
      unknownDistinct.add(cardId);
      continue;
    }

    // A catalog card: fold it into its set (the set is guaranteed to exist).
    distinctCatalogOwned.add(cardId);
    const acc = sets.get(setCode);
    if (acc) {
      acc.ownedDistinct.add(cardId);
      acc.ownedCopies += entry.quantity;
    }
  }

  const perSet: SetStat[] = [...sets.entries()]
    .map(([setCode, acc]) => ({
      setCode,
      ownedDistinct: acc.ownedDistinct.size,
      setSize: acc.setSize,
      completionPct: pct(acc.ownedDistinct.size, acc.setSize),
      ownedCopies: acc.ownedCopies,
    }))
    .sort((a, b) =>
      a.setCode < b.setCode ? -1 : a.setCode > b.setCode ? 1 : 0,
    );

  return {
    perSet,
    overall: {
      distinctCatalogOwned: distinctCatalogOwned.size,
      catalogTotal: catalogCards.length,
      completionPct: pct(distinctCatalogOwned.size, catalogCards.length),
      totalCopies,
      offCatalogDistinct: offCatalogDistinct.size,
      unknownDistinct: unknownDistinct.size,
    },
  };
};
