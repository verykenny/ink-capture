/**
 * createCardMatcher — the assembled, catalog-aware matcher.
 *
 * Wraps the pure `matchEntries` core over a CatalogReader seam: it reads the
 * cached cards, keys each with the shared `cardMatchKey`, normalizes the query
 * name with the same `normalizeCardName`, and echoes `source` back. Exercised
 * here against a fake reader over the committed fixtures — no DB, no network.
 * The "elsa snow queen" resolution proves zero normalization drift with B2's
 * cached `normalized_name` column (both derive keys from cardMatchKey).
 *
 * @format
 */

import { createCardMatcher, type CatalogReader } from '@services';
import type { Card } from '@domain';
import {
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
} from '../fixtures/cards';

const fakeReader = (cards: readonly Card[]): CatalogReader => ({
  getAllCards: () => Promise.resolve([...cards]),
});

const reader = fakeReader([
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
]);

describe('createCardMatcher', () => {
  test('resolves a fuzzy name query end-to-end via cardMatchKey (no drift with B2)', async () => {
    const matcher = createCardMatcher(reader);
    // "Elsa - Snow Queen" normalizes to the same "elsa snow queen" key the cache
    // derives from name + version, so both Elsa printings hit at confidence 1.
    const result = await matcher.match({ name: 'Elsa - Snow Queen' });
    expect(result.candidates.map(candidate => candidate.card.id)).toEqual([
      CARD_ELSA.id,
      CARD_ELSA_ENCHANTED.id,
    ]);
    expect(result.candidates[0].confidence).toBe(1);
  });

  test('exact collectorNumber + name resolves a unique card at confidence 1.0', async () => {
    const matcher = createCardMatcher(reader);
    const result = await matcher.match({
      collectorNumber: '115',
      name: 'Mickey Mouse - Brave Little Tailor',
    });
    expect(result.candidates).toEqual([{ card: CARD_MICKEY, confidence: 1 }]);
  });

  test('echoes the source back on the result', async () => {
    const matcher = createCardMatcher(reader);
    const source = { collectorNumber: '042', name: 'Elsa' };
    const result = await matcher.match(source);
    expect(result.source).toEqual(source);
  });

  test('no signals → empty candidates, source still echoed', async () => {
    const matcher = createCardMatcher(reader);
    const result = await matcher.match({});
    expect(result.candidates).toEqual([]);
    expect(result.source).toEqual({});
  });

  test('options (threshold/limit) flow through to the ranking core', async () => {
    const strict = createCardMatcher(reader, { threshold: 0.99 });
    // "Esla Snow Quene" (~0.73 similarity) is below 0.99 → dropped.
    const strictResult = await strict.match({ name: 'Esla Snow Quene' });
    expect(strictResult.candidates).toEqual([]);

    const lenient = createCardMatcher(reader, { threshold: 0 });
    const lenientResult = await lenient.match({ name: 'Esla Snow Quene' });
    expect(lenientResult.candidates.length).toBeGreaterThan(0);
    expect(lenientResult.candidates[0].card.id).toBe(CARD_ELSA.id);
  });
});
