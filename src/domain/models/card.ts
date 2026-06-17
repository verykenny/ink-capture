/**
 * Catalog card (read-only reference). MINIMAL A3 placeholder — identity fields only.
 * B1 expands (rarity, version, availableFinishes, imageUrl) + reconciles the README model.
 */
export interface Card {
  id: string; // stable catalog identifier
  name: string;
  setCode: string;
  collectorNumber: string;
}
