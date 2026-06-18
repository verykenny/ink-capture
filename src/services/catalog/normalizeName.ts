/**
 * Shared card-name normalization.
 *
 * B2 derives a catalog row's `normalized_name` with this function; C1 will run
 * the SAME function over OCR'd text at query time, so the cached column and a
 * normalized scan are directly comparable. Keeping the rule in one place is the
 * whole point — drift between the two sides would silently break fuzzy lookup.
 *
 * Rule: NFD-decompose → strip combining diacritics → lowercase → replace every
 * non-alphanumeric character with a space → collapse whitespace runs → trim.
 * The result is lowercase words separated by single spaces, and the function is
 * idempotent (running it on its own output is a no-op).
 *
 * @format
 */

/** Combining diacritical marks left behind by NFD decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;
/** Anything that isn't an ASCII letter, digit, or space. */
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
/** One or more whitespace characters. */
const WHITESPACE_RUN = /\s+/g;

export const normalizeCardName = (input: string): string =>
  input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();
