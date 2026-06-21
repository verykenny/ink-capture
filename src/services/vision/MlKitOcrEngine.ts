/**
 * MlKitOcrEngine — the ONLY module that touches the ML Kit native lib.
 *
 * Wraps `@react-native-ml-kit/text-recognition`'s still-image `recognize(uri)`
 * (on-device, free, Latin script) and maps its result into the engine-agnostic
 * `OcrResult`. ML Kit reports each frame as `{ left, top, width, height }`; the
 * seam uses `{ x, y, width, height }`, so the mapping translates `left → x` and
 * `top → y` here — keeping every other D1 module free of ML Kit's exact shape.
 *
 * Mocked in `jest.setup.ts`, so the JS suite never loads the native module: the
 * recognizer/parser are tested against a fake `OcrEngine`, never this one.
 *
 * @format
 */

import TextRecognition, {
  TextRecognitionScript,
} from '@react-native-ml-kit/text-recognition';
import type {
  Frame,
  TextBlock,
  TextLine,
  TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';
import type {
  OcrEngine,
  OcrFrame,
  OcrResult,
  OcrTextBlock,
  OcrTextLine,
} from './OcrEngine';
import { withSingleFlight } from './singleFlightOcrEngine';

/** Translate ML Kit's `left`/`top` frame into the seam's `x`/`y`; omit when absent. */
const toOcrFrame = (frame: Frame | undefined): OcrFrame | undefined =>
  frame
    ? { x: frame.left, y: frame.top, width: frame.width, height: frame.height }
    : undefined;

const toOcrLine = (line: TextLine): OcrTextLine => {
  const frame = toOcrFrame(line.frame);
  return frame ? { text: line.text, frame } : { text: line.text };
};

const toOcrBlock = (block: TextBlock): OcrTextBlock => {
  const frame = toOcrFrame(block.frame);
  const lines = block.lines.map(toOcrLine);
  return frame
    ? { text: block.text, lines, frame }
    : { text: block.text, lines };
};

/**
 * The pure ML Kit → OcrResult mapping (the seam's actual logic: left→x, top→y,
 * size/structure pass-through, frame omitted when absent). Exported so it is
 * unit-testable without the native module — `createMlKitOcrEngine` is just this
 * mapping over a real `TextRecognition.recognize` call.
 */
export const mapMlKitResult = (result: TextRecognitionResult): OcrResult => ({
  text: result.text,
  blocks: result.blocks.map(toOcrBlock),
});

/**
 * Build the production OCR engine backed by on-device ML Kit text recognition.
 *
 * Wrapped in `withSingleFlight` so concurrent captures never drive two native
 * OCR pipelines at once — peak memory stays bounded to a single still, which
 * (with the native recognizer-reuse patch) keeps repeated captures from
 * exhausting native resources and returning empty/garbage reads.
 */
export const createMlKitOcrEngine = (): OcrEngine =>
  withSingleFlight({
    async recognizeText(imageUri: string): Promise<OcrResult> {
      const result = await TextRecognition.recognize(
        imageUri,
        TextRecognitionScript.LATIN,
      );
      return mapMlKitResult(result);
    },
  });
