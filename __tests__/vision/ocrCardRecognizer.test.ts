/**
 * OcrCardRecognizer — the D1 recognizer composition (test-first).
 *
 * createOcrCardRecognizer wires a fake OcrEngine to the REAL createCardMatcher
 * (C1) over a hand-authored fixture catalog, exercising the whole production
 * chain except the native OCR call: engine → parseCardText → matcher.match.
 *
 * The fixture catalog mirrors B2's stored representation — collector numbers in
 * String(raw.number) form (no leading zeros) — so the "042/204 → 42" case proves
 * the parser's normalization actually lands on the matcher's exact tier.
 *
 * IP guardrail: invented cards + hand-authored OCR text. No bulk data, no images.
 *
 * @format
 */

import {
  createCardMatcher,
  createOcrCardRecognizer,
  type CardRecognizer,
  type CatalogReader,
  type OcrEngine,
  type OcrResult,
} from '@services';
import type { Card } from '@domain';

/** Catalog-form fixtures: collector numbers as String(raw.number), no leading zeros. */
const ELSA: Card = {
  id: 'TFC-042',
  name: 'Elsa',
  version: 'Snow Queen',
  setCode: 'TFC',
  collectorNumber: '42',
  rarity: 'Legendary',
  availableFinishes: ['normal', 'foil'],
};

const MICKEY: Card = {
  id: 'TFC-115',
  name: 'Mickey Mouse',
  version: 'Brave Little Tailor',
  setCode: 'TFC',
  collectorNumber: '115',
  rarity: 'Super Rare',
  availableFinishes: ['normal', 'foil'],
};

const catalog: CatalogReader = {
  getAllCards: async () => [ELSA, MICKEY],
};

/** One block of frame-less lines — geometry is covered in parseCardText.test.ts. */
const ocrOf = (...texts: string[]): OcrResult => ({
  text: texts.join('\n'),
  blocks: [{ text: texts.join('\n'), lines: texts.map(text => ({ text })) }],
});

const buildRecognizer = (result: OcrResult) => {
  const recognizeText = jest.fn(
    async (_uri: string): Promise<OcrResult> => result,
  );
  const engine: OcrEngine = { recognizeText };
  const recognizer = createOcrCardRecognizer({
    engine,
    matcher: createCardMatcher(catalog),
  });
  return { recognizer, recognizeText };
};

describe('createOcrCardRecognizer', () => {
  test('satisfies the CardRecognizer interface', () => {
    const { recognizer } = buildRecognizer(ocrOf('Elsa'));
    const asInterface: CardRecognizer = recognizer; // compile-time shape check
    expect(typeof asInterface.recognize).toBe('function');
  });

  test('passes the captured image URI through to the engine', async () => {
    const { recognizer, recognizeText } = buildRecognizer(ocrOf('Elsa'));
    await recognizer.recognize({ uri: 'file:///tmp/capture.jpg' });
    expect(recognizeText).toHaveBeenCalledWith('file:///tmp/capture.jpg');
  });

  test('clean read resolves the correct top candidate via the exact tier (042/204 → 42)', async () => {
    // The printed "042/204" normalizes to "42", which is exactly how the catalog
    // stores Elsa — so the exact-collector tier (not just the fuzzy name) hits.
    const { recognizer } = buildRecognizer(
      ocrOf('Elsa', 'Snow Queen', '042/204'),
    );
    const result = await recognizer.recognize({
      uri: 'file:///tmp/capture.jpg',
    });

    expect(result.candidates[0]).toEqual({ card: ELSA, confidence: 1 });
    expect(result.source).toEqual({
      collectorNumber: '42',
      name: 'Elsa Snow Queen',
    });
  });

  test('number-only read resolves through the exact-collector tier', async () => {
    const { recognizer } = buildRecognizer(ocrOf('115/204'));
    const result = await recognizer.recognize({
      uri: 'file:///tmp/capture.jpg',
    });

    expect(result.candidates).toEqual([{ card: MICKEY, confidence: 1 }]);
    expect(result.source).toEqual({ collectorNumber: '115' });
  });

  test('name-only read (slash lost) resolves through the fuzzy name tier', async () => {
    const { recognizer } = buildRecognizer(
      ocrOf('Mickey Mouse', 'Brave Little Tailor'),
    );
    const result = await recognizer.recognize({
      uri: 'file:///tmp/capture.jpg',
    });

    expect(result.candidates[0].card).toEqual(MICKEY);
    expect(result.source).toEqual({ name: 'Mickey Mouse Brave Little Tailor' });
  });

  test('empty OCR yields no candidates (routes to the Confirm no-match branch)', async () => {
    const { recognizer } = buildRecognizer({ text: '', blocks: [] });
    const result = await recognizer.recognize({
      uri: 'file:///tmp/capture.jpg',
    });

    expect(result.candidates).toEqual([]);
    expect(result.source).toEqual({});
  });
});
