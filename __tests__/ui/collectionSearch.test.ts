/**
 * collectionSearch — pure normalized-substring search over the saved collection.
 *
 * Reuses the shared `normalizeCardName` (diacritic-folding, lowercasing) so the
 * query and the resolved card name are compared on the same footing. The name (+
 * version) is matched as a SUBSTRING; collectorNumber and setCode match as exact
 * tokens; an unresolved entry falls back to its raw cardId. This is predictable
 * substring filtering — deliberately NOT the fuzzy OCR matcher.
 *
 * @format
 */

import type { Card } from '@domain';
import {
  filterCollection,
  matchesQuery,
} from '@ui/collection/collectionSearch';
import type { CardLookup } from '@ui/collection/useCardLookup';
import {
  CARD_ELSA,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
  storedEntry,
} from '../fixtures/cards';

/** A card whose name + version carry diacritics, to prove folding. */
const CARD_DIACRITIC: Card = {
  id: 'DIA-001',
  name: 'Crème',
  version: 'Brûlée',
  setCode: 'DIA',
  collectorNumber: '001',
  rarity: 'Common',
  availableFinishes: ['normal'],
};

const CARDS = [CARD_ELSA, CARD_MICKEY, CARD_STITCH_ROCK_STAR, CARD_DIACRITIC];
const CARD_BY_ID = new Map<string, Card>(CARDS.map(c => [c.id, c]));
const lookup: CardLookup = id => CARD_BY_ID.get(id);

const elsa = storedEntry({ id: 'e-elsa', cardId: CARD_ELSA.id }); // TFC #042
const mickey = storedEntry({ id: 'e-mickey', cardId: CARD_MICKEY.id }); // TFC #115
const stitch = storedEntry({
  id: 'e-stitch',
  cardId: CARD_STITCH_ROCK_STAR.id,
}); // ROF #042
const diacritic = storedEntry({ id: 'e-dia', cardId: CARD_DIACRITIC.id });
const unresolved = storedEntry({ id: 'e-unk', cardId: 'manual:7' }); // not in lookup

const ALL = [elsa, mickey, stitch, diacritic, unresolved];

describe('filterCollection — query handling', () => {
  test('empty query returns every entry (filter is a no-op)', () => {
    expect(filterCollection(ALL, '', lookup)).toEqual(ALL);
  });

  test('whitespace-only query normalizes to empty → every entry', () => {
    expect(filterCollection(ALL, '   ', lookup)).toEqual(ALL);
  });

  test('a query that matches nothing returns []', () => {
    expect(filterCollection(ALL, 'zzzzz', lookup)).toEqual([]);
  });
});

describe('filterCollection — name (+ version) substring', () => {
  test('matches a name substring', () => {
    expect(filterCollection(ALL, 'mick', lookup)).toEqual([mickey]);
  });

  test('is case-insensitive', () => {
    expect(filterCollection(ALL, 'ELSA', lookup)).toEqual([elsa]);
  });

  test('matches against the version too', () => {
    expect(filterCollection(ALL, 'rock star', lookup)).toEqual([stitch]);
  });

  test('matches across the name + version join', () => {
    expect(filterCollection(ALL, 'elsa snow', lookup)).toEqual([elsa]);
  });

  test('folds diacritics on the card side (plain query matches accented name)', () => {
    expect(filterCollection(ALL, 'creme brulee', lookup)).toEqual([diacritic]);
  });
});

describe('filterCollection — collectorNumber (exact) + setCode (token)', () => {
  test('an exact collectorNumber matches every card with that number', () => {
    // '042' is shared by Elsa (TFC) and Stitch (ROF); both match.
    expect(filterCollection(ALL, '042', lookup)).toEqual([elsa, stitch]);
  });

  test('collectorNumber is exact, not a substring ("04" ≠ "042")', () => {
    expect(filterCollection(ALL, '04', lookup)).toEqual([]);
  });

  test('a setCode token matches every card in that set (case-insensitive)', () => {
    expect(filterCollection(ALL, 'tfc', lookup)).toEqual([elsa, mickey]);
  });

  test('setCode is a whole token, not a substring ("tf" ≠ "tfc")', () => {
    expect(filterCollection(ALL, 'tf', lookup)).toEqual([]);
  });
});

describe('matchesQuery — unresolved entries fall back to the raw cardId', () => {
  test('an unresolved entry matches a substring of its cardId', () => {
    expect(filterCollection(ALL, 'manual', lookup)).toEqual([unresolved]);
  });

  test('an unresolved entry never matches via resolved-card fields', () => {
    expect(matchesQuery(unresolved, 'elsa', lookup)).toBe(false);
  });

  test('predicate: true for a name hit, false for a miss', () => {
    expect(matchesQuery(elsa, 'snow', lookup)).toBe(true);
    expect(matchesQuery(elsa, 'mickey', lookup)).toBe(false);
  });
});
