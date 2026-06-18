/**
 * matchEntries — the pure ranking core of the recognition matcher.
 *
 * Consumes a pre-normalized query (`collectorNumber?` + `nameKey?`) and catalog
 * entries whose `key` is the precomputed match key, and returns best-first
 * RecognitionCandidates. No I/O, no @services import: keys are supplied by the
 * caller (here, the known normalized literals for the fixtures), so this tests
 * the ranking/confidence rules in isolation.
 *
 * @format
 */

import { matchEntries, type CatalogMatchEntry } from '@domain';
import {
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
} from '../fixtures/cards';

// Keys are what `cardMatchKey` (commit 4) derives from name + version; here we
// state them as the known normalized literals so the pure core is tested
// without reaching into @services.
const ENTRY_ELSA: CatalogMatchEntry = {
  card: CARD_ELSA,
  key: 'elsa snow queen',
};
const ENTRY_ELSA_ENCHANTED: CatalogMatchEntry = {
  card: CARD_ELSA_ENCHANTED,
  key: 'elsa snow queen', // same key as CARD_ELSA — a built-in near-tie
};
const ENTRY_STITCH: CatalogMatchEntry = {
  card: CARD_STITCH_ROCK_STAR,
  key: 'stitch rock star',
};
const ENTRY_MICKEY: CatalogMatchEntry = {
  card: CARD_MICKEY,
  key: 'mickey mouse brave little tailor',
};

describe('matchEntries — exact collector-number tier', () => {
  test('exact hit: a unique collectorNumber + matching name → confidence 1.0', () => {
    const result = matchEntries(
      { collectorNumber: '042', nameKey: 'elsa snow queen' },
      [ENTRY_ELSA, ENTRY_MICKEY],
    );
    expect(result).toEqual([{ card: CARD_ELSA, confidence: 1 }]);
  });

  test('name absent → confidence 1/matchCount, every same-number card returned', () => {
    const result = matchEntries({ collectorNumber: '042' }, [
      ENTRY_ELSA,
      ENTRY_STITCH, // also '042'
      ENTRY_MICKEY, // '115' — excluded
    ]);
    expect(result).toHaveLength(2);
    expect(result.every(candidate => candidate.confidence === 0.5)).toBe(true);
    expect(result.map(candidate => candidate.card.id)).toEqual(
      expect.arrayContaining([CARD_ELSA.id, CARD_STITCH_ROCK_STAR.id]),
    );
  });

  test('collectorNumber + name disambiguates the colliding set (best-first)', () => {
    const result = matchEntries(
      { collectorNumber: '042', nameKey: 'stitch rock star' },
      [ENTRY_ELSA, ENTRY_STITCH], // both '042'
    );
    expect(result[0].card.id).toBe(CARD_STITCH_ROCK_STAR.id);
    expect(result[0].confidence).toBe(1);
    expect(result[1].card.id).toBe(CARD_ELSA.id);
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });

  test('the exact tier is not thresholded: a low-confidence number hit still returns', () => {
    // The number matches but the name is far off; C2 still surfaces it to confirm.
    const result = matchEntries(
      { collectorNumber: '042', nameKey: 'totally different name' },
      [ENTRY_ELSA],
    );
    expect(result).toHaveLength(1);
    expect(result[0].card.id).toBe(CARD_ELSA.id);
    expect(result[0].confidence).toBeLessThan(0.5);
  });
});

describe('matchEntries — no match', () => {
  test('an empty source (no collectorNumber, no name) → []', () => {
    expect(matchEntries({}, [ENTRY_ELSA, ENTRY_MICKEY])).toEqual([]);
  });

  test('a collectorNumber that matches nothing, with no name → []', () => {
    expect(matchEntries({ collectorNumber: '999' }, [ENTRY_ELSA])).toEqual([]);
  });
});

describe('matchEntries — fuzzy normalized-name fallback', () => {
  test('fuzzy near-miss: OCR typos still rank the right card top, above threshold', () => {
    const result = matchEntries({ nameKey: 'esla snow quene' }, [
      ENTRY_ELSA,
      ENTRY_MICKEY,
    ]);
    expect(result[0].card.id).toBe(CARD_ELSA.id);
    expect(result[0].confidence).toBeGreaterThan(0.5);
    expect(result[0].confidence).toBeLessThan(1);
  });

  test('ambiguous near-tie: two cards share the key → both returned, tied, best-first stable', () => {
    const result = matchEntries({ nameKey: 'elsa snow queen' }, [
      ENTRY_ELSA,
      ENTRY_ELSA_ENCHANTED,
      ENTRY_MICKEY, // dropped — well below threshold
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].confidence).toBe(1);
    expect(result[1].confidence).toBe(1);
    // stable sort preserves input order among equal confidences
    expect(result.map(candidate => candidate.card.id)).toEqual([
      CARD_ELSA.id,
      CARD_ELSA_ENCHANTED.id,
    ]);
  });

  test('drops every candidate below the default threshold → []', () => {
    expect(
      matchEntries({ nameKey: 'zzzzzzzzzz' }, [ENTRY_ELSA, ENTRY_MICKEY]),
    ).toEqual([]);
  });

  test('a custom threshold of 0 lets weak matches through, still best-first', () => {
    const result = matchEntries(
      { nameKey: 'elsa snow queen' },
      [ENTRY_ELSA, ENTRY_MICKEY],
      { threshold: 0 },
    );
    expect(result).toHaveLength(2);
    expect(result[0].card.id).toBe(CARD_ELSA.id);
  });

  test('caps the candidate list at the limit, keeping the best', () => {
    const result = matchEntries(
      { nameKey: 'elsa snow queen' },
      [ENTRY_ELSA, ENTRY_ELSA_ENCHANTED, ENTRY_MICKEY, ENTRY_STITCH],
      { threshold: 0, limit: 2 },
    );
    expect(result).toHaveLength(2);
    expect(result.map(candidate => candidate.card.id)).toEqual([
      CARD_ELSA.id,
      CARD_ELSA_ENCHANTED.id,
    ]);
  });

  test('a non-empty exact tier wins: a collectorNumber hit is never merged with fuzzy matches', () => {
    // '115' uniquely hits MICKEY; ELSA would be a perfect fuzzy name match but
    // must NOT appear, because the exact tier is the winner, not a merge.
    const result = matchEntries(
      { collectorNumber: '115', nameKey: 'elsa snow queen' },
      [ENTRY_ELSA, ENTRY_ELSA_ENCHANTED, ENTRY_MICKEY],
    );
    expect(result.map(candidate => candidate.card.id)).toEqual([
      CARD_MICKEY.id,
    ]);
  });
});
