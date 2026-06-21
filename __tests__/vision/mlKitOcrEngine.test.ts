/**
 * mapMlKitResult — the pure ML Kit → OcrResult mapping (D1 seam logic).
 *
 * The seam's whole job is normalizing ML Kit's `{ left, top, width, height }`
 * frames into the engine-agnostic `{ x, y, width, height }`. That mapping is
 * exported so it is unit-testable without the native module — these specs feed
 * it hand-authored ML-Kit-shaped fixtures (no device, no native call).
 *
 * @format
 */

import { mapMlKitResult } from '@services/vision/MlKitOcrEngine';
import type {
  Frame,
  TextBlock,
  TextLine,
  TextRecognitionResult,
} from '@react-native-ml-kit/text-recognition';

const frame = (
  left: number,
  top: number,
  width: number,
  height: number,
): Frame => ({ left, top, width, height });

const mlLine = (text: string, f?: Frame): TextLine => ({
  text,
  elements: [],
  recognizedLanguages: [],
  ...(f ? { frame: f } : {}),
});

const mlBlock = (text: string, lines: TextLine[], f?: Frame): TextBlock => ({
  text,
  lines,
  recognizedLanguages: [],
  ...(f ? { frame: f } : {}),
});

describe('mapMlKitResult', () => {
  test('maps left/top frames to seam x/y, preserving size, text, and structure', () => {
    const result: TextRecognitionResult = {
      text: 'Elsa\nSnow Queen',
      blocks: [
        mlBlock(
          'Elsa',
          [mlLine('Elsa', frame(10, 20, 100, 40))],
          frame(10, 20, 100, 44),
        ),
        mlBlock(
          'Snow Queen',
          [mlLine('Snow Queen', frame(10, 70, 90, 30))],
          frame(10, 70, 90, 30),
        ),
      ],
    };

    expect(mapMlKitResult(result)).toEqual({
      text: 'Elsa\nSnow Queen',
      blocks: [
        {
          text: 'Elsa',
          frame: { x: 10, y: 20, width: 100, height: 44 },
          lines: [
            { text: 'Elsa', frame: { x: 10, y: 20, width: 100, height: 40 } },
          ],
        },
        {
          text: 'Snow Queen',
          frame: { x: 10, y: 70, width: 90, height: 30 },
          lines: [
            {
              text: 'Snow Queen',
              frame: { x: 10, y: 70, width: 90, height: 30 },
            },
          ],
        },
      ],
    });
  });

  test('omits frames ML Kit does not report; maps a frameless line and an empty block', () => {
    const result: TextRecognitionResult = {
      text: 'Stitch\n12/204',
      blocks: [
        mlBlock('Stitch', [mlLine('Stitch')]), // block + line both frameless
        mlBlock('12/204', []), // block with no lines
      ],
    };

    expect(mapMlKitResult(result)).toEqual({
      text: 'Stitch\n12/204',
      blocks: [
        { text: 'Stitch', lines: [{ text: 'Stitch' }] },
        { text: '12/204', lines: [] },
      ],
    });
  });
});
