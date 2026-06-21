import type { Finish } from './attributes';

/**
 * A catalog card — read-only reference data sourced from the upstream catalog
 * (LorcanaJSON). All fields are `readonly`: the app never mutates catalog data,
 * it only caches and reads it. B2's catalog mapper is the only constructor.
 */
export interface Card {
  readonly id: string; // stable catalog identifier
  readonly name: string;
  readonly version?: string; // subtitle, e.g. "Brave Little Tailor"
  readonly setCode: string;
  readonly collectorNumber: string;
  // Includes 'Enchanted' as a RARITY value — enchanted/special printings are
  // distinct Card rows (own collectorNumber + rarity), never finishes. Exact
  // vocabulary is a B2 mapping concern, so this stays loosely typed.
  readonly rarity: string;
  readonly availableFinishes: readonly Finish[]; // closed set: normal | foil
  readonly imageUrl?: string; // remote URL; image bytes never stored (IP guardrail)
}

/**
 * The display title for a card: `name — version`, or just `name` when there is no
 * version. The single source of truth for this em-dash join across the UI and the
 * dev diagnostics (distinct from `cardMatchKey`'s normalized space-join, which is
 * for matching, not display).
 */
export const cardDisplayTitle = (
  card: Pick<Card, 'name' | 'version'>,
): string => (card.version ? `${card.name} — ${card.version}` : card.name);

/**
 * The meta line for a card: `setCode · #collectorNumber · rarity`, joining ONLY
 * the non-empty segments. An off-catalog manual card may carry empty
 * setCode/collectorNumber/rarity (a name is all that's required), so this yields
 * `''` for a name-only card and never renders a stray separator or bare `#`. The
 * single source of truth for the meta join across the UI.
 */
export const formatCardMeta = (
  card: Pick<Card, 'setCode' | 'collectorNumber' | 'rarity'>,
): string =>
  [
    card.setCode,
    card.collectorNumber ? `#${card.collectorNumber}` : '',
    card.rarity,
  ]
    .filter(segment => segment.length > 0)
    .join(' · ');
