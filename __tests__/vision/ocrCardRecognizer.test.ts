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

  test('real spike capture (Thomas #1) resolves over same-number decoys via the cleaned name', async () => {
    // Collector #1 collides across many cards, so the name must disambiguate. The
    // tall "O4" lore glyph must NOT pollute the name or Thomas loses to the others.
    const thomas: Card = {
      id: '2464',
      name: 'Thomas',
      version: 'Wide-Eyed Recruit',
      setCode: 'URR',
      collectorNumber: '1',
      rarity: 'Common',
      availableFinishes: ['normal', 'foil'],
    };
    const mickeyOne: Card = {
      id: '1191',
      name: 'Mickey Mouse',
      version: 'Brave Little Tailor',
      setCode: 'TFC',
      collectorNumber: '1',
      rarity: 'Legendary',
      availableFinishes: ['normal'],
    };
    const owlOne: Card = {
      id: '1200',
      name: 'Owl',
      version: 'Pirate Lookout',
      setCode: 'ITI',
      collectorNumber: '1',
      rarity: 'Common',
      availableFinishes: ['normal'],
    };
    const realCatalog: CatalogReader = {
      getAllCards: async () => [thomas, mickeyOne, owlOne],
    };

    // Geometry from the live spike capture; flavor line synthesized (IP-clean).
    const frame = (x: number, y: number, width: number, height: number) => ({
      x,
      y,
      width,
      height,
    });
    const ocr: OcrResult = {
      text: 'O4\nTHOMAS\nWide-Eyed Recruit\n1/204- EN .11',
      blocks: [
        {
          text: 'O4',
          lines: [{ text: 'O4', frame: frame(2243, 2264, 429, 216) }],
          frame: frame(2243, 2264, 429, 216),
        },
        {
          text: 'THOMAS\nWide-Eyed Recruit',
          lines: [
            { text: 'THOMAS', frame: frame(465, 2228, 546, 150) },
            { text: 'Wide-Eyed Recruit', frame: frame(469, 2398, 629, 99) },
          ],
          frame: frame(464, 2228, 635, 272),
        },
        {
          text: '1/204- EN .11',
          lines: [{ text: '1/204- EN .11', frame: frame(432, 3693, 358, 78) }],
          frame: frame(432, 3693, 358, 78),
        },
      ],
    };

    const recognizeText = jest.fn(
      async (_uri: string): Promise<OcrResult> => ocr,
    );
    const recognizer = createOcrCardRecognizer({
      engine: { recognizeText },
      matcher: createCardMatcher(realCatalog),
    });

    const result = await recognizer.recognize({
      uri: 'file:///tmp/thomas.jpg',
    });
    expect(result.candidates[0].card).toEqual(thomas);
    expect(result.source).toEqual({
      collectorNumber: '1',
      name: 'THOMAS Wide-Eyed Recruit',
    });
  });

  test('live Baloo #69: a tall flavor line no longer beats the title — resolves over same-number decoys', async () => {
    // The 2026-06-20 device failure end-to-end: before the parser fix the tall
    // flavor prose won the name, so all #69 cards scored ~13–17% and the correct
    // one (Baloo) was buried past the cap. Now the short title wins and resolves.
    const baloo: Card = {
      id: 'URR-69',
      name: 'Baloo',
      version: 'Laid-Back Bear',
      setCode: 'URR',
      collectorNumber: '69',
      rarity: 'Common',
      availableFinishes: ['normal', 'foil'],
    };
    const mulan69: Card = {
      id: 'TFC-69',
      name: 'Mulan',
      version: 'Resourceful Recruit',
      setCode: 'TFC',
      collectorNumber: '69',
      rarity: 'Super Rare',
      availableFinishes: ['normal'],
    };
    const arthur69: Card = {
      id: 'ROF-69',
      name: 'Arthur',
      version: 'Trained Swordsman',
      setCode: 'ROF',
      collectorNumber: '69',
      rarity: 'Common',
      availableFinishes: ['normal'],
    };
    const catalog69: CatalogReader = {
      getAllCards: async () => [baloo, mulan69, arthur69],
    };

    const fr = (x: number, y: number, width: number, height: number) => ({
      x,
      y,
      width,
      height,
    });
    // Synthesized flavor prose (IP-clean) given the TALLEST frame, as the device read it.
    const ocr: OcrResult = {
      text: 'BALOO\nLaid-Back Bear\nLorem ipsum...\n69/204 EN 10',
      blocks: [
        {
          text: 'BALOO\nLaid-Back Bear\nLorem ipsum...\n69/204 EN 10',
          lines: [
            { text: 'BALOO', frame: fr(120, 500, 500, 130) },
            { text: 'Laid-Back Bear', frame: fr(120, 640, 420, 92) },
            {
              text: 'Lorem ipsum dolor sit amet consectetur adipiscing',
              frame: fr(120, 900, 1800, 210),
            },
            { text: '69/204 EN 10', frame: fr(120, 1500, 300, 60) },
          ],
        },
      ],
    };

    const recognizeText = jest.fn(async (_uri: string) => ocr);
    const recognizer = createOcrCardRecognizer({
      engine: { recognizeText },
      matcher: createCardMatcher(catalog69),
    });

    const result = await recognizer.recognize({ uri: 'file:///tmp/baloo.jpg' });

    expect(result.source).toEqual({
      collectorNumber: '69',
      name: 'BALOO Laid-Back Bear',
    });
    expect(result.candidates[0].card).toEqual(baloo);
    expect(result.candidates[0].confidence).toBe(1);
  });
});
