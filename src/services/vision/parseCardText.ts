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

/**
 * When the card prints no type line to anchor against, the version is accepted
 * only if it sits within this many name-cap-heights of the name (else the read is
 * version-less, e.g. a sparse capture). With a type line present this bound is
 * unused — the type line is the anchor.
 */
const NO_TYPE_VERSION_GAP = 4;

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
 *
 * The classifications (storyborn/dreamborn/floodborn) only ever print on the type
 * line — never as a version — so they are safe to match bare. The card-type words
 * (action/item/location/song) are matched as a `\b`-bounded prefix: compounds are
 * safe (`Songbird`, `Itemized`, `Locationless` do NOT match), but a version that
 * literally begins with a bare type word + boundary ("Song of …", vanishingly rare)
 * would be sacrificed — dropped from contention and read as bare NAME. That is a
 * graceful miss, not a wrong save: the scanned collector number still corroborates
 * #1, so `decideRecognition`'s relaxed floor auto-confirms the CORRECT card.
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

/**
 * Real captures often come out rotated ~90° (the phone is portrait but the card's
 * text runs sideways in the sensor buffer), so a line's frame is `w≈capHeight,
 * h≈textLength`. ML Kit reports frames in image space, so we cannot assume the
 * card's top-to-bottom axis is Y. Detect the rotation from the lines themselves: a
 * line of text is always longer than tall, so if most framed lines are taller than
 * wide the capture is rotated and the card's stacking axis is X, not Y.
 */
const isRotatedCapture = (lines: readonly OcrTextLine[]): boolean => {
  let rotated = 0;
  let upright = 0;
  for (const line of lines) {
    const w = line.frame?.width ?? 0;
    const h = line.frame?.height ?? 0;
    if (w === 0 || h === 0) {
      continue;
    }
    if (h > w) {
      rotated += 1;
    } else {
      upright += 1;
    }
  }
  return rotated > upright;
};

/** Font-size proxy (cap height), rotation-invariant: the across-the-text dimension. */
const capHeightOf = (line: OcrTextLine, rotated: boolean): number =>
  rotated ? line.frame?.width ?? 0 : line.frame?.height ?? 0;

/** A line's position along the card's name→collector stacking axis (X if rotated). */
const stackPosOf = (line: OcrTextLine, rotated: boolean): number => {
  const frame = line.frame;
  if (!frame) {
    return 0;
  }
  return rotated ? frame.x + frame.width / 2 : frame.y + frame.height / 2;
};

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
 * Pick the title lines — rotation-aware, anchored to the type line.
 *
 * The name is the ALL-CAPS line with the largest cap height (case survives frame
 * noise far better than size; falls back to the largest line when nothing is all-
 * caps, e.g. a fully lowercased OCR). Requiring all-framed means a mixed read
 * (some lines without frames) falls back to reading order.
 *
 * The Lorcana layout pins the **version**: NAME → version → `Storyborn • …` /
 * `Action` / … **type line** → cost/ability/flavor → artist credit → collector. So
 * the version is the line nearest the name (along the stacking axis) that is NOT
 * type-line- or artist-credit-shaped — *provided it sits closer to the name than
 * the type line does*. That single comparison is the whole trick:
 *  - **character** cards put the version between the name and the type line, so it
 *    wins the nearest slot whatever its printed size;
 *  - **Action / Item / Location / Song** cards put the type line directly under the
 *    name, so any ability/flavor fragment is *farther* than the type line → no
 *    version → the bare NAME.
 * Positions use a rotation-invariant stacking axis (X on a sideways capture), which
 * is why a 90°-rotated still — the live failure where the version read smaller than
 * the name and lost to ability/flavor text — now resolves correctly. With no type
 * line (a sparse read) the version must instead fall within `NO_TYPE_VERSION_GAP`
 * name-cap-heights of the name.
 */
const selectTitleLines = (candidates: OcrTextLine[]): OcrTextLine[] => {
  const everyFramed = candidates.every(line => (line.frame?.height ?? 0) > 0);
  if (!everyFramed) {
    return candidates.slice(0, FRAMELESS_TITLE_LINES);
  }

  const rotated = isRotatedCapture(candidates);
  const capHeight = (line: OcrTextLine): number => capHeightOf(line, rotated);
  const stackPos = (line: OcrTextLine): number => stackPosOf(line, rotated);

  const allCaps = candidates.filter(isAllCaps);
  const pool = allCaps.length > 0 ? allCaps : candidates;
  const name = pool.reduce((tallest, line) =>
    capHeight(line) > capHeight(tallest) ? line : tallest,
  );
  const namePos = stackPos(name);
  const others = candidates.filter(line => line !== name);

  // How far the nearest type line sits from the name — the anchor the version must
  // beat. Undefined when the card prints no type line, in which case fall back to a
  // fixed adjacency bound so a sparse read doesn't grab a distant fragment.
  const typeGaps = others
    .filter(isTypeLine)
    .map(line => Math.abs(stackPos(line) - namePos));
  const versionLimit =
    typeGaps.length > 0
      ? Math.min(...typeGaps)
      : capHeight(name) * NO_TYPE_VERSION_GAP;

  const version = others
    .filter(line => !isTypeLine(line) && !isArtistCredit(line))
    .map(line => ({ line, gap: Math.abs(stackPos(line) - namePos) }))
    .filter(({ gap }) => gap < versionLimit)
    .sort((a, b) => a.gap - b.gap)[0]?.line;

  return version ? [name, version] : [name];
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
