/**
 * recognitionDiagnostics — the dev-only, flag-gated recognition logger.
 *
 * `formatRecognitionDiagnostics` is pure (tested directly); `logRecognitionDiagnostics`
 * only console.logs when DEBUG_RECOGNITION is set. react-native-config is mocked
 * empty in Jest (jest.setup.ts) so the flag defaults OFF — this spec mutates that
 * mocked object to exercise the on branch, restoring it afterwards. No device,
 * no native, IP-clean fixtures only.
 *
 * @format
 */

import Config from 'react-native-config';
import {
  formatRecognitionDiagnostics,
  getLastRecognitionDiagnostics,
  getRecognitionDiagnosticsHistory,
  logRecognitionDiagnostics,
  subscribeRecognitionDiagnostics,
} from '@services';
import type { OcrResult } from '@services';
import type { RecognitionResult, RecognitionSource } from '@domain';
import { CARD_ELSA, CARD_MICKEY } from '../fixtures/cards';

type MutableConfig = Record<string, string | undefined>;

const OCR: OcrResult = {
  text: 'Elsa\nSnow Queen\n042/204',
  blocks: [],
};

const SOURCE: RecognitionSource = {
  collectorNumber: '42',
  name: 'Elsa Snow Queen',
};

const RESULT: RecognitionResult = {
  candidates: [
    { card: CARD_ELSA, confidence: 0.91 },
    { card: CARD_MICKEY, confidence: 0.42 },
  ],
  source: SOURCE,
};

describe('formatRecognitionDiagnostics', () => {
  test('includes the raw OCR text, parsed source, and ranked candidates with confidences', () => {
    const text = formatRecognitionDiagnostics({
      ocr: OCR,
      source: SOURCE,
      result: RESULT,
    });

    expect(text).toContain('Elsa\nSnow Queen\n042/204'); // raw OCR, verbatim
    expect(text).toContain('"collectorNumber":"42"'); // parsed source (JSON)
    // Ranked + 1-based numbered, best-first — the order matters for tuning.
    expect(text).toContain('1. Elsa — Snow Queen (TFC #042) 91%');
    expect(text).toContain(
      '2. Mickey Mouse — Brave Little Tailor (TFC #115) 42%',
    );
    expect(text.indexOf('1. Elsa')).toBeLessThan(text.indexOf('2. Mickey'));
  });

  test('renders an empty-candidate read as (none) and empty OCR as (empty)', () => {
    const text = formatRecognitionDiagnostics({
      ocr: { text: '', blocks: [] },
      source: {},
      result: { candidates: [] },
    });

    expect(text).toContain('(empty)');
    expect(text).toContain('(none)');
  });

  test('dumps per-line frames (the geometry the version selection ranks on) as JSON', () => {
    const text = formatRecognitionDiagnostics({
      ocr: {
        text: 'CARD SOLDIERS\nRoyal Troops',
        blocks: [
          {
            text: 'CARD SOLDIERS\nRoyal Troops',
            lines: [
              {
                text: 'CARD SOLDIERS',
                frame: { x: 120, y: 500, width: 760, height: 150 },
              },
              {
                text: 'Royal Troops',
                frame: { x: 120, y: 650, width: 520, height: 70 },
              },
            ],
          },
        ],
      },
      source: { collectorNumber: '129', name: 'CARD SOLDIERS Royal Troops' },
      result: { candidates: [] },
    });

    expect(text).toContain('[recognition] OCR lines (JSON):');
    // Each line carries its text + rounded top-left x/y and w/h.
    expect(text).toContain(
      '{"t":"CARD SOLDIERS","x":120,"y":500,"w":760,"h":150}',
    );
    expect(text).toContain(
      '{"t":"Royal Troops","x":120,"y":650,"w":520,"h":70}',
    );
  });
});

describe('logRecognitionDiagnostics', () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    spy.mockRestore();
    delete (Config as MutableConfig).DEBUG_RECOGNITION;
  });

  test('does not log when the DEBUG_RECOGNITION flag is unset (production default)', () => {
    logRecognitionDiagnostics({ ocr: OCR, source: SOURCE, result: RESULT });
    expect(spy).not.toHaveBeenCalled();
  });

  test('logs the formatted block when DEBUG_RECOGNITION is "true"', () => {
    (Config as MutableConfig).DEBUG_RECOGNITION = 'true';
    logRecognitionDiagnostics({ ocr: OCR, source: SOURCE, result: RESULT });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      formatRecognitionDiagnostics({
        ocr: OCR,
        source: SOURCE,
        result: RESULT,
      }),
    );
  });
});

describe('recognition diagnostics sink (for the on-screen overlay)', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (Config as MutableConfig).DEBUG_RECOGNITION;
  });

  test('publishes the latest block and notifies subscribers when the flag is on', () => {
    (Config as MutableConfig).DEBUG_RECOGNITION = 'true';
    const onChange = jest.fn();
    const unsubscribe = subscribeRecognitionDiagnostics(onChange);

    logRecognitionDiagnostics({ ocr: OCR, source: SOURCE, result: RESULT });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(getLastRecognitionDiagnostics()).toBe(
      formatRecognitionDiagnostics({
        ocr: OCR,
        source: SOURCE,
        result: RESULT,
      }),
    );
    unsubscribe();
  });

  test('does not notify when the flag is off, and unsubscribe stops further updates', () => {
    const onChange = jest.fn();
    const unsubscribe = subscribeRecognitionDiagnostics(onChange);

    // Flag off: no publish, no notify.
    logRecognitionDiagnostics({ ocr: OCR, source: SOURCE, result: RESULT });
    expect(onChange).not.toHaveBeenCalled();

    // After unsubscribe, even a flag-on log doesn't reach this listener.
    unsubscribe();
    (Config as MutableConfig).DEBUG_RECOGNITION = 'true';
    logRecognitionDiagnostics({ ocr: OCR, source: SOURCE, result: RESULT });
    expect(onChange).not.toHaveBeenCalled();
  });

  test('accumulates a session history (newest last) for one-tap export', () => {
    (Config as MutableConfig).DEBUG_RECOGNITION = 'true';
    const before = getRecognitionDiagnosticsHistory();

    const first = { ocr: OCR, source: SOURCE, result: RESULT };
    const second = {
      ocr: { text: 'SECOND CARD\n7/204', blocks: [] },
      source: { collectorNumber: '7', name: 'second card' },
      result: { candidates: [] } as RecognitionResult,
    };
    logRecognitionDiagnostics(first);
    logRecognitionDiagnostics(second);

    const history = getRecognitionDiagnosticsHistory();
    // Both captures are present, second after first (export order), and the
    // history grew — so a session of reads can be shared in one go.
    expect(history).toContain(formatRecognitionDiagnostics(first));
    expect(history).toContain(formatRecognitionDiagnostics(second));
    expect(history.indexOf('SECOND CARD')).toBeGreaterThan(
      history.indexOf(SOURCE.name ?? ''),
    );
    expect(history.length).toBeGreaterThan(before.length);
  });
});
