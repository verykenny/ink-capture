/**
 * decideRecognition — the pure routing policy that gates a recognition result.
 *
 * The matcher (`matchEntries`) returns the right ranked candidates but cannot, on
 * its own, decide whether a read is trustworthy: Lorcana numbers repeat across
 * sets and the frozen `RecognitionSource` carries no setCode, so the exact tier
 * can return two same-number cards ranked only by name similarity. A weak live
 * name read then lets the wrong same-number card win at a low confidence — and
 * nothing downstream gates on that. This policy is that gate.
 *
 * Given a best-first `RecognitionResult`, it returns one of three routes:
 *  - **confident** — assert the top candidate. Only when it clears a confidence
 *    floor AND beats the runner-up by an ambiguity margin (so a near-tie is never
 *    confidently asserted).
 *  - **ambiguous** — present a top-N pick (best-first, capped at `topN`). The
 *    safety net for low/ambiguous reads, e.g. the Boun #104 case.
 *  - **none** — no candidates at all.
 *
 * The thresholds are routing heuristics, not calibrated probabilities (the
 * underlying confidence is a relative name-similarity), so they are tunable
 * constants refined against the dev diagnostics — start 0.70 / 0.15 / 5.
 *
 * Pure: no I/O, no `@services`, no mutation. It reads `candidates` as the
 * documented best-first order and does not re-rank — ranking is the matcher's job.
 *
 * @format
 */

import type {
  RecognitionCandidate,
  RecognitionResult,
} from './recognitionResult';

/** Tunable routing thresholds; each falls back to its default when omitted. */
export interface RecognitionThresholds {
  /** Top confidence must reach this to be assertable (default 0.70). */
  confidentMin?: number;
  /** Top must beat the runner-up by at least this to be unambiguous (default 0.15). */
  ambiguityMargin?: number;
  /** Cap the ambiguous top-N pick list at this many (default 5). */
  topN?: number;
}

/** The route a recognition result should take. */
export type RecognitionDecision =
  | { kind: 'confident'; candidate: RecognitionCandidate }
  | { kind: 'ambiguous'; candidates: RecognitionCandidate[] } // best-first, capped at topN
  | { kind: 'none' };

const DEFAULT_CONFIDENT_MIN = 0.7;
const DEFAULT_AMBIGUITY_MARGIN = 0.15;
const DEFAULT_TOP_N = 5;

export const decideRecognition = (
  result: RecognitionResult,
  thresholds: RecognitionThresholds = {},
): RecognitionDecision => {
  const confidentMin = thresholds.confidentMin ?? DEFAULT_CONFIDENT_MIN;
  const ambiguityMargin =
    thresholds.ambiguityMargin ?? DEFAULT_AMBIGUITY_MARGIN;
  const topN = thresholds.topN ?? DEFAULT_TOP_N;

  const { candidates } = result;
  const top = candidates[0];
  if (top === undefined) {
    return { kind: 'none' };
  }

  const runnerUp = candidates[1];
  const clearsFloor = top.confidence >= confidentMin;
  // A lone candidate has no runner-up to be ambiguous against, so the margin is
  // vacuously satisfied; otherwise the lead over #2 must reach the margin.
  const beatsRunnerUp =
    runnerUp === undefined ||
    top.confidence - runnerUp.confidence >= ambiguityMargin;

  if (clearsFloor && beatsRunnerUp) {
    return { kind: 'confident', candidate: top };
  }
  return { kind: 'ambiguous', candidates: candidates.slice(0, topN) };
};
