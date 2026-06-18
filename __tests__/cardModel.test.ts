/**
 * Model-level encoding of the settled finish model: enchanted is a distinct
 * Card *row*, not a finish. Exercised against the hand-authored fixtures.
 *
 * @format
 */

import { FINISHES } from '@domain';
import { CARD_ELSA, CARD_ELSA_ENCHANTED } from './fixtures/cards';

describe('Card model — enchanted is a distinct row, not a finish', () => {
  test('the enchanted printing is a separate Card with its own id + number', () => {
    expect(CARD_ELSA_ENCHANTED.id).not.toBe(CARD_ELSA.id);
    expect(CARD_ELSA_ENCHANTED.collectorNumber).not.toBe(
      CARD_ELSA.collectorNumber,
    );
  });

  test('enchanted is carried as a rarity, never as a finish', () => {
    expect(CARD_ELSA_ENCHANTED.rarity).toBe('Enchanted');
    expect(CARD_ELSA.rarity).not.toBe('Enchanted');
    expect(FINISHES).not.toContain('enchanted');
  });

  test('availableFinishes only ever contains members of the closed finish set', () => {
    for (const card of [CARD_ELSA, CARD_ELSA_ENCHANTED]) {
      for (const finish of card.availableFinishes) {
        expect(FINISHES).toContain(finish);
      }
    }
  });
});
