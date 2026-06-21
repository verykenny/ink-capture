/**
 * parseCardText — the pure OCR-text → RecognitionSource parser (D1, test-first).
 *
 * Drives the heuristic that turns an ML Kit `OcrResult` into the `{ name?,
 * collectorNumber? }` signals the C1 matcher consumes:
 *   - collectorNumber: the numerator of a printed `123/204`, normalized with
 *     String(Number(n)) so it matches B2's stored String(raw.number) (leading
 *     zeros dropped: "042" → "42").
 *   - name: the prominent title region (name + subtitle), the tall lines when
 *     frames are present (else the first substantial lines), joined top-to-bottom
 *     and stripped of the collector line and small noise (body/flavor/illustrator).
 *
 * IP guardrail: every OcrResult here is hand-authored — no bulk catalog data,
 * no card images. The geometry is invented to exercise the heuristic.
 *
 * @format
 */

import { parseCardText } from '@services';
import type { OcrFrame, OcrResult, OcrTextBlock, OcrTextLine } from '@services';

/** Frame builder: top-left x/y plus size. */
const f = (x: number, y: number, width: number, height: number): OcrFrame => ({
  x,
  y,
  width,
  height,
});

const line = (text: string, frame?: OcrFrame): OcrTextLine =>
  frame ? { text, frame } : { text };

const block = (lines: OcrTextLine[], frame?: OcrFrame): OcrTextBlock =>
  frame
    ? { text: lines.map(l => l.text).join('\n'), lines, frame }
    : { text: lines.map(l => l.text).join('\n'), lines };

/** Wrap lines as one OcrResult; `text` mirrors the lines (as ML Kit reports it). */
const ocr = (lines: OcrTextLine[]): OcrResult => ({
  text: lines.map(l => l.text).join('\n'),
  blocks: [block(lines)],
});

