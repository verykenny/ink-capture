/**
 * Closed value sets for a collection entry, with runtime guards.
 *
 * Single source of truth pattern: an `as const` tuple drives both the
 * compile-time union and the runtime membership check the guards/validation
 * need. (Beats `enum` — nominal, non-tree-shakeable — and a bare union — no
 * runtime list to validate against.)
 */

/**
 * The closed set of card finishes. `enchanted`/`special` are deliberately
 * absent: those are distinct Card *rows* (own collector number + rarity), not
 * finishes. See card.ts.
 */
export const FINISHES = ['normal', 'foil'] as const;
export type Finish = (typeof FINISHES)[number];

/** Card condition grades, best to worst. */
export const CONDITIONS = ['NM', 'LP', 'MP', 'HP', 'DMG'] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Runtime guard: is `x` a known finish? */
export const isFinish = (x: unknown): x is Finish =>
  typeof x === 'string' && (FINISHES as readonly string[]).includes(x);

/** Runtime guard: is `x` a known condition grade? */
export const isCondition = (x: unknown): x is Condition =>
  typeof x === 'string' && (CONDITIONS as readonly string[]).includes(x);
