/**
 * D3 recognition-confidence gate (the "measure" spec).
 *
 * Runs each of the four D2 diagnostic cards' CLEAN OCR through the full production
 * chain — `createOcrCardRecognizer` (fake engine → real `parseCardText`) → the real
 * `createCardMatcher` over a fixture catalog → `decideRecognition` — and asserts the
 * correct card lands at #1, clears the 0.70 auto-confirm floor, and routes
 * `confident` (i.e. auto-confirms, not a manual pick). This is the acceptance gate
 * that decides whether the collector-number corroboration (`corroboratedMin`,
 * committable unit 4) is needed: a clean capture parses to `NAME Version` + the
 * exact collector number, hits the exact tier at confidence 1.0, and is confident
 * with the default thresholds alone — corroboration is the safety margin for the
 * near-clean captures that land in [0.55, 0.70).
 *
 * The catalog includes the real Boun/Billy-Bones same-number (#104) pair, so the
 * unchanged margin gate is exercised: the correct card must beat its same-number
 * decoy, not merely clear the floor.
 *
 * IP guardrail: hand-authored cards + invented OCR geometry. No bulk data, no images.
 *
 * @format
 */

import {
  createCardMatcher,
  createOcrCardRecognizer,
  type CatalogReader,
  type OcrEngine,
  type OcrFrame,
  type OcrResult,
} from '@services';
import { decideRecognition } from '@domain';
import type { Card } from '@domain';
import {
  CARD_BALOO,
  CARD_BILLY_BONES,
  CARD_BOUN,
  CARD_DAVID_XANATOS,
  CARD_FALLING_RABBIT_HOLE,
  CARD_GIZMODUCK,
  CARD_PROMISING_LEAD,
} from '../fixtures/cards';

/**
 * The cached catalog the matcher reads — includes the #104 same-number decoy pair
 * (Boun/Billy-Bones) and the #162 Action decoy pair (Promising Lead / Falling Down
 * the Rabbit Hole), so both the version-bearing and the version-less paths are
 * exercised against a real same-number collision.
 */
const fixtureCatalog: CatalogReader = {
  getAllCards: async () => [
    CARD_GIZMODUCK,
    CARD_BALOO,
    CARD_DAVID_XANATOS,
    CARD_BOUN,
    CARD_BILLY_BONES,
    CARD_PROMISING_LEAD,
    CARD_FALLING_RABBIT_HOLE,
  ],
};

const f = (x: number, y: number, width: number, height: number): OcrFrame => ({
  x,
  y,
  width,
  height,
});

/**
 * A clean, well-composed still as the device reads it: NAME (all-caps) over the
 * version, the `Storyborn • …` type line just below, then the collector line —
 * the geometry a good capture produces, with no artist credit crept into the gap.
 */
const cleanCapture = (
  name: string,
  version: string,
  collector: string,
): OcrResult => {
  const lines = [
    { text: name, frame: f(120, 500, 700, 150) },
    { text: version, frame: f(120, 655, 520, 90) },
    { text: 'Storyborn • Ally', frame: f(120, 760, 540, 80) },
    { text: collector, frame: f(120, 1500, 320, 60) },
  ];
  return {
    text: lines.map(l => l.text).join('\n'),
    blocks: [{ text: lines.map(l => l.text).join('\n'), lines }],
  };
};

/**
 * A near-clean still where the artist credit OCR'd INTO the title gap above the
 * version — the live D2 failure the parser fix targets. The correct read must
 * still clear the floor; on the PRE-FIX parser the credit polluted the `name +
 * version` key and the read fell below it, so this case is red → green at the
 * integration level (not just inert like the clean captures above).
 */
const pollutedCapture = (
  name: string,
  credit: string,
  version: string,
  collector: string,
): OcrResult => {
  const lines = [
    { text: name, frame: f(120, 500, 700, 150) },
    { text: credit, frame: f(120, 560, 540, 85) }, // crept into the title gap
    { text: version, frame: f(120, 655, 520, 85) },
    { text: 'Storyborn • Ally', frame: f(120, 760, 540, 80) },
    { text: collector, frame: f(120, 1500, 320, 60) },
  ];
  return {
    text: lines.map(l => l.text).join('\n'),
    blocks: [{ text: lines.map(l => l.text).join('\n'), lines }],
  };
};

const recognizerOver = (ocr: OcrResult) => {
  const engine: OcrEngine = { recognizeText: async (_uri: string) => ocr };
  return createOcrCardRecognizer({
    engine,
    matcher: createCardMatcher(fixtureCatalog),
  });
};

