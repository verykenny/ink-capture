/**
 * createCardMatcher — the assembled, catalog-aware recognition matcher.
 *
 * Bridges a `CatalogReader` (the cached catalog) to the pure `matchEntries`
 * ranking core: it reads every card, keys each with the shared `cardMatchKey`,
 * normalizes the query `name` with the same `normalizeCardName` B2 used, runs
 * the matcher, and wraps the candidates into a `RecognitionResult` with the
 * `source` echoed back. The pure core stays in @domain; this catalog-touching
 * assembly correctly lives in @services.
 *
 * D1's OcrCardRecognizer will call `match(source)` after OCR and return its
 * result; C2 uses the StubCardRecognizer instead (no OCR yet).
 *
 * @format
 */

import { matchEntries } from '@domain';
import type {
  CatalogMatchEntry,
  MatchOptions,
  NormalizedQuery,
  RecognitionResult,
  RecognitionSource,
} from '@domain';
import { cardMatchKey, normalizeCardName } from '@services/catalog';
import type { CatalogService } from '@services/catalog';

/** The narrow slice of the catalog the matcher needs — CatalogService satisfies it. */
export type CatalogReader = Pick<CatalogService, 'getAllCards'>;

/** Turns recognition signals into a ranked result against the cached catalog. */
export interface CardMatcher {
  match(source: RecognitionSource): Promise<RecognitionResult>;
}

export const createCardMatcher = (
  reader: CatalogReader,
  options?: MatchOptions,
): CardMatcher => ({
  async match(source: RecognitionSource): Promise<RecognitionResult> {
    const cards = await reader.getAllCards();
    const entries: CatalogMatchEntry[] = cards.map(card => ({
      card,
      key: cardMatchKey(card),
    }));
    const query: NormalizedQuery = {
      collectorNumber: source.collectorNumber,
      nameKey: source.name ? normalizeCardName(source.name) : undefined,
    };
    return { candidates: matchEntries(query, entries, options), source };
  },
});
