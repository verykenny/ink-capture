import type { Card } from '@domain';

/** Outcome of a catalog sync. */
export interface CatalogSyncResult {
  updated: boolean; // true if fresh data was downloaded
  version?: string; // upstream version now cached
}

/**
 * Syncs LorcanaJSON into a local cache + exposes lookups the matcher uses.
 * Impl (B2): fetch allCards.json, map → Card, cache w/ version check, index.
 */
export interface CatalogService {
  sync(): Promise<CatalogSyncResult>;
  findByCollectorNumber(
    setCode: string,
    collectorNumber: string,
  ): Promise<Card | null>;
  getAllCards(): Promise<Card[]>; // feeds C1's fuzzy pass
}
