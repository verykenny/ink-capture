/**
 * Pure LorcanaJSON → Card mapping.
 *
 * The DoD names data mapping as must-be-test-first, so this stays free of I/O
 * and side effects. `normalized_name` is intentionally NOT produced here — it is
 * a persistence-only column the cache derives from the mapped Card (see
 * catalogCache.ts), keeping the domain `Card` free of storage concerns.
 *
 * @format
 */

import type { Card } from '@domain';
import type { Finish } from '@domain';
import type { LorcanaCard } from './lorcanaTypes';

/** `foilTypes` sentinel meaning "a non-foil (normal) printing exists". */
const NO_FOIL = 'None';

/**
 * Derive the closed finish set from `foilTypes`:
 *  - `'normal'` iff the list contains `'None'`,
 *  - `'foil'` iff it contains any other (non-`'None'`) entry,
 *  - default `['normal']` when `foilTypes` is absent or empty.
 * Order is always `['normal', 'foil']` for deterministic output.
 */
const deriveFinishes = (foilTypes: readonly string[] | undefined): Finish[] => {
  if (foilTypes === undefined || foilTypes.length === 0) {
    return ['normal'];
  }
  const finishes: Finish[] = [];
  if (foilTypes.includes(NO_FOIL)) {
    finishes.push('normal');
  }
  if (foilTypes.some(type => type !== NO_FOIL)) {
    finishes.push('foil');
  }
  return finishes.length > 0 ? finishes : ['normal'];
};

export const mapLorcanaCard = (raw: LorcanaCard): Card => {
  const card: Card = {
    id: String(raw.id),
    name: raw.name,
    setCode: raw.setCode,
    collectorNumber: String(raw.number),
    rarity: raw.rarity,
    availableFinishes: deriveFinishes(raw.foilTypes),
  };
  // version/imageUrl are optional: omit the property entirely when absent rather
  // than setting it to `undefined` (mirrors the repository's notes handling).
  const withVersion = raw.version ? { ...card, version: raw.version } : card;
  const imageUrl = raw.images?.full;
  return imageUrl ? { ...withVersion, imageUrl } : withVersion;
};
