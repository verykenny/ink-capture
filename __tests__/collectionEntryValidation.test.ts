/**
 * Collection-entry validation.
 *
 * Validates an untrusted (loose) shape — JSON / SQLite / form strings — that
 * the compile-time NewCollectionEntry can't guard. Returns ALL issues at once
 * (the form/scan-correction UI in C2 wants every problem), with a throwing
 * assert wrapper for B3's happy path.
 *
 * @format
 */

import {
  assertValidNewCollectionEntry,
  validateNewCollectionEntry,
  type CollectionEntryIssue,
  type LooseNewCollectionEntry,
  type NewCollectionEntry,
} from '@domain';

/** Build a loose (untrusted) entry over valid defaults. */
const loose = (
  overrides: Partial<LooseNewCollectionEntry> = {},
): LooseNewCollectionEntry => ({
  cardId: 'TFC-042',
  quantity: 1,
  finish: 'normal',
  condition: 'NM',
  ...overrides,
});

const codes = (issues: CollectionEntryIssue[]): string[] =>
  issues.map(issue => issue.code);

describe('validateNewCollectionEntry', () => {
  test('valid input → no issues', () => {
    expect(validateNewCollectionEntry(loose())).toEqual([]);
  });

  test('notes is free-form and never validated', () => {
    expect(
      validateNewCollectionEntry(loose({ notes: '  anything goes  ' })),
    ).toEqual([]);
    // notes omitted entirely is also fine
    expect(validateNewCollectionEntry(loose({ notes: undefined }))).toEqual([]);
  });

  describe('each issue fires in isolation', () => {
    test('empty cardId', () => {
      expect(codes(validateNewCollectionEntry(loose({ cardId: '' })))).toEqual([
        'cardId.empty',
      ]);
    });

    test('whitespace-only cardId', () => {
      expect(
        codes(validateNewCollectionEntry(loose({ cardId: '   ' }))),
      ).toEqual(['cardId.empty']);
    });

    test.each<[number]>([[0], [-1], [1.5], [NaN], [Infinity]])(
      'quantity %p is not a positive integer',
      quantity => {
        expect(codes(validateNewCollectionEntry(loose({ quantity })))).toEqual([
          'quantity.notPositiveInteger',
        ]);
      },
    );

    test('unknown finish', () => {
      expect(
        codes(validateNewCollectionEntry(loose({ finish: 'enchanted' }))),
      ).toEqual(['finish.unknown']);
    });

    test('unknown condition', () => {
      expect(
        codes(validateNewCollectionEntry(loose({ condition: 'XX' }))),
      ).toEqual(['condition.unknown']);
    });
  });

  test('multiple issues accumulate in stable order', () => {
    const issues = validateNewCollectionEntry(
      loose({ cardId: '', quantity: 0, finish: 'enchanted' }),
    );
    expect(codes(issues)).toEqual([
      'cardId.empty',
      'quantity.notPositiveInteger',
      'finish.unknown',
    ]);
  });

  test('every issue carries a human-readable message', () => {
    const issues = validateNewCollectionEntry(
      loose({ cardId: '', quantity: 0, finish: 'x', condition: 'y' }),
    );
    expect(issues).toHaveLength(4);
    for (const issue of issues) {
      expect(typeof issue.message).toBe('string');
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });

  test('does not mutate its input (no trimming)', () => {
    const input = loose({ cardId: '  TFC-042  ' });
    const snapshot = JSON.stringify(input);
    validateNewCollectionEntry(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    // a padded-but-non-empty cardId is still valid (format is a B2/C2 concern)
    expect(validateNewCollectionEntry(input)).toEqual([]);
  });
});

describe('assertValidNewCollectionEntry', () => {
  test('throws on invalid input, with the issues attached', () => {
    const input = loose({ cardId: '', quantity: 0 });
    let caught: unknown;
    try {
      assertValidNewCollectionEntry(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as { issues?: CollectionEntryIssue[] }).issues).toHaveLength(
      2,
    );
  });

  test('is a no-op on valid input and narrows loose → strict', () => {
    const input = loose();
    expect(() => assertValidNewCollectionEntry(input)).not.toThrow();
    assertValidNewCollectionEntry(input);
    // Compiles only because the assertion narrowed input to NewCollectionEntry:
    const narrowed: NewCollectionEntry = input;
    expect(narrowed.finish).toBe('normal');
    expect(narrowed.condition).toBe('NM');
  });
});
