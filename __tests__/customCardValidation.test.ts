/**
 * Custom-card (off-catalog) validation.
 *
 * The untrusted manual-add form output: `name` is the only required field, the
 * rest are optional. Mirrors collectionEntryValidation — collect-all issues plus
 * a throwing assert wrapper — so the form layer treats both alike.
 *
 * @format
 */

import {
  assertValidCustomCard,
  validateCustomCard,
  type CustomCardInput,
  type CustomCardIssue,
} from '@domain';

/** Build a custom-card input over a valid default (name present). */
const input = (overrides: Partial<CustomCardInput> = {}): CustomCardInput => ({
  name: 'My Custom Card',
  ...overrides,
});

const codes = (issues: CustomCardIssue[]): string[] =>
  issues.map(issue => issue.code);

describe('validateCustomCard', () => {
  test('valid input (name present) → no issues', () => {
    expect(validateCustomCard(input())).toEqual([]);
  });

  test('the optional fields are never required', () => {
    // name only — no version/set/number/rarity — is a complete, valid input.
    expect(validateCustomCard({ name: 'Homemade Hero' })).toEqual([]);
  });

  test('empty name → name.empty', () => {
    expect(codes(validateCustomCard(input({ name: '' })))).toEqual([
      'name.empty',
    ]);
  });

  test('whitespace-only name → name.empty', () => {
    expect(codes(validateCustomCard(input({ name: '   ' })))).toEqual([
      'name.empty',
    ]);
  });

  test('the issue carries a human-readable message', () => {
    const [issue] = validateCustomCard(input({ name: '' }));
    expect(typeof issue.message).toBe('string');
    expect(issue.message.length).toBeGreaterThan(0);
  });

  test('does not mutate its input (no trimming)', () => {
    const padded = input({ name: '  Hero  ' });
    const snapshot = JSON.stringify(padded);
    validateCustomCard(padded);
    expect(JSON.stringify(padded)).toBe(snapshot);
    // a padded-but-non-empty name is still valid (format is not validated here)
    expect(validateCustomCard(padded)).toEqual([]);
  });
});

describe('assertValidCustomCard', () => {
  test('throws on an empty name, with the issues attached', () => {
    let caught: unknown;
    try {
      assertValidCustomCard(input({ name: '' }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { issues?: CustomCardIssue[] }).issues).toHaveLength(1);
  });

  test('is a no-op on valid input', () => {
    expect(() => assertValidCustomCard(input())).not.toThrow();
  });
});
