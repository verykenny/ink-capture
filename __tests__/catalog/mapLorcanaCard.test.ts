/**
 * mapLorcanaCard — the pure LorcanaJSON → Card mapping. This is the "non-trivial
 * data mapping" the DoD names as must-be-test-first. Driven entirely by the tiny
 * hand-authored fixture (never bulk data).
 *
 * @format
 */

import { mapLorcanaCard } from '@services/catalog/mapLorcanaCard';
import type { LorcanaCard } from '@services/catalog/lorcanaTypes';
import { CARD_ELSA, CARD_ELSA_ENCHANTED, CARD_MICKEY } from '../fixtures/cards';
import {
  MAPPED_ACTION,
  MAPPED_SPECIAL,
  RAW_ACTION,
  RAW_ELSA,
  RAW_ELSA_ENCHANTED,
  RAW_MICKEY,
  RAW_SPECIAL,
  RAW_TO_MAPPED,
} from '../fixtures/lorcanaCards';

describe('mapLorcanaCard', () => {
  test('every fixture card maps to its expected Card', () => {
    for (const { raw, mapped } of RAW_TO_MAPPED) {
      expect(mapLorcanaCard(raw)).toEqual(mapped);
    }
  });

  describe('finishes derived from foilTypes', () => {
    test("['None','Silver'] (normal printing exists) → ['normal','foil']", () => {
      expect(mapLorcanaCard(RAW_ELSA).availableFinishes).toEqual([
        'normal',
        'foil',
      ]);
    });

    test("a foil-only Enchanted (['Lava'], no 'None') → ['foil']", () => {
      expect(mapLorcanaCard(RAW_ELSA_ENCHANTED).availableFinishes).toEqual([
        'foil',
      ]);
    });

    test("any non-'None' foil value yields foil (['Satin'] → ['foil'])", () => {
      expect(mapLorcanaCard(RAW_SPECIAL).availableFinishes).toEqual(['foil']);
    });

    test("['None'] (normal only) → ['normal']", () => {
      expect(mapLorcanaCard(RAW_ACTION).availableFinishes).toEqual(['normal']);
    });

    test("order is always ['normal','foil'] regardless of foilTypes order", () => {
      const reversed: LorcanaCard = {
        ...RAW_ELSA,
        foilTypes: ['Silver', 'None'],
      };
      expect(mapLorcanaCard(reversed).availableFinishes).toEqual([
        'normal',
        'foil',
      ]);
    });

    test("absent foilTypes defaults to ['normal']", () => {
      // Real LorcanaJSON always includes foilTypes; this exercises the mapper's
      // defensive default for a row missing the key entirely.
      const noFoil: LorcanaCard = {
        id: 9001,
        name: 'No Foil Field',
        setCode: 'TFC',
        number: 1,
        rarity: 'Common',
      };
      expect(mapLorcanaCard(noFoil).availableFinishes).toEqual(['normal']);
    });

    test("empty foilTypes defaults to ['normal']", () => {
      expect(
        mapLorcanaCard({ ...RAW_ACTION, foilTypes: [] }).availableFinishes,
      ).toEqual(['normal']);
    });
  });

  describe('Enchanted is a distinct row, not a finish of the base card', () => {
    test('it carries Enchanted as a RARITY with its own id + collector number', () => {
      const enchanted = mapLorcanaCard(RAW_ELSA_ENCHANTED);
      const base = mapLorcanaCard(RAW_ELSA);
      expect(enchanted.rarity).toBe('Enchanted');
      expect(enchanted.id).not.toBe(base.id);
      expect(enchanted.collectorNumber).not.toBe(base.collectorNumber);
      expect(enchanted.availableFinishes).not.toContain('normal');
    });
  });

  describe('field coercion + optionals', () => {
    test('a numeric id is stringified', () => {
      expect(mapLorcanaCard(RAW_ACTION).id).toBe('1042');
      expect(mapLorcanaCard(RAW_SPECIAL).id).toBe('2099');
    });

    test('a numeric number becomes a string collectorNumber', () => {
      expect(mapLorcanaCard(RAW_ACTION).collectorNumber).toBe('17');
      expect(mapLorcanaCard(RAW_SPECIAL).collectorNumber).toBe('99');
    });

    test('imageUrl comes from images.full when present', () => {
      expect(mapLorcanaCard(RAW_ACTION).imageUrl).toBe(MAPPED_ACTION.imageUrl);
    });

    test('imageUrl is omitted (not undefined) when images are absent', () => {
      const card = mapLorcanaCard(RAW_ELSA);
      expect('imageUrl' in card).toBe(false);
    });

    test('version is omitted (not undefined) when absent', () => {
      const card = mapLorcanaCard(RAW_ACTION);
      expect('version' in card).toBe(false);
    });

    test('version is carried through when present', () => {
      expect(mapLorcanaCard(RAW_MICKEY).version).toBe(CARD_MICKEY.version);
      expect(mapLorcanaCard(RAW_SPECIAL).version).toBe(MAPPED_SPECIAL.version);
    });

    test('the three cards.ts fixtures are reproduced exactly', () => {
      expect(mapLorcanaCard(RAW_ELSA)).toEqual(CARD_ELSA);
      expect(mapLorcanaCard(RAW_ELSA_ENCHANTED)).toEqual(CARD_ELSA_ENCHANTED);
      expect(mapLorcanaCard(RAW_MICKEY)).toEqual(CARD_MICKEY);
    });
  });
});
