/**
 * Loose input types for the LorcanaJSON fields B2 actually reads.
 *
 * This is the untyped-JSON boundary: only the consumed subset is modeled, and
 * `id`/`number` permit `string | number` because they arrive from an external
 * payload and the mapper coerces them with `String()`. In the live source both
 * are integers; the wider type keeps the seam defensive without changing the
 * mapping. Nothing here is the app's public model — that's `Card` in @domain.
 *
 * @format
 */

/** The small `metadata.json` payload — the cache-skip change signal. */
export interface LorcanaMetadata {
  /** `major.minor.patch`; bumps on a schema-breaking change. */
  formatVersion: string;
  /** ISO 8601 timestamp (no timezone suffix); changes on every regeneration. */
  generatedOn: string;
  language?: string;
}

/** Image URLs for a card (URLs only — image bytes are never stored: IP guardrail). */
export interface LorcanaCardImages {
  full?: string;
  thumbnail?: string;
  foilMask?: string;
}

/** A single card record — only the fields the mapper consumes. */
export interface LorcanaCard {
  id: string | number;
  name: string;
  version?: string;
  setCode: string;
  number: string | number;
  rarity: string;
  /**
   * Printing finishes. `'None'` means a non-foil printing exists; any other
   * entry (e.g. `'Silver'`, `'Lava'`, `'Satin'`) is a foil printing.
   */
  foilTypes?: string[];
  fullName?: string;
  simpleName?: string;
  images?: LorcanaCardImages;
}

/** The `allCards.json` payload: `{ metadata, sets, cards[] }`. */
export interface LorcanaAllCards {
  metadata: LorcanaMetadata;
  /** Set metadata keyed by set number string; B2 does not consume its contents. */
  sets: Record<string, unknown>;
  cards: LorcanaCard[];
}
