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
  CARD_GIZMODUCK,
} from '../fixtures/cards';

/** The cached catalog the matcher reads — includes the #104 same-number decoy pair. */
const fixtureCatalog: CatalogReader = {
  getAllCards: async () => [
    CARD_GIZMODUCK,
    CARD_BALOO,
    CARD_DAVID_XANATOS,
    CARD_BOUN,
    CARD_BILLY_BONES,
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
