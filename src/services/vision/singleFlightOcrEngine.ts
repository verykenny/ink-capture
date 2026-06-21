/**
 * withSingleFlight — serialize an OcrEngine so only one read runs at a time.
 *
 * Still-image OCR is expensive on native resources: each call decodes a
 * full-resolution capture and drives ML Kit's native (Metal-backed) detector.
 * Letting two reads overlap doubles peak memory and contends on the shared
 * recognizer. This decorator chains every `recognizeText` call after the
 * previous one *settles*, so at most one native OCR pipeline is ever in flight —
 * the JS-side guarantee that complements the native fix (a reused recognizer +
 * released per-call resources) for the "OCR dies after a few captures" leak.
 *
 * Pure and engine-agnostic: it wraps any `OcrEngine`, so it is unit-tested
 * against a fake engine with no native module. `createMlKitOcrEngine` applies it
 * around the real ML Kit call.
 *
 * @format
 */

import type { OcrEngine, OcrResult } from './OcrEngine';

/**
 * Wrap `engine` so its `recognizeText` calls run strictly one-at-a-time, in the
 * order they were requested. A failed read never blocks (or rejects) the reads
 * queued behind it — the rejection still surfaces to that call's own caller.
 */
export const withSingleFlight = (engine: OcrEngine): OcrEngine => {
  // Tail of the in-flight chain. Each new call appends itself after this
  // settles; the swallowed `.catch` keeps the tail from ever rejecting, so one
  // failed read doesn't poison the queue (or trigger an unhandled rejection).
  let tail: Promise<unknown> = Promise.resolve();

  return {
    recognizeText(imageUri: string): Promise<OcrResult> {
      const run = tail.then(() => engine.recognizeText(imageUri));
      tail = run.catch(() => undefined);
      return run;
    },
  };
};
