/**
 * LorcanaCatalogService — the assembled CatalogService.
 *
 * Wires the HTTP fetcher seam, the pure mapper, and the SQLite cache into the
 * sync-and-cache flow:
 *   1. Poll the small metadata.json.
 *   2. If its `generatedOn` matches the cached value AND the cache is non-empty,
 *      skip the download entirely (`updated: false`).
 *   3. Otherwise download allCards.json, map every card, and atomically replace
 *      the cache (a failed/partial download leaves the prior cache intact).
 *
 * Factory params (db/http/baseUrl/now) are NOT part of the CatalogService
 * contract — they are injection seams. `baseUrl` defaults to the configured
 * catalog base (resolveCatalogBaseUrl, backed by react-native-config with a
 * code default), so the service works with no `.env`.
 *
 * @format
 */

import type { SqliteDatabase } from '@services/persistence/sqlite/SqliteDatabase';
import type { CatalogService, CatalogSyncResult } from './CatalogService';
import { resolveCatalogBaseUrl } from './catalogConfig';
import type { HttpJsonClient } from './HttpJsonClient';
import type { LorcanaAllCards, LorcanaMetadata } from './lorcanaTypes';
import { mapLorcanaCard } from './mapLorcanaCard';
import {
  countCards,
  findCardByCollectorNumber,
  listAllCards,
  readCatalogVersion,
  replaceCatalog,
} from './catalogCache';

/** Injection seams for the catalog service (not part of the public contract). */
export interface CatalogServiceDeps {
  db: SqliteDatabase;
  http: HttpJsonClient;
  /** Overrides the configured base URL; trailing slashes are tolerated. */
  baseUrl?: string;
  /** Returns the current time as an ISO 8601 string; injected for tests. */
  now?: () => string;
}

export const createCatalogService = (
  deps: CatalogServiceDeps,
): CatalogService => {
  const { db, http } = deps;
  const baseUrl = (deps.baseUrl ?? resolveCatalogBaseUrl()).replace(/\/+$/, '');
  const now = deps.now ?? (() => new Date().toISOString());

  const sync = async (): Promise<CatalogSyncResult> => {
    const metadata = await http.getJson<LorcanaMetadata>(
      `${baseUrl}/metadata.json`,
    );
    const cached = await readCatalogVersion(db);
    if (
      cached.generatedOn === metadata.generatedOn &&
      (await countCards(db)) > 0
    ) {
      return { updated: false, version: metadata.generatedOn };
    }

    const all = await http.getJson<LorcanaAllCards>(`${baseUrl}/allCards.json`);
    const cards = all.cards.map(mapLorcanaCard);
    await replaceCatalog(db, cards, {
      generatedOn: metadata.generatedOn,
      formatVersion: metadata.formatVersion,
      syncedAt: now(),
    });
    return { updated: true, version: metadata.generatedOn };
  };

  return {
    sync,
    findByCollectorNumber: (setCode, collectorNumber) =>
      findCardByCollectorNumber(db, setCode, collectorNumber),
    getAllCards: () => listAllCards(db),
  };
};
