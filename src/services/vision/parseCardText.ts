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
 *    merged stat digit ("MADRIGAL22", whitespace-separated, or 2+ digits) are
 *    stripped, while a single digit fused to letters is kept as a likely O/0
 *    misread ("BALO0"), and the collector line + body/flavor text fall out by
 *    position. Without frames it
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

/**
 * A trailing stat number merged onto a line: either whitespace-separated
 * (`MIRABEL MADRIGAL 22`) or a run of 2+ digits (the "22" in OCR'd "MADRIGAL22").
 * A SINGLE digit fused directly to letters is deliberately NOT matched — it is
 * almost always an O/0 (or I/1, S/5, B/8) misread of the name's last glyph
 * ("BALOO" → "BALO0"), and stripping it would drop a real letter.
 */
const TRAILING_NUMBER = /(?:\s+\d+|\d{2,})\s*$/;

/** A name candidate needs at least this many letters — excludes stat glyphs ("O4", "43"). */
const MIN_NAME_LETTERS = 3;

/**
 * A title/subtitle is short; ability/flavor/effect PROSE runs long. Card names
 * (and their versions) top out around five words; body lines run seven-plus. On
 * real captures a wrapped body line can carry a TALLER OCR frame than the title,
 * so the height heuristic alone is fooled — bound the word count first.
 */
const MAX_TITLE_WORDS = 6;

/** A subtitle must be at least this tall relative to the name line… */
const SUBTITLE_MIN_RATIO = 0.5;
/** …and sit no further than this multiple of the name's height below it. */
const SUBTITLE_MAX_GAP_RATIO = 1.5;

/** How many lines to treat as the title when the engine reports no frames. */
const FRAMELESS_TITLE_LINES = 2;

/** Count of ASCII letters in a string — the name-candidate gate. */
const letterCount = (text: string): number =>
  (text.match(/[a-z]/gi) ?? []).length;

/** Whitespace-separated word count — the title-vs-body discriminator. */
const wordCount = (text: string): number =>
  text.split(/\s+/).filter(Boolean).length;

/** A short line that could be a title/subtitle (vs. long body/flavor/effect prose). */
const isTitleLike = (line: OcrTextLine): boolean =>
  wordCount(line.text) <= MAX_TITLE_WORDS;

/**
 * The Lorcana type line — `Storyborn • Ally`, `Action`, `Item`, etc. It sits just
 * below the version, so it both (a) is never a subtitle itself and (b) anchors a
 * ceiling: a real version is always ABOVE it. Anchored at the line start so a
 * mid-line "• action" in prose does not trip it.
 */
const TYPE_LINE =
  /^(storyborn|dreamborn|floodborn|action|item|location|song)\b/i;

/** A leading artist glyph the OCR emits before the illustrator credit (`>`, `»`, `·`, `•`, `→`). */
const ARTIST_GLYPH = /^\s*[>»·•→]/;
/** A co-artist credit joins two names with a slash ("Jane Doe / John Roe"). */
const CO_ARTIST_SLASH = /\w\s*\/\s*\w/;

/** A type-line-shaped line — excluded from subtitle contention and used as the ceiling. */
const isTypeLine = (line: OcrTextLine): boolean => TYPE_LINE.test(line.text);

/** An artist-credit-shaped line: a leading artist glyph or a co-artist slash. */
const isArtistCredit = (line: OcrTextLine): boolean =>
  ARTIST_GLYPH.test(line.text) || CO_ARTIST_SLASH.test(line.text);

/**
 * The card name is printed in ALL-CAPS; the version/subtitle, the type line, and
 * flavor/ability prose are not. A line is "all-caps" when it has real letters and
 * none of them is lowercase. (An ability KEYWORD is caps, but its line carries the
 * lowercase effect text after it, so the line as a whole is not all-caps.) Case is
 * a far more reliable name signal than frame height on real captures.
 */
const isAllCaps = (line: OcrTextLine): boolean =>
  letterCount(line.text) >= MIN_NAME_LETTERS &&
  line.text === line.text.toUpperCase();

/** The tallest line by frame height (best-effort: missing frames count as 0). */
const tallestByHeight = (lines: readonly OcrTextLine[]): OcrTextLine =>
  lines.reduce((tallest, line) =>
    (line.frame?.height ?? 0) > (tallest.frame?.height ?? 0) ? line : tallest,
  );

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
 * ALL-CAPS line — the card name is printed in caps, and case survives the frame-
 * height noise that lets a title-case type line or a split body fragment out-
 * measure the title. (Falls back to the tallest line overall when nothing is all-
 * caps, e.g. a fully lowercased OCR.) The subtitle is the nearest comparably-sized
 * line just beneath the name — found by height, not a band, because on real cards
 * body/flavor text is tall enough to slip past a ratio. Requiring all-framed means
 * a mixed read (some lines without frames) falls back to reading order.
 *
 * The version is the card's true subtitle, but on live captures the height/gap
 * gates also admit the ARTIST CREDIT or an ABILITY fragment, polluting the
 * `name + version` match key. The Lorcana layout pins the version: NAME → version
 * → `Storyborn • …` type line → ability/flavor → artist credit. So three
 * predicates layer on top of height/gap: (1) a ceiling at the first type line
 * below the name — the version always sits strictly above it; (2) type-line-shaped
 * lines are never the subtitle; (3) artist-credit-shaped lines (a leading glyph or
 * a co-artist slash) are never the subtitle. On the clean fixtures these are inert
 * (the gap gate already excludes the same lines); they only bite when a credit or
 * fragment lands inside the gap window.
 */
const selectTitleLines = (candidates: OcrTextLine[]): OcrTextLine[] => {
  const everyFramed = candidates.every(line => (line.frame?.height ?? 0) > 0);
  if (!everyFramed) {
    return candidates.slice(0, FRAMELESS_TITLE_LINES);
  }

  const allCaps = candidates.filter(isAllCaps);
  const name = tallestByHeight(allCaps.length > 0 ? allCaps : candidates);
  const nameY = name.frame?.y ?? 0;
  const nameHeight = name.frame?.height ?? 0;

  // The topmost type line below the name — the version sits strictly above it.
  // Undefined when the card prints no type line (e.g. a frameless or sparse read),
  // in which case the ceiling is vacuous.
  const typeLineY = candidates
    .filter(line => (line.frame?.y ?? 0) > nameY && isTypeLine(line))
    .reduce<number | undefined>((min, line) => {
      const y = line.frame?.y ?? 0;
      return min === undefined || y < min ? y : min;
    }, undefined);

  const subtitle = candidates
    .filter(line => line !== name && !isTypeLine(line) && !isArtistCredit(line))
    .filter(line => {
      const y = line.frame?.y ?? 0;
      const height = line.frame?.height ?? 0;
      return (
        y > nameY &&
        (typeLineY === undefined || y < typeLineY) &&
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

  // Prefer short, title-like lines: body/flavor/effect prose runs long and — on
  // real captures — can carry a taller OCR frame than the name, fooling the
  // height heuristic. Drop the over-long lines from title contention, but fall
  // back to all candidates if none qualify (so a card is never left name-less).
  const titleLike = candidates.filter(isTitleLike);
  const titleCandidates = titleLike.length > 0 ? titleLike : candidates;

  const name = selectTitleLines(titleCandidates)
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
