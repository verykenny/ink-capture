/**
 * StubCardRecognizer — a CardRecognizer that ignores the captured image and
 * resolves to a fixed RecognitionResult.
 *
 * It unblocks C2's scan→confirm→save slice before any OCR exists: wire it with
 * a chosen card and the whole flow runs end-to-end. D1's OcrCardRecognizer
 * replaces it behind the same `CardRecognizer` interface with no caller change,
 * and tests keep it as a deterministic recognizer.
 *
 * @format
 */

import type { Card, RecognitionResult } from '@domain';
import type { CardImage, CardRecognizer } from './CardRecognizer';

export class StubCardRecognizer implements CardRecognizer {
  constructor(private readonly result: RecognitionResult) {}

  recognize(_image: CardImage): Promise<RecognitionResult> {
    return Promise.resolve(this.result);
  }

  /** Wrap a single card as the sole candidate (default confidence 1.0). */
  static forCard(card: Card, confidence = 1): StubCardRecognizer {
    return new StubCardRecognizer({ candidates: [{ card, confidence }] });
  }
}
