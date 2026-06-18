/**
 * Hand-rolled Levenshtein distance + normalized similarity — the fuzzy
 * primitive C1's name fallback ranks on.
 *
 * Pure and deterministic with no dependencies: card names are short, so the
 * classic two-row dynamic-programming distance is more than fast enough and a
 * fuzzy-matching dependency would be overkill. `similarity` normalizes the
 * distance into [0,1] so it can be used directly as a confidence score.
 *
 * @format
 */

/**
 * Edit distance between two strings: the minimum number of single-character
 * insertions, deletions, or substitutions to turn `a` into `b`. Two-row DP, so
 * memory is O(min-irrelevant) — one row of length `b.length + 1`.
 */
export const levenshtein = (a: string, b: string): number => {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substituteCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + substituteCost, // substitution
      );
    }
    previous = current;
  }

  return previous[b.length];
};

/**
 * Normalized similarity in [0,1]: `1` when identical (including two empty
 * strings), `0` when every character differs. Defined as
 * `1 - levenshtein(a, b) / max(len(a), len(b))`. Because the identity check
 * returns early, `a !== b` here guarantees at least one operand is non-empty,
 * so the divisor is never zero.
 */
export const similarity = (a: string, b: string): number => {
  if (a === b) {
    return 1;
  }
  const longest = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / longest;
};
