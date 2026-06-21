/**
 * decideRecognition — the pure confident/ambiguous/none routing policy (the D2
 * test-first core). Given a best-first RecognitionResult and optional thresholds,
 * it decides whether the scan is confident enough to assert #1, or must route the
 * user to a top-N / manual pick.
 *
 * Rule: confident iff top.confidence >= confidentMin AND it beats #2 by >=
 * ambiguityMargin; else ambiguous (candidates capped at topN, best-first); empty
 * candidates -> none. Defaults: confidentMin 0.70, ambiguityMargin 0.15, topN 5.
 *
 * IP guardrail: hand-authored fixtures + synthetic minimal cards only.
 *
 * @format
 */

import { decideRecognition } from '@domain';
import type { Card, RecognitionCandidate, RecognitionResult } from '@domain';
import { CARD_BILLY_BONES, CARD_BOUN, CARD_MICKEY } from '../fixtures/cards';

/** A minimal synthetic catalog card for tests that only care about confidence. */
const cardOf = (idSuffix: string): Card => ({
  id: `SYN-${idSuffix}`,
  name: `Card ${idSuffix}`,
  setCode: 'SYN',
  collectorNumber: idSuffix,
  rarity: 'Common',
  availableFinishes: ['normal'],
});

/** A candidate at a given confidence over a synthetic card. */
const candidate = (
  confidence: number,
  idSuffix = `${confidence}`,
): RecognitionCandidate => ({
  card: cardOf(idSuffix),
  confidence,
});

const resultOf = (
  ...candidates: RecognitionCandidate[]
): RecognitionResult => ({
  candidates,
});

describe('decideRecognition', () => {
  test('a clear winner (>= floor, beats #2 by the margin) is confident', () => {
    const top = candidate(0.95, 'top');
    const decision = decideRecognition(resultOf(top, candidate(0.4, 'snd')));

    expect(decision).toEqual({ kind: 'confident', candidate: top });
  });

  test('a single candidate at/above the floor is confident', () => {
    const only = candidate(0.82, 'only');
    expect(decideRecognition(resultOf(only))).toEqual({
      kind: 'confident',
      candidate: only,
    });
  });

  test('a single candidate below the floor is ambiguous (surfaced for a manual pick)', () => {
    const weak = candidate(0.55, 'weak');
    expect(decideRecognition(resultOf(weak))).toEqual({
      kind: 'ambiguous',
      candidates: [weak],
    });
  });

  test('the Boun #104 case: a weak read (~0.26) is ambiguous and surfaces Boun in the top-N', () => {
    // Two cards share collector number 104; a weak live name read lets the wrong
    // same-number card (Billy Bones) win at ~0.26. Nothing should silently assert
    // it: the low top routes to a manual pick, with Boun present to choose.
    const decision = decideRecognition({
      candidates: [
        { card: CARD_BILLY_BONES, confidence: 0.26 },
        { card: CARD_BOUN, confidence: 0.24 },
      ],
      source: { collectorNumber: '104', name: 'boun' },
    });

    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') {
      expect(decision.candidates.map(c => c.card.id)).toContain(CARD_BOUN.id);
      expect(decision.candidates).toHaveLength(2);
    }
  });

  test('a near-tie (both high but margin < ambiguityMargin) is ambiguous', () => {
    const decision = decideRecognition(
      resultOf(candidate(0.95, 'a'), candidate(0.9, 'b')),
    );

    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') {
      expect(decision.candidates.map(c => c.card.id)).toEqual([
        'SYN-a',
        'SYN-b',
      ]);
    }
  });

  test('empty candidates is none', () => {
    expect(decideRecognition({ candidates: [] })).toEqual({ kind: 'none' });
  });

  test('ambiguous candidates are capped at topN (default 10), best-first order preserved', () => {
    // Thirteen near-tied low candidates: top below the floor -> ambiguous, capped 10.
    const many = Array.from({ length: 13 }, (_, i) =>
      candidate(0.6 - i * 0.01, `c${i}`),
    );
    const decision = decideRecognition(resultOf(...many));

    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') {
      expect(decision.candidates).toHaveLength(10);
      expect(decision.candidates.map(c => c.card.id)).toEqual([
        'SYN-c0',
        'SYN-c1',
        'SYN-c2',
        'SYN-c3',
        'SYN-c4',
        'SYN-c5',
        'SYN-c6',
        'SYN-c7',
        'SYN-c8',
        'SYN-c9',
      ]);
    }
  });

  test('a custom topN flows through to the ambiguous cap (not hardcoded 5)', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      candidate(0.6 - i * 0.01, `c${i}`),
    );
    const decision = decideRecognition(resultOf(...many), { topN: 2 });

    expect(decision.kind).toBe('ambiguous');
    if (decision.kind === 'ambiguous') {
      expect(decision.candidates.map(c => c.card.id)).toEqual([
        'SYN-c0',
        'SYN-c1',
      ]);
    }
  });

  describe('threshold boundaries', () => {
    test('top exactly at the floor (no runner-up) is confident', () => {
      const at = candidate(0.7, 'floor');
      expect(decideRecognition(resultOf(at))).toEqual({
        kind: 'confident',
        candidate: at,
      });
    });

    test('top just below the floor is ambiguous even with a wide margin', () => {
      const decision = decideRecognition(
        resultOf(candidate(0.69, 'hi'), candidate(0.1, 'lo')),
      );
      expect(decision.kind).toBe('ambiguous');
    });

    test('margin exactly equal to ambiguityMargin is confident (inclusive)', () => {
      // Power-of-two confidences so the subtraction is exact: 0.75 - 0.5 === 0.25.
      const top = candidate(0.75, 'top');
      const decision = decideRecognition(resultOf(top, candidate(0.5, 'snd')), {
        confidentMin: 0.5,
        ambiguityMargin: 0.25,
      });
      expect(decision).toEqual({ kind: 'confident', candidate: top });
    });

    test('margin just under ambiguityMargin is ambiguous', () => {
      const decision = decideRecognition(
        resultOf(candidate(0.75, 'top'), candidate(0.625, 'snd')),
        { confidentMin: 0.5, ambiguityMargin: 0.25 },
      );
      expect(decision.kind).toBe('ambiguous');
    });

    test('both boundaries at once — top exactly at floor AND beating #2 by exactly the margin — is confident (both inclusive, with a runner-up present)', () => {
      // Power-of-two values so both comparisons are float-exact at the boundary:
      // top 0.5 == floor 0.5; 0.5 - 0.25 == margin 0.25. This pins that the AND
      // of clearsFloor && beatsRunnerUp passes at the joint inclusive corner.
      const top = candidate(0.5, 'top');
      const decision = decideRecognition(
        resultOf(top, candidate(0.25, 'snd')),
        {
          confidentMin: 0.5,
          ambiguityMargin: 0.25,
        },
      );
      expect(decision).toEqual({ kind: 'confident', candidate: top });
    });
  });

  test('custom thresholds override the defaults', () => {
    // Mickey alone at 0.8 is confident by default (>= 0.70); a raised floor of
    // 0.9 flips that same read to ambiguous...
    const only = { card: CARD_MICKEY, confidence: 0.8 };
    expect(decideRecognition(resultOf(only), { confidentMin: 0.9 })).toEqual({
      kind: 'ambiguous',
      candidates: [only],
    });
    // ...and a lowered floor of 0.5 keeps it confident (sanity on both directions).
    expect(decideRecognition(resultOf(only), { confidentMin: 0.5 })).toEqual({
      kind: 'confident',
      candidate: only,
    });
  });
});
