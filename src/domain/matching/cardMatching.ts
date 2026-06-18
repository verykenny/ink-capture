/**
 * matchEntries — the pure ranking core of the recognition matcher.
 *
 * Turns a normalized query (`collectorNumber?` + `nameKey?`) into best-first
 * `RecognitionCandidate`s over pre-keyed catalog entries. It is two-tier:
 *
 *  1. **Exact tier** — when `collectorNumber` is present and at least one entry
 *     shares it. Lorcana numbers repeat across sets and the frozen
 *     `RecognitionSource` carries no setCode, so the number alone may be
 *     ambiguous; `name` (when present) disambiguates by ranking on similarity.
 *     The exact tier is NOT thresholded — a low-confidence number hit is still
 *     returned for the user to confirm.
 *  2. **Fuzzy tier** — the name-similarity fallback (added next commit).
 *
 * A non-empty exact tier wins outright. With no usable signal the result is `[]`.
 *
 * Pure: no I/O, no mutation, no @services import. The caller precomputes each
 * entry's `key` (the shared `cardMatchKey`) and normalizes the query, so the
 * cached catalog column and a scanned query are provably comparable.
 *
 * @format
 */

import type { Card } from '../models/card';
import type { RecognitionCandidate } from './recognitionResult';
import { similarity } from './levenshtein';

/** A catalog card paired with its precomputed match key (the shared cardMatchKey). */
export interface CatalogMatchEntry {
  card: Card;
  key: string;
}

/** A query already normalized for matching: number as-is, name as a match key. */
export interface NormalizedQuery {
  collectorNumber?: string;
  nameKey?: string;
}

/** Rank the exact-tier matches; not thresholded, best-first when a name is given. */
const rankExactTier = (
  matches: readonly CatalogMatchEntry[],
  nameKey: string | undefined,
): RecognitionCandidate[] => {
  if (nameKey === undefined) {
    const confidence = 1 / matches.length;
    return matches.map(entry => ({ card: entry.card, confidence }));
  }
  return matches
    .map(entry => ({
      card: entry.card,
      confidence: similarity(nameKey, entry.key),
    }))
    .sort((a, b) => b.confidence - a.confidence);
};

export const matchEntries = (
  query: NormalizedQuery,
  entries: readonly CatalogMatchEntry[],
): RecognitionCandidate[] => {
  const { collectorNumber, nameKey } = query;

  if (collectorNumber !== undefined) {
    const exact = entries.filter(
      entry => entry.card.collectorNumber === collectorNumber,
    );
    if (exact.length > 0) {
      return rankExactTier(exact, nameKey);
    }
    // Exact tier empty → fall through to the fuzzy fallback below.
  }

  // Fuzzy tier lands in the next commit; until then a name-only query matches
  // nothing. A query with no usable signal is always a no-match.
  return [];
};
