/**
 * Finish/Condition value sets + runtime guards.
 *
 * Encodes the settled finish model at the value level: `finish` is the closed
 * set `normal | foil` ONLY — `enchanted`/`special` are NOT finishes (they are
 * distinct Card rows, asserted at the model level in cardModel.test.ts).
 *
 * @format
 */

import {
  CONDITIONS,
  FINISHES,
  isCondition,
  isFinish,
  type Condition,
  type Finish,
} from '@domain';

describe('FINISHES', () => {
  test('is exactly the closed set [normal, foil]', () => {
    expect(FINISHES).toEqual(['normal', 'foil']);
  });

  test('does not include enchanted or special (those are rarities/rows)', () => {
    expect(FINISHES).not.toContain('enchanted');
    expect(FINISHES).not.toContain('special');
  });
});

describe('isFinish', () => {
  test.each<Finish>(['normal', 'foil'])('accepts %s', value => {
    expect(isFinish(value)).toBe(true);
  });

  // enchanted/special: distinct rows, not finishes. 'Foil': case-sensitive.
  test.each<[unknown]>([
    ['enchanted'],
    ['special'],
    ['Foil'],
    [''],
    [42],
    [null],
    [undefined],
    [{}],
  ])('rejects %p', value => {
    expect(isFinish(value)).toBe(false);
  });
});

describe('CONDITIONS', () => {
  test('is exactly the grades [NM, LP, MP, HP, DMG]', () => {
    expect(CONDITIONS).toEqual(['NM', 'LP', 'MP', 'HP', 'DMG']);
  });
});

describe('isCondition', () => {
  test.each<Condition>(['NM', 'LP', 'MP', 'HP', 'DMG'])('accepts %s', value => {
    expect(isCondition(value)).toBe(true);
  });

  // 'nm': case-sensitive. 'XX': unknown grade.
  test.each<[unknown]>([['nm'], ['XX'], [''], [0], [null], [undefined]])(
    'rejects %p',
    value => {
      expect(isCondition(value)).toBe(false);
    },
  );
});
