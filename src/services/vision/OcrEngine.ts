/**
 * OcrEngine — the still-image text-recognition seam.
 *
 * A narrow port over an on-device OCR backend: hand it a captured still's file
 * URI and get back the recognized text plus its block/line structure (each with
 * an optional bounding frame). `parseCardText` reads this shape to pull a card's
 * name and collector number; `OcrCardRecognizer` feeds the parsed signals to the
 * C1 matcher.
 *
 * Mirrors B2's `HttpJsonClient` pattern: this interface is the only OCR
 * abstraction the rest of D1 depends on, so every consumer is unit-testable
 * against a fake engine — no native module, no device. The sole concrete
 * implementation (`createMlKitOcrEngine`) is the one module that imports the
 * native ML Kit lib, and it normalizes ML Kit's `{ left, top, width, height }`
 * frames into the `{ x, y, width, height }` shape used here.
 *
 * D1-owned: `OcrEngine`/`OcrResult` are exported (via the `@services` barrel)
 * for the recognizer and its tests, but they are NOT an A3 service contract —
 * treat them as a D1-local seam, not a stable cross-milestone API.
 *
 * @format
 */

/** A bounding box, normalized to top-left origin (`x`, `y`) plus size. */
export interface OcrFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A recognized line of text, with its bounding frame when the engine reports one. */
export interface OcrTextLine {
  text: string;
  frame?: OcrFrame;
}

/** A recognized block (a group of lines), with its bounding frame when available. */
export interface OcrTextBlock {
  text: string;
  lines: OcrTextLine[];
  frame?: OcrFrame;
}

/** The full result of one still-image OCR pass: flattened text + structured blocks. */
export interface OcrResult {
  text: string;
  blocks: OcrTextBlock[];
}

/** Recognizes text in a captured still, identified by its file URI. */
export interface OcrEngine {
  recognizeText(imageUri: string): Promise<OcrResult>;
}
