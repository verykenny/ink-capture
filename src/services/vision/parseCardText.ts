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
 *  - **name:** the prominent title region — name + subtitle. With frames, the
 *    name is the tallest *alphabetic* line and the subtitle is the nearest
 *    comparably-sized line just beneath it, joined so the matcher's normalized
 *    `"name version"` key lines up. Found by height, not a band: real cards print
 *    big lore/strength glyphs (OCR'd "O4", "43") that are taller than the name,
 *    and body text tall enough to slip past a simple ratio — so stat glyphs and a
 *    stat digit merged onto the name ("MADRIGAL22") are stripped, and the
 *    collector line + body/flavor text fall out by position. Without frames it
 *    falls back to the first substantial lines in reading order. Best-effort —
 *    the matcher and the user's confirmation absorb the rest.
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

/** A trailing stat number merged onto a line (the "22" in OCR'd "MADRIGAL22"). */
const TRAILING_NUMBER = /\s*\d+\s*$/;

/** A name candidate needs at least this many letters — excludes stat glyphs ("O4", "43"). */
const MIN_NAME_LETTERS = 3;

/** A subtitle must be at least this tall relative to the name line… */
const SUBTITLE_MIN_RATIO = 0.5;
/** …and sit no further than this multiple of the name's height below it. */
const SUBTITLE_MAX_GAP_RATIO = 1.5;

/** How many lines to treat as the title when the engine reports no frames. */
const FRAMELESS_TITLE_LINES = 2;

/** Count of ASCII letters in a string — the name-candidate gate. */
const letterCount = (text: string): number =>
  (text.match(/[a-z]/gi) ?? []).length;

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

/** A line's name signal: collector number + a trailing stat digit stripped, trimmed. */
const toNameCandidate = (line: OcrTextLine): OcrTextLine => {
  const text = line.text
    .replace(COLLECTOR_NUMBER, ' ') // the printed "123/204"
    .replace(TRAILING_NUMBER, '') // a stat digit merged onto the name ("…22")
    .replace(/\s+/g, ' ')
    .trim();
  return line.frame ? { text, frame: line.frame } : { text };
};

/**
 * Pick the title lines. When every candidate is framed, the name is the tallest
 * line (taller than the body, once stat glyphs are filtered out) and the subtitle
 * is the nearest comparably-sized line just beneath it — found by height, not a
 * band, because on real cards body/flavor text is tall enough to slip past a
 * ratio. Requiring all-framed means a mixed read (some lines without frames)
 * falls back to reading order rather than dropping the frameless lines.
 */
const selectTitleLines = (candidates: OcrTextLine[]): OcrTextLine[] => {
  const everyFramed = candidates.every(line => (line.frame?.height ?? 0) > 0);
  if (!everyFramed) {
    return candidates.slice(0, FRAMELESS_TITLE_LINES);
  }

  const name = candidates.reduce((tallest, line) =>
    (line.frame?.height ?? 0) > (tallest.frame?.height ?? 0) ? line : tallest,
  );
  const nameY = name.frame?.y ?? 0;
  const nameHeight = name.frame?.height ?? 0;

  const subtitle = candidates
    .filter(line => line !== name)
    .filter(line => {
      const y = line.frame?.y ?? 0;
      const height = line.frame?.height ?? 0;
      return (
        y > nameY &&
        y - nameY <= nameHeight * SUBTITLE_MAX_GAP_RATIO &&
        height >= nameHeight * SUBTITLE_MIN_RATIO
      );
    })
    .sort((a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0))[0];

  return (subtitle ? [name, subtitle] : [name]).sort(
    (a, b) => (a.frame?.y ?? 0) - (b.frame?.y ?? 0),
  );
};

/** The joined title region, or undefined when no line carries a name signal. */
const parseName = (lines: OcrTextLine[]): string | undefined => {
  // Strip the collector number + trailing stat digits from each line, then keep
  // only lines with real alphabetic content — this drops stat glyphs ("O4", "43")
  // and the language/number footer, and lets a name+number line still yield its name.
  const candidates = lines
    .map(toNameCandidate)
    .filter(line => letterCount(line.text) >= MIN_NAME_LETTERS);
  if (candidates.length === 0) {
    return undefined;
  }

  const name = selectTitleLines(candidates)
    .map(line => line.text)
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
