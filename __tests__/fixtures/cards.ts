/**
 * Tiny, hand-authored domain fixtures for the B1 logic tests.
 *
 * IP guardrail: this is a handful of invented rows — NEVER import or commit the
 * bulk `allCards.json` or any card images. The values only need to be
 * internally consistent enough to exercise the merge/identity + validation
 * rules.
 *
 * @format
 */

import type { Card, CollectionEntry, NewCollectionEntry } from '@domain';

/** A normal-printing card, available in normal + foil. */
export const CARD_ELSA: Card = {
  id: 'TFC-042',
  name: 'Elsa',
  version: 'Snow Queen',
  setCode: 'TFC',
  collectorNumber: '042',
  rarity: 'Legendary',
  availableFinishes: ['normal', 'foil'],
};

/**
 * The Enchanted printing of the same character — a DISTINCT catalog row with
 * its own id, collector number, and rarity. It is NOT a finish of CARD_ELSA;
 * this is the crux of the settled finish model.
 */
export const CARD_ELSA_ENCHANTED: Card = {
  id: 'TFC-204',
  name: 'Elsa',
  version: 'Snow Queen',
  setCode: 'TFC',
  collectorNumber: '204',
  rarity: 'Enchanted',
  availableFinishes: ['foil'],
};

/**
 * A different-set card that REUSES collector number '042' — Lorcana numbers
 * repeat across sets, so CARD_ELSA ('042', TFC) and this card collide on number
 * alone. A collectorNumber-only query is therefore ambiguous; the name picks the
 * right set's card. Hand-authored — never bulk data.
 */
export const CARD_STITCH_ROCK_STAR: Card = {
  id: 'ROF-042',
  name: 'Stitch',
  version: 'Rock Star',
  setCode: 'ROF',
  collectorNumber: '042',
  rarity: 'Super Rare',
  availableFinishes: ['normal', 'foil'],
};

/** A second distinct card, available in normal + foil. */
export const CARD_MICKEY: Card = {
  id: 'TFC-115',
  name: 'Mickey Mouse',
  version: 'Brave Little Tailor',
  setCode: 'TFC',
  collectorNumber: '115',
  rarity: 'Super Rare',
  availableFinishes: ['normal', 'foil'],
};

/** Build a NewCollectionEntry (pre-persistence) over sensible defaults. */
export const newEntry = (
  overrides: Partial<NewCollectionEntry> = {},
): NewCollectionEntry => ({
  cardId: CARD_ELSA.id,
  quantity: 1,
  finish: 'normal',
  condition: 'NM',
  ...overrides,
});

/** Build a persisted CollectionEntry (with id + timestamps) over defaults. */
export const storedEntry = (
  overrides: Partial<CollectionEntry> = {},
): CollectionEntry => ({
  id: 'entry-elsa-normal-nm',
  cardId: CARD_ELSA.id,
  quantity: 1,
  finish: 'normal',
  condition: 'NM',
  addedAt: '2026-06-17T12:00:00.000Z',
  updatedAt: '2026-06-17T12:00:00.000Z',
  ...overrides,
});
