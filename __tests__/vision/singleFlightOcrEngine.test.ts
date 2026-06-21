/**
 * withSingleFlight — the OCR serialization guard (the JS half of the
 * "OCR dies after a few captures" fix).
 *
 * The native leak was a fresh recognizer per call; the native patch reuses one.
 * This decorator is the JS-side guarantee that we never drive two native OCR
 * pipelines at once — so peak memory stays bounded to a single still and rapid
 * captures can't pile up overlapping reads. These specs pin that behaviour with
 * a controllable fake engine: no native module, no device.
 *
 * @format
 */

import { withSingleFlight } from '@services/vision/singleFlightOcrEngine';
import type { OcrEngine, OcrResult } from '@services';

const ocr = (text: string): OcrResult => ({ text, blocks: [] });

interface Deferred {
  promise: Promise<OcrResult>;
  resolve: (result: OcrResult) => void;
  reject: (error: unknown) => void;
}

const deferred = (): Deferred => {
  let resolve!: (result: OcrResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<OcrResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Flush all pending microtasks so queued `.then` callbacks have run. */
const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

/**
 * A fake engine whose every call hangs on a caller-controlled deferred, while
 * recording invocation order and the peak number of simultaneously-active calls.
 */
const buildEngine = () => {
  const calls: string[] = [];
  const deferreds: Deferred[] = [];
  let active = 0;
  let maxActive = 0;

  const recognizeText = jest.fn(async (uri: string): Promise<OcrResult> => {
    calls.push(uri);
    active += 1;
    maxActive = Math.max(maxActive, active);
    const d = deferred();
    deferreds.push(d);
    try {
      return await d.promise;
    } finally {
      active -= 1;
    }
  });

  const engine: OcrEngine = { recognizeText };
  return {
    engine,
    recognizeText,
    calls,
    deferreds,
    maxActive: () => maxActive,
  };
};

describe('withSingleFlight', () => {
  test('runs reads one at a time — a queued read does not start until the prior one settles', async () => {
    const { engine, calls, deferreds, maxActive } = buildEngine();
    const sf = withSingleFlight(engine);

    const p1 = sf.recognizeText('a');
    const p2 = sf.recognizeText('b');

    await tick();
    // Only the first read has reached the engine; the second is still queued.
    expect(calls).toEqual(['a']);

    deferreds[0].resolve(ocr('A'));
    await tick();
    // First settled, so the second now starts.
    expect(calls).toEqual(['a', 'b']);

    deferreds[1].resolve(ocr('B'));
    expect(await p1).toEqual(ocr('A'));
    expect(await p2).toEqual(ocr('B'));
    // At no point were two native reads in flight together.
    expect(maxActive()).toBe(1);
  });

  test('returns each call its own result and forwards each URI in order', async () => {
    const { engine, recognizeText, deferreds } = buildEngine();
    const sf = withSingleFlight(engine);

    const p1 = sf.recognizeText('one');
    const p2 = sf.recognizeText('two');

    await tick();
    deferreds[0].resolve(ocr('1'));
    await tick();
    deferreds[1].resolve(ocr('2'));

    expect(await p1).toEqual(ocr('1'));
    expect(await p2).toEqual(ocr('2'));
    expect(recognizeText).toHaveBeenNthCalledWith(1, 'one');
    expect(recognizeText).toHaveBeenNthCalledWith(2, 'two');
  });

  test('a failed read rejects its own caller but does not block the reads queued behind it', async () => {
    const { engine, calls, deferreds } = buildEngine();
    const sf = withSingleFlight(engine);

    const p1 = sf.recognizeText('boom');
    const p2 = sf.recognizeText('ok');

    await tick();
    expect(calls).toEqual(['boom']);

    deferreds[0].reject(new Error('ocr failed'));
    // The rejection surfaces to this call's own caller...
    await expect(p1).rejects.toThrow('ocr failed');

    await tick();
    // ...and the queue recovers: the next read still runs and resolves.
    expect(calls).toEqual(['boom', 'ok']);
    deferreds[1].resolve(ocr('OK'));
    expect(await p2).toEqual(ocr('OK'));
  });
});
