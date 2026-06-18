/**
 * Public surface of the catalog service.
 *
 * Re-exports the contract (CatalogService), the factory + its injection seams,
 * the production HTTP client, the loose LorcanaJSON input types, the pure
 * mapper, and `normalizeCardName` (which C1 reuses on the query side). The cache
 * internals (catalogCache.ts) stay unexported — they are an implementation
 * detail the factory composes.
 *
 * @format
 */

export * from './CatalogService';
export * from './LorcanaCatalogService';
export * from './catalogConfig';
export * from './HttpJsonClient';
export * from './lorcanaTypes';
export { mapLorcanaCard } from './mapLorcanaCard';
export { normalizeCardName } from './normalizeName';
