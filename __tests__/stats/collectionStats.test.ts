/**
 * computeCollectionStats — pure collection aggregation (E3).
 *
 * The completion denominator is derived IN-MEMORY from the catalog cards handed
 * in (no `CatalogService` method, no migration). "Collected" = a distinct catalog
 * `cardId` owned, so a card's normal + foil printings count once. Off-catalog
 * (`manual:`) and unresolved cardIds never touch a set numerator/denominator but
 * are surfaced in the overall totals + their own distinct counts.
 *
 * Imports go THROUGH the @domain barrel on purpose — the new stats reducer must
 * cross that barrel like the rest of the domain.
 *
 * @format
 */

import { computeCollectionStats } from '@domain';
import type { Card, CollectionEntry } from '@domain';
import {
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
  CARD_BOUN,
  storedEntry,
} from '../fixtures/cards';

/** TFC has two distinct rows (Elsa, Mickey); ROF has one (Stitch). */
const CATALOG: Card[] = [CARD_ELSA, CARD_MICKEY, CARD_STITCH_ROCK_STAR];

/** A stored entry owning a given card, with a stable distinct row id. */
const own = (card: Card, overrides: Partial<CollectionEntry> = {}) =>
  storedEntry({ id: `e-${card.id}`, cardId: card.id, ...overrides });

/** Pull the SetStat for a set code out of a result (undefined if absent). */
const setStat = (
  stats: ReturnType<typeof computeCollectionStats>,
  setCode: string,
) => stats.perSet.find(s => s.setCode === setCode);

describe('computeCollectionStats — per-set completion', () => {
  test('empty collection → every catalog set is present at 0%, zero copies', () => {
    const stats = computeCollectionStats([], CATALOG);

    expect(stats.perSet).toEqual([
      {
        setCode: 'ROF',
        ownedDistinct: 0,
        setSize: 1,
        completionPct: 0,
        ownedCopies: 0,
      },
      {
        setCode: 'TFC',
        ownedDistinct: 0,
        setSize: 2,
        completionPct: 0,
        ownedCopies: 0,
      },
    ]);
  });

  test('a set with nothing owned reports 0% even when other sets are full', () => {
    // Own both TFC rows; ROF stays untouched.
    const stats = computeCollectionStats(
      [own(CARD_ELSA), own(CARD_MICKEY)],
      CATALOG,
    );
    expect(setStat(stats, 'ROF')).toMatchObject({
      ownedDistinct: 0,
      setSize: 1,
      completionPct: 0,
    });
  });

  test('owning every distinct row in a set → 100%', () => {
    const stats = computeCollectionStats(
      [own(CARD_ELSA), own(CARD_MICKEY)],
      CATALOG,
    );
    expect(setStat(stats, 'TFC')).toMatchObject({
      ownedDistinct: 2,
      setSize: 2,
      completionPct: 100,
    });
  });

  test('completionPct is an exact percentage (1 of 2 → 50)', () => {
    const stats = computeCollectionStats([own(CARD_ELSA)], CATALOG);
    expect(setStat(stats, 'TFC')).toMatchObject({
      ownedDistinct: 1,
      setSize: 2,
      completionPct: 50,
    });
  });

  test('normal + foil of ONE card count as a single distinct owned', () => {
    const stats = computeCollectionStats(
      [
        own(CARD_ELSA, { id: 'elsa-normal', finish: 'normal', quantity: 1 }),
        own(CARD_ELSA, { id: 'elsa-foil', finish: 'foil', quantity: 1 }),
      ],
      CATALOG,
    );
    const tfc = setStat(stats, 'TFC');
    expect(tfc?.ownedDistinct).toBe(1); // distinct cardId, not distinct stack
    expect(tfc?.ownedCopies).toBe(2); // both copies still counted
    expect(stats.overall.distinctCatalogOwned).toBe(1);
  });

  test('different conditions of one card still count as a single distinct owned', () => {
    const stats = computeCollectionStats(
      [
        own(CARD_ELSA, { id: 'elsa-nm', condition: 'NM', quantity: 2 }),
        own(CARD_ELSA, { id: 'elsa-lp', condition: 'LP', quantity: 3 }),
      ],
      CATALOG,
    );
    expect(setStat(stats, 'TFC')).toMatchObject({
      ownedDistinct: 1,
      ownedCopies: 5,
    });
  });

  test('an Enchanted printing is a distinct same-set row; owning the base does not mark it owned', () => {
    // CARD_ELSA (TFC-042) and CARD_ELSA_ENCHANTED (TFC-204) are distinct rows in
    // the SAME set — the ratified "completion spans Enchanted/Special" rule at
    // set granularity. setSize counts both; owning only the base = 1 distinct.
    const catalog = [
      CARD_ELSA,
      CARD_ELSA_ENCHANTED,
      CARD_MICKEY,
      CARD_STITCH_ROCK_STAR,
    ];
    expect(
      setStat(computeCollectionStats([own(CARD_ELSA)], catalog), 'TFC'),
    ).toMatchObject({ ownedDistinct: 1, setSize: 3 });
    expect(
      setStat(
        computeCollectionStats(
          [own(CARD_ELSA), own(CARD_ELSA_ENCHANTED)],
          catalog,
        ),
        'TFC',
      ),
    ).toMatchObject({ ownedDistinct: 2, setSize: 3 });
  });

  test('perSet is sorted by setCode regardless of catalog/entry order', () => {
    const stats = computeCollectionStats(
      [],
      [CARD_BOUN, CARD_STITCH_ROCK_STAR, CARD_ELSA], // URR, ROF, TFC
    );
    expect(stats.perSet.map(s => s.setCode)).toEqual(['ROF', 'TFC', 'URR']);
  });
});

