/**
 * parseCardText — pure OCR text → RecognitionSource.
 *
 * The one piece of real, testable D1 logic: turn an `OcrResult` into the
 * `{ name?, collectorNumber? }` signals the C1 matcher ranks against the cached
 * catalog. It reads, it does not match — the matcher normalizes the name and
 * resolves candidates; this parser only surfaces the raw signals.
 *
 *  - **collectorNumber:** the numerator of a printed `123/204`, normalized with
 *    `String(Number(n))` so it lines up with B2's stored `String(raw.number)`
 *    (leading zeros dropped: `"042"` → `"42"`). Undefined when absent.
 *  - **name:** the prominent title region — name + subtitle. With frames, that's
 *    the band of lines down to `TITLE_HEIGHT_RATIO` of the tallest line (the name
 *    is biggest, the subtitle still large; body/flavor/illustrator text is far
 *    smaller and drops out), ordered top-to-bottom and joined so the matcher's
 *    normalized `"name version"` key lines up. Without frames it falls back to
 *    the first substantial lines in reading order. The collector line and
 *    non-alphabetic noise are always excluded. Best-effort — the matcher and the
 *    user's confirmation absorb the imperfection.
 *
 * Pure: no I/O, no native, no mutation of its input. `OcrResult` in, `@domain`
 * `RecognitionSource` out.
 *
 * @format
 */

import type { RecognitionSource } from '@domain';
import type { OcrResult, OcrTextBlock, OcrTextLine } from './OcrEngine';

/** Printed collector number `123/204` — captures the numerator group. */
const COLLECTOR_NUMBER = /(\d{1,3})\s*\/\s*\d{1,3}/;

/** A line carries a name signal only if it has at least one ASCII letter. */
const HAS_LETTER = /[a-z]/i;

/**
 * Keep title lines down to this fraction of the tallest line's height, so the
 * name and the (smaller) subtitle both survive while body/flavor/illustrator
 * text — all far smaller on a card — is dropped.
 */
const TITLE_HEIGHT_RATIO = 0.5;

/** How many lines to treat as the title when the engine reports no frames. */
const FRAMELESS_TITLE_LINES = 2;

/** Flatten blocks to lines, falling back to a block's own text when it has none. */
const flattenLines = (ocr: OcrResult): OcrTextLine[] =>
  ocr.blocks.flatMap(block =>
    block.lines.length > 0 ? block.lines : blockAsLine(block),
  );

const blockAsLine = (block: OcrTextBlock): OcrTextLine[] => {
  if (!block.text) {
    return [];
  }
  return [
    block.frame
      ? { text: block.text, frame: block.frame }
      : { text: block.text },
  ];
};

/** The numerator of a printed `123/204`, normalized to the catalog's form. */
const parseCollectorNumber = (
  ocr: OcrResult,
  lines: OcrTextLine[],
): string | undefined => {
  const corpus =
    lines.length > 0 ? lines.map(line => line.text).join('\n') : ocr.text;
  const match = COLLECTOR_NUMBER.exec(corpus);
  return match ? String(Number(match[1])) : undefined;
};

/** A line's name signal: its text with the collector number stripped + trimmed. */
const toNameCandidate = (line: OcrTextLine): OcrTextLine => {
  const text = line.text
    .replace(COLLECTOR_NUMBER, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return line.frame ? { text, frame: line.frame } : { text };
};

/**
 * Pick the title lines: the tall band when EVERY candidate is framed, else the
 * first few in reading order. Requiring all-framed (not just one) means a mixed
 * read — where some lines carry frames and some don't — falls back to reading
 * order instead of silently dropping the frameless lines as height 0.
 */
const selectTitleLines = (candidates: OcrTextLine[]): OcrTextLine[] => {
  const everyFramed = candidates.every(line => (line.frame?.height ?? 0) > 0);

  if (everyFramed) {
    const maxHeight = Math.max(
      ...candidates.map(line => line.frame?.height ?? 0),
    );
    const threshold = maxHeight * TITLE_HEIGHT_RATIO;
    return candidates
      .filter(line => (line.frame?.height ?? 0) >= threshold)
      .sort((a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0));
  }

  return candidates.slice(0, FRAMELESS_TITLE_LINES);
};

/** The joined title region, or undefined when no line carries a name signal. */
const parseName = (lines: OcrTextLine[]): string | undefined => {
  // Strip the collector number from each line first, so a line that mixes the
  // name and the printed "123/204" still yields its name rather than being
  // discarded wholesale as the collector line.
  const candidates = lines
    .map(toNameCandidate)
    .filter(line => HAS_LETTER.test(line.text));
  if (candidates.length === 0) {
    return undefined;
  }

  const name = selectTitleLines(candidates)
    .map(line => line.text)
    .filter(text => text.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length > 0 ? name : undefined;
};

export const parseCardText = (ocr: OcrResult): RecognitionSource => {
  const lines = flattenLines(ocr);
  const collectorNumber = parseCollectorNumber(ocr, lines);
  const name = parseName(lines);

  return {
    ...(collectorNumber !== undefined ? { collectorNumber } : {}),
    ...(name !== undefined ? { name } : {}),
  };
};