interface DiagnosticCase {
  card: Card;
  ocr: OcrResult;
}

const CASES: DiagnosticCase[] = [
  {
    card: CARD_GIZMODUCK,
    ocr: cleanCapture('GIZMODUCK', 'Suited Up', '105/204 EN 7'),
  },
  {
    card: CARD_BOUN,
    ocr: cleanCapture('BOUN', 'Tireless Boatman', '104/204 EN 10'),
  },
  {
    card: CARD_BALOO,
    ocr: cleanCapture('BALOO', 'Laid-Back Bear', '69/204 EN 10'),
  },
  {
    card: CARD_DAVID_XANATOS,
    ocr: cleanCapture('DAVID XANATOS', 'Steel Clan Leader', '184/204 EN 10'),
  },
];

describe('D3 — the four diagnostic cards clear the 0.70 floor on a clean capture', () => {
  test.each(CASES)(
    '$card.name #$card.collectorNumber: top candidate is correct, ≥ 0.70, and routes confident',
    async ({ card, ocr }) => {
      const recognizer = recognizerOver(ocr);
      const result = await recognizer.recognize({
        uri: 'file:///tmp/card.jpg',
      });

      // Correct card at #1, clearing the auto-confirm floor.
      expect(result.candidates[0].card).toEqual(card);
      expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.7);

      // And the routing policy auto-confirms it (not a manual pick).
      const decision = decideRecognition(result);
      expect(decision).toEqual({
        kind: 'confident',
        candidate: result.candidates[0],
      });
    },
  );

  test('a polluted capture (artist credit in the title gap) still auto-confirms the correct card', async () => {
    // Boun's live failure end-to-end: on the pre-fix parser the credit became the
    // subtitle → key "boun grace lim" → ~0.35 → ambiguous (a manual pick). After
    // the fix the version wins, the key is exact, and it auto-confirms.
    const ocr = pollutedCapture(
      'BOUN',
      '>Grace Lim',
      'Tireless Boatman',
      '104/204 EN 10',
    );
    const result = await recognizerOver(ocr).recognize({
      uri: 'file:///tmp/card.jpg',
    });

    expect(result.source).toEqual({
      collectorNumber: '104',
      name: 'BOUN Tireless Boatman',
    });
    expect(result.candidates[0].card).toEqual(CARD_BOUN);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(decideRecognition(result)).toEqual({
      kind: 'confident',
      candidate: result.candidates[0],
    });
  });

  test('an Action card (no version) auto-confirms on its bare name over a same-number decoy', async () => {
    // PROMISING LEAD #162: an Action card has no version, and its type line sits
    // directly under the name, so the parser yields the bare name. The match key is
    // just "promising lead" → exact over the #162 Action decoy (Falling Down the
    // Rabbit Hole, which wrongly won at ~35% on the device when flavor text leaked
    // into the name).
    const lines = [
      { text: 'PROMISING LEAD', frame: f(120, 500, 700, 150) },
      { text: 'Action', frame: f(120, 660, 240, 75) }, // type line, no version above
      {
        text: 'Chosen character gets +1 and gains Support this turn',
        frame: f(120, 840, 1900, 60),
      },
      { text: '162/204 EN 10', frame: f(120, 1500, 320, 60) },
    ];
    const ocr: OcrResult = {
      text: lines.map(l => l.text).join('\n'),
      blocks: [{ text: lines.map(l => l.text).join('\n'), lines }],
    };
    const result = await recognizerOver(ocr).recognize({
      uri: 'file:///tmp/card.jpg',
    });

    expect(result.source).toEqual({
      collectorNumber: '162',
      name: 'PROMISING LEAD',
    });
    expect(result.candidates[0].card).toEqual(CARD_PROMISING_LEAD);
    expect(result.candidates[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(decideRecognition(result)).toEqual({
      kind: 'confident',
      candidate: result.candidates[0],
    });
  });

  test('all four clear the floor with the default thresholds — corroboration is not required here', async () => {
    const confidences = await Promise.all(
      CASES.map(async ({ ocr }) => {
        const result = await recognizerOver(ocr).recognize({
          uri: 'file:///tmp/card.jpg',
        });
        return result.candidates[0].confidence;
      }),
    );
    // 4/4 land at 1.0 on a clean capture — the gate that records "unit 4 not
    // strictly needed for clean captures, built for the near-clean band".
    expect(confidences).toEqual([1, 1, 1, 1]);
  });
});