describe('computeCollectionStats — overall totals', () => {
  test('completion = distinct catalog owned / catalog size', () => {
    // 4-row catalog (TFC×3, ROF×1); own 2 distinct → 50%.
    const catalog = [
      CARD_ELSA,
      CARD_MICKEY,
      CARD_ELSA_ENCHANTED,
      CARD_STITCH_ROCK_STAR,
    ];
    const stats = computeCollectionStats(
      [own(CARD_ELSA), own(CARD_STITCH_ROCK_STAR)],
      catalog,
    );
    expect(stats.overall.distinctCatalogOwned).toBe(2);
    expect(stats.overall.catalogTotal).toBe(4);
    expect(stats.overall.completionPct).toBe(50);
  });

  test('totalCopies sums ALL quantities, including off-catalog + unknown', () => {
    const stats = computeCollectionStats(
      [
        own(CARD_ELSA, { quantity: 2 }),
        own(CARD_MICKEY, { quantity: 1 }),
        storedEntry({ id: 'm', cardId: 'manual:7', quantity: 4 }),
        storedEntry({ id: 'u', cardId: 'ZZZ-999', quantity: 5 }),
      ],
      CATALOG,
    );
    expect(stats.overall.totalCopies).toBe(12);
  });

  test('empty collection → all overall totals are zero', () => {
    const stats = computeCollectionStats([], CATALOG);
    expect(stats.overall).toEqual({
      distinctCatalogOwned: 0,
      catalogTotal: 3,
      completionPct: 0,
      totalCopies: 0,
      offCatalogDistinct: 0,
      unknownDistinct: 0,
    });
  });
});

describe('computeCollectionStats — off-catalog (manual:) cards', () => {
  test('a manual card is excluded from set completion but counted overall', () => {
    const stats = computeCollectionStats(
      [storedEntry({ id: 'm', cardId: 'manual:7', quantity: 3 })],
      CATALOG,
    );
    // No set numerator moved.
    expect(setStat(stats, 'TFC')?.ownedDistinct).toBe(0);
    expect(setStat(stats, 'ROF')?.ownedDistinct).toBe(0);
    // Surfaced separately + in copies.
    expect(stats.overall.offCatalogDistinct).toBe(1);
    expect(stats.overall.unknownDistinct).toBe(0);
    expect(stats.overall.totalCopies).toBe(3);
    expect(stats.overall.distinctCatalogOwned).toBe(0);
  });

  test('two finishes of one manual card count as a single off-catalog distinct', () => {
    const stats = computeCollectionStats(
      [
        storedEntry({ id: 'm1', cardId: 'manual:7', finish: 'normal' }),
        storedEntry({ id: 'm2', cardId: 'manual:7', finish: 'foil' }),
      ],
      CATALOG,
    );
    expect(stats.overall.offCatalogDistinct).toBe(1);
  });
});

describe('computeCollectionStats — unknown (unresolved) cards', () => {
  test('a cardId absent from the catalog and not manual: is "unknown"', () => {
    const stats = computeCollectionStats(
      [storedEntry({ id: 'u', cardId: 'ZZZ-999', quantity: 2 })],
      CATALOG,
    );
    expect(stats.overall.unknownDistinct).toBe(1);
    expect(stats.overall.offCatalogDistinct).toBe(0);
    expect(stats.overall.totalCopies).toBe(2);
    expect(stats.overall.distinctCatalogOwned).toBe(0);
    // Not folded into any set.
    expect(setStat(stats, 'TFC')?.ownedDistinct).toBe(0);
  });

  test('unknown distinct counts cardIds, not stacks', () => {
    const stats = computeCollectionStats(
      [
        storedEntry({ id: 'u1', cardId: 'ZZZ-999', finish: 'normal' }),
        storedEntry({ id: 'u2', cardId: 'ZZZ-999', finish: 'foil' }),
        storedEntry({ id: 'u3', cardId: 'YYY-111', finish: 'normal' }),
      ],
      CATALOG,
    );
    expect(stats.overall.unknownDistinct).toBe(2);
  });
});

describe('computeCollectionStats — degenerate catalog', () => {
  test('empty catalog → overall 0% with no divide-by-zero, perSet empty', () => {
    const stats = computeCollectionStats(
      [
        storedEntry({ id: 'a', cardId: 'TFC-042', quantity: 2 }), // unknown now
        storedEntry({ id: 'm', cardId: 'manual:1', quantity: 1 }),
      ],
      [],
    );
    expect(stats.perSet).toEqual([]);
    expect(stats.overall.catalogTotal).toBe(0);
    expect(stats.overall.completionPct).toBe(0); // guarded, not NaN
    expect(Number.isNaN(stats.overall.completionPct)).toBe(false);
    expect(stats.overall.distinctCatalogOwned).toBe(0);
    expect(stats.overall.unknownDistinct).toBe(1);
    expect(stats.overall.offCatalogDistinct).toBe(1);
    expect(stats.overall.totalCopies).toBe(3);
  });
});

describe('computeCollectionStats — purity', () => {
  test('does not mutate its inputs', () => {
    const entries = [own(CARD_ELSA, { quantity: 2 })];
    const catalog = [...CATALOG];
    const entriesSnapshot = JSON.stringify(entries);
    const catalogSnapshot = JSON.stringify(catalog);

    computeCollectionStats(entries, catalog);

    expect(JSON.stringify(entries)).toBe(entriesSnapshot);
    expect(JSON.stringify(catalog)).toBe(catalogSnapshot);
  });
});
