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
