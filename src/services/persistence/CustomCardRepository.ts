import type { Card, CustomCardInput } from '@domain';

/**
 * Local store of off-catalog ("manual") cards — the ones a user adds by hand
 * when a scan finds nothing in LorcanaJSON. Additive to the persistence layer: it
 * touches neither the collection nor the catalog store. Rows map to the existing
 * `Card` model with a synthetic `manual:<rowid>` id (provenance by prefix), so
 * there is no `CustomCard` type and no `Card`/`CollectionEntry` schema change.
 * Impl (E1): SQLite `custom_cards` (migration 003).
 */
export interface CustomCardRepository {
  /** Persist a new manual card and return it as a Card (mints `manual:<rowid>`). */
  create(input: CustomCardInput): Promise<Card>;
  /** Every manual card, oldest first — merged into the catalog lookup for display. */
  getAll(): Promise<Card[]>;
  /** Resolve one manual card by its `manual:<rowid>` id, or null. */
  getById(id: string): Promise<Card | null>;
}
