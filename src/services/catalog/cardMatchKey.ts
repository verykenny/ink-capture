/**
 * The canonical match key for a catalog card.
 *
 * Single source of truth shared by B2 and C1: the cache stores this value in
 * the `normalized_name` column (catalogCache delegates here), and C1's matcher
 * derives the same key for every catalog row. Because both sides run the one
 * function over name + version, a cached row and a normalized scan are provably
 * comparable — there is no place for the two to drift.
 *
 * @format
 */

import type { Card } from '@domain';
import { normalizeCardName } from './normalizeName';

/** Normalized `name version` (or just `name` when version-less) for matching. */
export const cardMatchKey = (card: Card): string =>
  normalizeCardName(card.version ? `${card.name} ${card.version}` : card.name);
