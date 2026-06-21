/**
 * collectionSearch — pure, predictable search over the SAVED collection (E3).
 *
 * This is plain normalized-substring filtering, deliberately NOT the fuzzy OCR
 * matcher (`matchEntries`): a collection search should be literal and stable, not
 * tolerance-ranked. Each entry's `cardId` is resolved to a `Card` via the passed
 * `lookup` (the same catalog + custom map the list already uses), then:
 *
 * - PRIMARY: the normalized query is matched as a SUBSTRING of the card's
 *   `name` (+ ` version`).
 * - SECONDARY: an exact `collectorNumber`, or a `setCode` token (both compared as
 *   whole normalized tokens, so "04" ≠ "042" and "tf" ≠ "tfc").
 * - UNRESOLVED entries (no card in the lookup) fall back to a substring match on
 *   the raw `cardId`, so a `manual:`/unknown row is still findable.
 *
 * Normalization is the shared `normalizeCardName` (NFD diacritic-folding,
 * lowercasing, non-alphanumerics → spaces), so the query and the card text are
 * compared on the same footing. An empty/whitespace query matches everything.
 *
 * @format
 */

import type { CollectionEntry } from '@domain';
import { normalizeCardName } from '@services';
import type { CardLookup } from './useCardLookup';

/** Does this entry match the query? Pure; safe to call per-render over a small list. */
export const matchesQuery = (
  entry: CollectionEntry,
  query: string,
  lookup: CardLookup,
): boolean => {
  const q = normalizeCardName(query);
  if (q === '') {
    return true;
  }

  const card = lookup(entry.cardId);
  if (!card) {
    // No resolved card (manual:/unknown id) — fall back to the raw cardId.
    return normalizeCardName(entry.cardId).includes(q);
  }

  const nameKey = normalizeCardName(
    card.version ? `${card.name} ${card.version}` : card.name,
  );
  if (nameKey.includes(q)) {
    return true;
  }

  // Secondary tokens: exact collectorNumber or exact setCode (not substrings).
  if (card.collectorNumber && normalizeCardName(card.collectorNumber) === q) {
    return true;
  }
  if (card.setCode && normalizeCardName(card.setCode) === q) {
    return true;
  }
  return false;
};

/** Filter the collection to the entries matching `query` (all entries if empty). */
export const filterCollection = (
  entries: readonly CollectionEntry[],
  query: string,
  lookup: CardLookup,
): CollectionEntry[] =>
  entries.filter(entry => matchesQuery(entry, query, lookup));
