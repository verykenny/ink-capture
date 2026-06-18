/**
 * Tiny, hand-authored raw-LorcanaJSON fixtures for the B2 mapper/cache/service
 * specs.
 *
 * IP guardrail: this is a handful of invented rows — NEVER import or commit the
 * bulk `allCards.json` or any card images. Image URLs below point at a fake
 * `example.test` host; no real asset bytes or upstream URLs are stored.
 *
 * Faithfulness note (verified read-only against a live `allCards.json`,
 * 2026-06-17): the real source uses INTEGER `id`/`number`, a numeric-string
 * `setCode` (e.g. "1"), and a `foilTypes` list whose values are strings like
 * "None" (a non-foil printing exists) and "Silver"/"Lava"/"Satin" (foils).
 *  - RAW_ELSA / RAW_ELSA_ENCHANTED / RAW_MICKEY reproduce B1's existing `cards.ts`
 *    catalog rows (string ids/`setCode` "TFC") so those settled `Card` fixtures
 *    double as the expected mapper outputs.
 *  - RAW_ACTION / RAW_SPECIAL use realistic NUMERIC `id`/`number` to exercise the
 *    mapper's `String()` coercion, the `images.full` → `imageUrl` path, a
 *    version-less card, and a normal-only vs foil-only `foilTypes`.
 *
 * @format
 */

import type { Card } from '@domain';
import type {
  LorcanaAllCards,
  LorcanaCard,
  LorcanaMetadata,
} from '@services/catalog/lorcanaTypes';
import { CARD_ELSA, CARD_ELSA_ENCHANTED, CARD_MICKEY } from './cards';

/** Small `metadata.json` fixture — the cache-skip change signal lives here. */
export const LORCANA_METADATA: LorcanaMetadata = {
  formatVersion: '2.3.2',
  generatedOn: '2026-05-26T19:11:58',
  language: 'en',
};

/** A later regeneration — same schema, newer `generatedOn` (drives a refresh). */
export const LORCANA_METADATA_V2: LorcanaMetadata = {
  formatVersion: '2.3.2',
  generatedOn: '2026-06-10T08:00:00',
  language: 'en',
};

/** Normal printing → normal + foil. Maps to CARD_ELSA (no image). */
export const RAW_ELSA: LorcanaCard = {
  id: 'TFC-042',
  name: 'Elsa',
  version: 'Snow Queen',
  setCode: 'TFC',
  number: '042',
  rarity: 'Legendary',
  foilTypes: ['None', 'Silver'],
  fullName: 'Elsa - Snow Queen',
  simpleName: 'elsa snow queen',
};

/**
 * The Enchanted printing — a DISTINCT row (own id + collector number + rarity),
 * foil-only (`foilTypes` has no 'None'). Maps to CARD_ELSA_ENCHANTED.
 */
export const RAW_ELSA_ENCHANTED: LorcanaCard = {
  id: 'TFC-204',
  name: 'Elsa',
  version: 'Snow Queen',
  setCode: 'TFC',
  number: '204',
  rarity: 'Enchanted',
  foilTypes: ['Lava'],
  fullName: 'Elsa - Snow Queen',
  simpleName: 'elsa snow queen',
};

/** A second normal+foil card. Maps to CARD_MICKEY (no image). */
export const RAW_MICKEY: LorcanaCard = {
  id: 'TFC-115',
  name: 'Mickey Mouse',
  version: 'Brave Little Tailor',
  setCode: 'TFC',
  number: '115',
  rarity: 'Super Rare',
  foilTypes: ['None', 'Silver'],
  fullName: 'Mickey Mouse - Brave Little Tailor',
  simpleName: 'mickey mouse brave little tailor',
};

/**
 * A version-less action card with NUMERIC id/number, an image, and a
 * normal-only `foilTypes`. Exercises String() coercion, the imageUrl path, the
 * absent-version branch, and `['None']` → `['normal']`.
 */
export const RAW_ACTION: LorcanaCard = {
  id: 1042,
  name: 'Sudden Chill',
  setCode: 'TFC',
  number: 17,
  rarity: 'Common',
  foilTypes: ['None'],
  fullName: 'Sudden Chill',
  simpleName: 'sudden chill',
  images: {
    full: 'https://catalog.example.test/img/sudden-chill-full.jpg',
    thumbnail: 'https://catalog.example.test/img/sudden-chill-thumb.jpg',
    foilMask: 'https://catalog.example.test/img/sudden-chill-mask.jpg',
  },
};

export const MAPPED_ACTION: Card = {
  id: '1042',
  name: 'Sudden Chill',
  setCode: 'TFC',
  collectorNumber: '17',
  rarity: 'Common',
  availableFinishes: ['normal'],
  imageUrl: 'https://catalog.example.test/img/sudden-chill-full.jpg',
};

/**
 * A Special-rarity promo: NUMERIC id/number, a version, and a foil-only
 * `foilTypes` whose value isn't 'Lava' — proving ANY non-'None' entry yields
 * `['foil']` regardless of the specific foil name. No image.
 */
export const RAW_SPECIAL: LorcanaCard = {
  id: 2099,
  name: 'Mickey Mouse',
  version: 'Detective',
  setCode: 'TFC',
  number: 99,
  rarity: 'Special',
  foilTypes: ['Satin'],
  fullName: 'Mickey Mouse - Detective',
  simpleName: 'mickey mouse detective',
};

export const MAPPED_SPECIAL: Card = {
  id: '2099',
  name: 'Mickey Mouse',
  version: 'Detective',
  setCode: 'TFC',
  collectorNumber: '99',
  rarity: 'Special',
  availableFinishes: ['foil'],
};

/** Every raw card, paired with its expected mapper output. */
export const RAW_TO_MAPPED: ReadonlyArray<{ raw: LorcanaCard; mapped: Card }> =
  [
    { raw: RAW_ELSA, mapped: CARD_ELSA },
    { raw: RAW_ELSA_ENCHANTED, mapped: CARD_ELSA_ENCHANTED },
    { raw: RAW_MICKEY, mapped: CARD_MICKEY },
    { raw: RAW_ACTION, mapped: MAPPED_ACTION },
    { raw: RAW_SPECIAL, mapped: MAPPED_SPECIAL },
  ];

/** The raw cards, in fixture order. */
export const RAW_CARDS: readonly LorcanaCard[] = RAW_TO_MAPPED.map(
  pair => pair.raw,
);

/** The expected mapped cards, in fixture order. */
export const MAPPED_CARDS: readonly Card[] = RAW_TO_MAPPED.map(
  pair => pair.mapped,
);

/** A complete `allCards.json` payload over the fixture cards. */
export const LORCANA_ALL_CARDS: LorcanaAllCards = {
  metadata: LORCANA_METADATA,
  sets: { '1': { name: 'The First Chapter', number: 1 } },
  cards: [...RAW_CARDS],
};
