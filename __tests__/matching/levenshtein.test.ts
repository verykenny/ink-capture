/**
 * Hand-rolled Levenshtein distance + normalized similarity — the fuzzy
 * primitive C1's name fallback ranks on. Pure, deterministic, zero deps.
 *
 * @format
 */

import { levenshtein, similarity } from '@domain';

describe('levenshtein', () => {
  test('identical strings have distance 0 (including both empty)', () => {
    expect(levenshtein('elsa', 'elsa')).toBe(0);
    expect(levenshtein('', '')).toBe(0);
  });

  test('an empty operand costs the length of the other', () => {
    expect(levenshtein('', 'elsa')).toBe(4);
    expect(levenshtein('elsa', '')).toBe(4);
  });

  test('a single insertion or deletion costs 1', () => {
    expect(levenshtein('elsa', 'elsaa')).toBe(1);
    expect(levenshtein('elsaa', 'elsa')).toBe(1);
  });

  test('a single substitution costs 1', () => {
    expect(levenshtein('elsa', 'elza')).toBe(1);
  });

  test('the classic kitten → sitting is 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });

  test('is symmetric', () => {
    expect(levenshtein('flaw', 'lawn')).toBe(levenshtein('lawn', 'flaw'));
  });
});

describe('similarity', () => {
  test('identical strings score 1 (including both empty)', () => {
    expect(similarity('elsa snow queen', 'elsa snow queen')).toBe(1);
    expect(similarity('', '')).toBe(1);
  });

  test('a fully-substituted string of equal length scores 0', () => {
    expect(similarity('ab', 'yz')).toBe(0);
  });

  test('a near-miss (OCR typos) scores high but below 1', () => {
    const score = similarity('elsa snow queen', 'esla snow quene');
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  test('stays within [0,1] and is symmetric', () => {
    expect(similarity('flaw', 'lawn')).toBeCloseTo(similarity('lawn', 'flaw'));
    const score = similarity('mickey', 'minnie');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
