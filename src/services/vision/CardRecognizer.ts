import type { RecognitionResult } from '@domain';

/** A captured frame handed to a recognizer. Opaque at the interface level. */
export interface CardImage {
  uri: string; // file URI of a captured still
}

/**
 * Pluggable recognition backend. MVP ships StubCardRecognizer (C1); D1 swaps in
 * OcrCardRecognizer with no caller change.
 */
export interface CardRecognizer {
  recognize(image: CardImage): Promise<RecognitionResult>;
}
