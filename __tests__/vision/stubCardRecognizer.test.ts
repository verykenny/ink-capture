/**
 * StubCardRecognizer — a CardRecognizer that ignores the image and resolves to
 * a fixed result. Unblocks C2's scan→confirm→save slice before OCR exists; D1
 * swaps in OcrCardRecognizer behind the same interface.
 *
 * @format
 */

import { StubCardRecognizer } from '@services';
import type { CardImage, CardRecognizer } from '@services';
import type { RecognitionResult } from '@domain';
import { CARD_ELSA } from '../fixtures/cards';

const IMAGE: CardImage = { uri: 'file:///tmp/scan.jpg' };

describe('StubCardRecognizer', () => {
  test('recognize() resolves to the injected result regardless of the image', async () => {
    const fixed: RecognitionResult = {
      candidates: [{ card: CARD_ELSA, confidence: 0.42 }],
      source: { name: 'Elsa' },
    };
    const recognizer = new StubCardRecognizer(fixed);
    await expect(recognizer.recognize(IMAGE)).resolves.toBe(fixed);
    await expect(
      recognizer.recognize({ uri: 'file:///somewhere/else.png' }),
    ).resolves.toBe(fixed);
  });

  test('a no-match result is returned verbatim', async () => {
    const empty: RecognitionResult = { candidates: [] };
    const recognizer = new StubCardRecognizer(empty);
    await expect(recognizer.recognize(IMAGE)).resolves.toBe(empty);
  });

  test('forCard wraps a single candidate at confidence 1.0 by default', async () => {
    const result = await StubCardRecognizer.forCard(CARD_ELSA).recognize(IMAGE);
    expect(result).toEqual({
      candidates: [{ card: CARD_ELSA, confidence: 1 }],
    });
  });

  test('forCard accepts an explicit confidence', async () => {
    const result = await StubCardRecognizer.forCard(CARD_ELSA, 0.8).recognize(
      IMAGE,
    );
    expect(result.candidates).toEqual([{ card: CARD_ELSA, confidence: 0.8 }]);
  });

  test('satisfies the CardRecognizer interface', () => {
    const recognizer: CardRecognizer = StubCardRecognizer.forCard(CARD_ELSA);
    expect(typeof recognizer.recognize).toBe('function');
  });
});
