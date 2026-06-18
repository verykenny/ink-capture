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
