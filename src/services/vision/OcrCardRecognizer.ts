/**
 * OcrCardRecognizer — the D1 production recognizer.
 *
 * Composition, not re-implementation: it runs the captured still through the
 * injected `OcrEngine`, parses the text to recognition signals with the pure
 * `parseCardText`, and hands those to C1's `CardMatcher.match` — which finally
 * runs in production here. It satisfies `CardRecognizer` exactly, so the
 * composition-root swap and `ScanScreen` need no change, and the matcher /
 * `RecognitionSource` / `RecognitionResult` contracts stay untouched.
 *
 * Both collaborators are interfaces, so this is unit-tested with a fake engine +
 * the real matcher over a fixture catalog — no native module, no network.
 *
 * @format
 */

import type { RecognitionResult } from '@domain';
import type { CardImage, CardRecognizer } from './CardRecognizer';
import type { CardMatcher } from './cardMatcher';
import type { OcrEngine } from './OcrEngine';
import { parseCardText } from './parseCardText';
import { logRecognitionDiagnostics } from './recognitionDiagnostics';

/** Collaborators for the OCR recognizer: an OCR engine and the catalog matcher. */
export interface OcrCardRecognizerDeps {
  engine: OcrEngine;
  matcher: CardMatcher;
}

export const createOcrCardRecognizer = ({
  engine,
  matcher,
}: OcrCardRecognizerDeps): CardRecognizer => ({
  async recognize(image: CardImage): Promise<RecognitionResult> {
    const ocr = await engine.recognizeText(image.uri);
    const source = parseCardText(ocr);
    const result = await matcher.match(source);
    // Dev-only, flag-gated: log what live OCR actually read so D2's routing
    // thresholds can be tuned against real captures. No-op unless DEBUG_RECOGNITION.
    logRecognitionDiagnostics({ ocr, source, result });
    return result;
  },
});
