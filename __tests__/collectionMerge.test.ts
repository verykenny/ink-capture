/**
 * Collection-entry identity + merge rule.
 *
 * The rule the whole app turns on: an addition either increments the existing
 * stack with the same (cardId, finish, condition) identity, or creates a new
 * one. `resolveAddition` is PURE — it returns an intent (AddOutcome); B3 maps
 * that to a SQLite write (id/timestamp generation lives there).
 *
 * Imports go THROUGH the @domain barrel on purpose: this is the first runtime
 * value to cross that barrel via babel + Jest.
 *
 * @format
 */

import {
  collectionEntryKey,
  isSameStack,
  resolveAddition,
  type AddOutcome,
} from '@domain';
import {
  CARD_ELSA,
  CARD_ELSA_ENCHANTED,
  newEntry,
  storedEntry,
} from './fixtures/cards';

describe('collectionEntryKey', () => {
  test('projects only the identity fields', () => {
    const key = collectionEntryKey(
      storedEntry({ quantity: 9, notes: 'mint', finish: 'foil' }),
    );
    expect(key).toEqual({
      cardId: CARD_ELSA.id,
      finish: 'foil',
      condition: 'NM',
    });
  });
});

describe('isSameStack', () => {
  test('true only when cardId + finish + condition all match', () => {
    const base = { cardId: 'a', finish: 'normal', condition: 'NM' } as const;
    expect(isSameStack(base, { ...base })).toBe(true);
    expect(isSameStack(base, { ...base, cardId: 'b' })).toBe(false);
    expect(isSameStack(base, { ...base, finish: 'foil' })).toBe(false);
    expect(isSameStack(base, { ...base, condition: 'LP' })).toBe(false);
  });
});

describe('resolveAddition', () => {
  test('empty collection → create, carrying the FULL incoming entry (incl. notes)', () => {
    // Mirror of the increment "notes dropped" test: the create path must pass
    // the incoming entry through intact. notes is included so an exact toEqual
    // would catch a regression that stripped or altered any field on create.
    const incoming = newEntry({ quantity: 2, notes: 'signed by artist' });
    const outcome = resolveAddition([], incoming);
    expect(outcome).toEqual({ kind: 'create', entry: incoming });
  });

  test('matching identity → increment with the summed total + matched id', () => {
    const existing = storedEntry({ id: 'stack-1', quantity: 2 });
    const outcome = resolveAddition([existing], newEntry({ quantity: 1 }));
    expect(outcome).toEqual({
      kind: 'increment',
      targetId: 'stack-1',
      quantity: 3,
    });
  });

  test('bulk add sums correctly (incoming quantity > 1)', () => {
    const existing = storedEntry({ id: 'stack-1', quantity: 2 });
    const outcome = resolveAddition([existing], newEntry({ quantity: 4 }));
    expect(outcome).toEqual({
      kind: 'increment',
      targetId: 'stack-1',
      quantity: 6,
    });
  });

  test('distinct finish (same card + condition) → create', () => {
    const existing = storedEntry({ id: 'stack-1', finish: 'normal' });
    const incoming = newEntry({ finish: 'foil' });
    expect(resolveAddition([existing], incoming)).toEqual({
      kind: 'create',
      entry: incoming,
    });
  });

  test('distinct condition (same card + finish) → create', () => {
    const existing = storedEntry({ id: 'stack-1', condition: 'NM' });
    const incoming = newEntry({ condition: 'LP' });
    expect(resolveAddition([existing], incoming)).toEqual({
      kind: 'create',
      entry: incoming,
    });
  });

  test('enchanted row (different cardId) never merges with the normal row', () => {
    // Same finish + condition, but the enchanted printing is its OWN Card row.
    const existing = storedEntry({
      id: 'stack-normal',
      cardId: CARD_ELSA.id,
      finish: 'foil',
    });
    const outcome = resolveAddition(
      [existing],
      newEntry({ cardId: CARD_ELSA_ENCHANTED.id, finish: 'foil' }),
    );
    expect(outcome.kind).toBe('create');
  });

  test('increment drops incoming notes (outcome carries only id + quantity)', () => {
    const existing = storedEntry({ id: 'stack-1', quantity: 1 });
    const outcome = resolveAddition(
      [existing],
      newEntry({ quantity: 1, notes: 'signed by artist' }),
    );
    // toEqual is exact: any leaked notes/entry field would fail this.
    expect(outcome).toEqual({
      kind: 'increment',
      targetId: 'stack-1',
      quantity: 2,
    });
  });

  test('multiple distinct stacks → only the matching identity is hit', () => {
    const existing = [
      storedEntry({
        id: 'normal-nm',
        finish: 'normal',
        condition: 'NM',
        quantity: 2,
      }),
      storedEntry({
        id: 'foil-nm',
        finish: 'foil',
        condition: 'NM',
        quantity: 1,
      }),
      storedEntry({
        id: 'normal-lp',
        finish: 'normal',
        condition: 'LP',
        quantity: 4,
      }),
    ];
    const outcome = resolveAddition(
      existing,
      newEntry({ finish: 'normal', condition: 'NM', quantity: 1 }),
    );
    expect(outcome).toEqual({
      kind: 'increment',
      targetId: 'normal-nm',
      quantity: 3,
    });
  });

  test('>1 stack for one identity → throws (corruption surfaced, not laundered)', () => {
    const dup = [storedEntry({ id: 'dup-a' }), storedEntry({ id: 'dup-b' })];
    expect(() => resolveAddition(dup, newEntry())).toThrow(
      /UNIQUE|more than one|stacks/i,
    );
  });

  test('is pure: frozen inputs are neither mutated nor rejected', () => {
    const existing = Object.freeze([
      Object.freeze(storedEntry({ id: 'stack-1', quantity: 2 })),
    ]);
    const incoming = Object.freeze(newEntry({ quantity: 3 }));
    const snapshotExisting = JSON.stringify(existing);
    const snapshotIncoming = JSON.stringify(incoming);

    expect(() => resolveAddition(existing, incoming)).not.toThrow();
    const outcome = resolveAddition(existing, incoming);
    expect(outcome).toEqual({
      kind: 'increment',
      targetId: 'stack-1',
      quantity: 5,
    });
    expect(JSON.stringify(existing)).toBe(snapshotExisting);
    expect(JSON.stringify(incoming)).toBe(snapshotIncoming);
  });
});

describe('AddOutcome', () => {
  // Compile-time exhaustiveness: a new variant without a case here fails tsc on
  // the `never` assignment, so this doubles as a guard against silent drift.
  const label = (outcome: AddOutcome): string => {
    switch (outcome.kind) {
      case 'create':
        return 'create';
      case 'increment':
        return 'increment';
      default: {
        const exhaustive: never = outcome;
        throw new Error(`unhandled outcome: ${String(exhaustive)}`);
      }
    }
  };

  test('every kind is handled exhaustively', () => {
    expect(label(resolveAddition([], newEntry()))).toBe('create');
    expect(label(resolveAddition([storedEntry({ id: 'x' })], newEntry()))).toBe(
      'increment',
    );
  });
});