describe('parseCardText', () => {
  test('clean read: extracts the title region (name + subtitle) and the collector number', () => {
    // A realistic top-to-bottom card OCR with frames. The name is the tallest
    // line; the subtitle sits just under it and is still large; body/flavor/
    // illustrator text and the ink cost are smaller or non-alphabetic noise.
    const result = parseCardText(
      ocr([
        line('8', f(40, 40, 50, 64)), // ink cost — numeric, no letter
        line('Elsa', f(120, 520, 300, 84)), // name — tallest
        line('Snow Queen', f(120, 612, 260, 48)), // subtitle — still large
        line('Whenever Elsa enters, draw a card.', f(120, 760, 420, 30)), // body — small
        line('Let it go.', f(120, 900, 200, 24)), // flavor — small
        line('12/204', f(120, 1180, 110, 22)), // collector line
        line('Grace Tran', f(320, 1180, 150, 20)), // illustrator — small noise
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '12',
      name: 'Elsa Snow Queen',
    });
  });

  test('collector-number normalization drops leading zeros ("042/204" → "42")', () => {
    const result = parseCardText(
      ocr([
        line('Elsa', f(120, 520, 300, 84)),
        line('042 / 204', f(120, 1180, 130, 22)), // spaces around the slash still match
      ]),
    );
    expect(result.collectorNumber).toBe('42');
  });

  test('number-only: a card with no alphabetic title yields just the collector number', () => {
    const result = parseCardText(
      ocr([
        line('8', f(40, 40, 50, 64)),
        line('3', f(600, 1100, 40, 60)),
        line('115/204', f(120, 1180, 110, 22)),
      ]),
    );
    expect(result).toEqual({ collectorNumber: '115' });
  });

  test('name-only: no collector pattern yields just the joined title region', () => {
    const result = parseCardText(
      ocr([
        line('Stitch', f(120, 520, 300, 84)),
        line('Rock Star', f(120, 612, 240, 48)),
        line('Whenever you play this, gain 1 lore.', f(120, 760, 420, 30)),
      ]),
    );
    expect(result).toEqual({ name: 'Stitch Rock Star' });
  });

  test('orders the title region top-to-bottom even when blocks arrive subtitle-first', () => {
    // Two blocks, subtitle block listed BEFORE the name block; the parser must
    // order by vertical position, not array order.
    const subtitle = block([line('Snow Queen', f(120, 612, 260, 48))]);
    const name = block([line('Elsa', f(120, 520, 300, 84))]);
    const collector = block([line('12/204', f(120, 1180, 110, 22))]);
    const result = parseCardText({
      text: 'Snow Queen\nElsa\n12/204',
      blocks: [subtitle, name, collector],
    });
    expect(result.name).toBe('Elsa Snow Queen');
  });

  test('noisy read: a misread slash drops the number but the name still resolves', () => {
    const result = parseCardText(
      ocr([
        line('Mickey Mouse', f(120, 520, 360, 84)),
        line('Brave Little Tailor', f(120, 612, 320, 48)),
        line('042204', f(120, 1180, 110, 22)), // slash lost in OCR — no match
      ]),
    );
    expect(result).toEqual({ name: 'Mickey Mouse Brave Little Tailor' });
  });

  test('frame-less fallback: uses the first substantial lines in reading order', () => {
    // No frames at all (degenerate engine / fixture). Title = first two
    // alphabetic, non-collector lines; the collector number still parses.
    const result = parseCardText(
      ocr([
        line('Mickey Mouse'),
        line('Brave Little Tailor'),
        line('Whenever this is challenged, gain 1 lore.'),
        line('115/204'),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '115',
      name: 'Mickey Mouse Brave Little Tailor',
    });
  });

  test('a single line carrying name + collector number still yields the name', () => {
    // ML Kit occasionally groups the name and the printed number into one block
    // with no per-line entries; blockAsLine surfaces it as one line. The name
    // must survive (collector substring stripped), not be dropped wholesale.
    const result = parseCardText({
      text: 'Elsa Snow Queen 12/204',
      blocks: [
        {
          text: 'Elsa Snow Queen 12/204',
          lines: [],
          frame: f(120, 520, 360, 84),
        },
      ],
    });
    expect(result).toEqual({ collectorNumber: '12', name: 'Elsa Snow Queen' });
  });

  test('mixed framed/frameless lines fall back to reading order (subtitle kept)', () => {
    // Name framed, subtitle frameless, body framed. The all-framed band would
    // drop the frameless subtitle (height 0); the reading-order fallback keeps it.
    const result = parseCardText({
      text: 'Elsa\nSnow Queen\nbody text here\n12/204',
      blocks: [
        {
          text: 'Elsa\nSnow Queen\nbody text here\n12/204',
          lines: [
            line('Elsa', f(120, 520, 300, 84)),
            line('Snow Queen'), // no frame on this line
            line('body text here', f(120, 760, 420, 30)),
            line('12/204', f(120, 1180, 110, 22)),
          ],
        },
      ],
    });
    expect(result).toEqual({ collectorNumber: '12', name: 'Elsa Snow Queen' });
  });

  test('empty OCR → empty source', () => {
    expect(parseCardText({ text: '', blocks: [] })).toEqual({});
  });

  test('whitespace / punctuation-only OCR → empty source', () => {
    const result = parseCardText(
      ocr([line('   ', f(10, 10, 5, 5)), line('··· /// ···', f(10, 30, 5, 5))]),
    );
    expect(result).toEqual({});
  });
});

/**
 * Real ML Kit captures from the D1 spike — the failure modes that the live photos
 * exposed. IP-clean: real geometry + card names + collector numbers (facts), but
 * ability/flavor prose is SYNTHESIZED placeholder, never the copyrighted text.
 *
 * On real cards the name is found by HEIGHT, not a height band: cards print huge
 * lore/strength glyphs ("O4", "43") that are taller than the name, and body text
 * tall enough to slip past a 0.5 band. The parser must take the tallest alphabetic
 * line as the name and the nearest sized line below as the subtitle.
 */
describe('parseCardText — real spike captures', () => {
  test('Thomas #1: tall "O4" lore glyph is excluded; name + subtitle resolve', () => {
    const result = parseCardText(
      ocr([
        line('O4', f(2243, 2264, 429, 216)), // lore glyph — TALLER than the name
        line('THOMAS', f(465, 2228, 546, 150)),
        line('Wide-Eyed Recruit', f(469, 2398, 629, 99)),
        line('Storyborn • Ally', f(1305, 2553, 553, 93)),
        line('Lorem ipsum dolor sit amet consectetur', f(480, 3075, 1929, 110)), // synth flavor
        line('1/204- EN .11', f(432, 3693, 358, 78)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '1',
      name: 'THOMAS Wide-Eyed Recruit',
    });
  });

  test('Gizmoduck #105: "43" strength glyph (tallest) is not mistaken for the name', () => {
    const result = parseCardText(
      ocr([
        line('43', f(2198, 1989, 511, 256)), // strength glyph — tallest line on the card
        line('GIZMODUCK', f(525, 1974, 748, 142)),
        line('Suited Up', f(523, 2130, 308, 90)),
        line('Storyborn • Inventor', f(1256, 2294, 691, 89)),
        line('Lorem ipsum dolor sit amet', f(522, 2569, 1664, 118)), // synth ability
        line('105/204· EN .7', f(467, 3393, 407, 63)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '105',
      name: 'GIZMODUCK Suited Up',
    });
  });

  test('Mirabel #19: a stat digit merged onto the name ("MADRIGAL22") is stripped', () => {
    const result = parseCardText(
      ocr([
        line('MIRABEL MADRIGAL22', f(572, 2135, 2075, 249)),
        line('Prophecy Finder', f(519, 2323, 526, 104)),
        line('Storyborn • Hero Madrigal', f(1117, 2464, 936, 101)),
        line('19/204 - EN .4', f(507, 3561, 368, 61)),
      ]),
    );
    // The name line is so tall the smaller subtitle drops; the matcher still
    // resolves "Mirabel Madrigal" via the exact collector tier.
    expect(result).toEqual({ collectorNumber: '19', name: 'MIRABEL MADRIGAL' });
  });

  test('Restoring the Heart #39: a song (no subtitle); the "Action" type line drops out', () => {
    const result = parseCardText(
      ocr([
        line('1', f(520, 281, 26, 112)), // ink cost
        line('RESTORING THE HEART', f(796, 2014, 1499, 167)),
        line('Action', f(1417, 2290, 229, 75)),
        line('Lorem ipsum dolor sit amet consectetur', f(444, 2558, 2016, 119)), // synth ability
        line('39/204· EN•7', f(377, 3452, 395, 64)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '39',
      name: 'RESTORING THE HEART',
    });
  });

  test('Eilonwy #7: collector misread "T/204" → no number, but the clean name carries it', () => {
    const result = parseCardText(
      ocr([
        line('EILONWY', f(445, 2196, 612, 155)),
        line('Princess of Llyr', f(440, 2369, 542, 107)),
        line('Storyborn • Ally • Princess', f(1125, 2516, 967, 116)),
        line('T/204EN .10', f(422, 3740, 390, 78)), // the "7" misread as "T" — no match
      ]),
    );
    expect(result).toEqual({ name: 'EILONWY Princess of Llyr' });
  });
});

/**
 * Live device captures (2026-06-20) where the "tallest alphabetic line" heuristic
 * picked the card's ability/flavor PROSE instead of its short title: on real
 * captures a wrapped body line can carry a taller OCR frame than the name, so
 * height alone is fooled. The fix: a card title/subtitle is short, while
 * body/flavor/effect prose runs long — drop the over-long lines from title
 * contention before ranking by height.
 *
 * IP-clean: real card NAMES + collector NUMBERS (facts); the long lines are
 * SYNTHESIZED placeholder prose (≥7 words) given the tallest frame to reproduce
 * the failure — never the copyrighted flavor/ability text.
 */
describe('parseCardText — long body prose must not beat the short title', () => {
  test('Baloo #69: a long flavor line with the tallest frame does not win the name', () => {
    const result = parseCardText(
      ocr([
        line('BALOO', f(120, 500, 500, 130)), // title
        line('Laid-Back Bear', f(120, 640, 420, 92)), // subtitle
        // synthesized 7-word flavor line, framed TALLER than the title:
        line(
          'Lorem ipsum dolor sit amet consectetur adipiscing',
          f(120, 900, 1800, 210),
        ),
        line('69/204 EN 10', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '69',
      name: 'BALOO Laid-Back Bear',
    });
  });

  test('David Xanatos #184: a long effect line (tallest) does not win the name', () => {
    const result = parseCardText(
      ocr([
        line('DAVID XANATOS', f(120, 500, 700, 145)),
        line('Steel Clan Leader', f(120, 650, 500, 95)),
        line(
          'Lorem ipsum dolor sit amet consectetur adipiscing elit',
          f(120, 900, 1800, 215),
        ), // 8 words, tallest
        line('184/204 EN 10', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '184',
      name: 'DAVID XANATOS Steel Clan Leader',
    });
  });

  test('Promising Lead #162: an Action card — long effect text drops, type line drops, title resolves', () => {
    const result = parseCardText(
      ocr([
        line('PROMISING LEAD', f(120, 500, 700, 150)),
        line('Action', f(400, 660, 200, 70)), // type line — drops (too short relative to the tall name)
        line(
          'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do',
          f(120, 850, 1800, 220),
        ), // 10 words, tallest
        line('162/204 EN 10', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '162',
      name: 'PROMISING LEAD',
    });
  });

  test('a card whose only alphabetic lines are all long prose still yields a name (no over-filtering)', () => {
    // Degenerate safety: if NOTHING is title-like, fall back to all candidates
    // rather than dropping the name wholesale (collector tier still anchors it).
    const result = parseCardText(
      ocr([
        line(
          'Lorem ipsum dolor sit amet consectetur adipiscing elit',
          f(120, 500, 1800, 200),
        ),
        line('77/204 EN 10', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result.collectorNumber).toBe('77');
    expect(result.name).toBeDefined();
  });
});

/**
 * The card NAME is printed in ALL-CAPS; the version/subtitle, the type line
 * ("Storyborn • Ally"), and flavor/ability prose are not. Case is a far more
 * reliable name signal than frame height — on real captures a title-case type
 * line or a body fragment split into short lines can out-MEASURE the title. So
 * the name is the tallest ALL-CAPS line; the subtitle is the nearest comparable
 * line below it (any case). Names that aren't all-caps (lowercased OCR) fall back
 * to the tallest line overall.
 */
describe('parseCardText — the name is the tallest ALL-CAPS line', () => {
  test('a taller title-case type line does not beat the all-caps title (Baloo device case)', () => {
    const result = parseCardText(
      ocr([
        line('BALOO', f(120, 500, 500, 110)), // all-caps name — modest height
        line('Laid-Back Bear', f(120, 630, 420, 95)), // subtitle, directly below
        line('Storyborn Ally', f(120, 760, 600, 150)), // type line — TALLER, but title-case + further down
        line('69/204 EN 10', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '69',
      name: 'BALOO Laid-Back Bear',
    });
  });

  test('a tall all-caps ability KEYWORD followed by lowercase is not all-caps, so the title wins (Gizmoduck device case)', () => {
    const result = parseCardText(
      ocr([
        line('GIZMODUCK', f(120, 500, 700, 130)), // all-caps name
        line('Suited Up', f(120, 640, 360, 92)), // subtitle
        // ability line: keyword is caps but the line carries lowercase, and it is
        // framed TALLER than the title — must not win the name:
        line(
          'BLATHERING BLATHERSKITE This character can',
          f(120, 850, 1900, 180),
        ),
        line('105/204 EN 7', f(120, 1500, 300, 60)),
      ]),
    );
    expect(result).toEqual({
      collectorNumber: '105',
      name: 'GIZMODUCK Suited Up',
    });
  });

  test('falls back to the tallest line when no line is all-caps (lowercased OCR)', () => {
    const result = parseCardText(
      ocr([
        line('Elsa', f(120, 500, 300, 84)), // title-case (not all-caps)
        line('Snow Queen', f(120, 612, 260, 48)),
        line('12/204', f(120, 1180, 110, 22)),
      ]),
    );
    expect(result).toEqual({ collectorNumber: '12', name: 'Elsa Snow Queen' });
  });
});
