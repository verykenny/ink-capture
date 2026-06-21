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

/**
 * The live "Boun → Billy Bones" case: two DIFFERENT cards that both print
 * collector number '104' in different sets. With no setCode on the
 * RecognitionSource the exact tier returns both, ranked only by name similarity,
 * so a weak live name read can let the wrong one win at a low confidence — which
 * is exactly what decideRecognition must route to a manual pick rather than
 * silently assert. Hand-authored (invented subtitles); NEVER bulk data.
 */
export const CARD_BOUN: Card = {
  id: 'URR-104',
  name: 'Boun',
  version: 'Tireless Boatman',
  setCode: 'URR',
  collectorNumber: '104',
  rarity: 'Common',
  availableFinishes: ['normal', 'foil'],
};

/** The same-number decoy that wins on a weak read — see CARD_BOUN. */
export const CARD_BILLY_BONES: Card = {
  id: 'TFC-104',
  name: 'Billy Bones',
  version: 'Ship Steward',
  setCode: 'TFC',
  collectorNumber: '104',
  rarity: 'Uncommon',
  availableFinishes: ['normal', 'foil'],
};

/**
 * The D2 device-capture diagnostic cards (2026-06-20) — real NAMES + collector
 * NUMBERS (facts), in catalog form (String(raw.number), no leading zeros) so the
 * parser's normalized number lands on the matcher's exact tier. They drive the D3
 * "do the four cards clear the 0.70 auto-confirm floor on a clean capture" gate.
 * Hand-authored; NEVER bulk catalog data.
 */
export const CARD_GIZMODUCK: Card = {
  id: 'SSK-105',
  name: 'Gizmoduck',
  version: 'Suited Up',
  setCode: 'SSK',
  collectorNumber: '105',
  rarity: 'Rare',
  availableFinishes: ['normal', 'foil'],
};

export const CARD_BALOO: Card = {
  id: 'ITI-069',
  name: 'Baloo',
  version: 'Laid-Back Bear',
  setCode: 'ITI',
  collectorNumber: '69',
  rarity: 'Common',
  availableFinishes: ['normal', 'foil'],
};

export const CARD_DAVID_XANATOS: Card = {
  id: 'AZS-184',
  name: 'David Xanatos',
  version: 'Steel Clan Leader',
  setCode: 'AZS',
  collectorNumber: '184',
  rarity: 'Legendary',
  availableFinishes: ['normal', 'foil'],
};

/**
 * An Action card — **no version** (its match key is just the name). With the
 * Action/Item/Location/Song layout the type line sits directly under the name, so
 * the parser must yield the bare name. CARD_FALLING_RABBIT_HOLE is a same-number
 * (#162) Action decoy — the card that wrongly won at ~35% on the device when the
 * parser appended flavor text. Real NAMES + NUMBERS (facts); hand-authored.
 */
export const CARD_PROMISING_LEAD: Card = {
  id: 'AZS-162',
  name: 'Promising Lead',
  setCode: 'AZS',
  collectorNumber: '162',
  rarity: 'Common',
  availableFinishes: ['normal', 'foil'],
};

export const CARD_FALLING_RABBIT_HOLE: Card = {
  id: 'URR-162',
  name: 'Falling Down the Rabbit Hole',
  setCode: 'URR',
  collectorNumber: '162',
  rarity: 'Uncommon',
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
