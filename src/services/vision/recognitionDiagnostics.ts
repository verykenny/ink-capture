/**
 * recognitionDiagnostics — dev-only, flag-gated visibility into a live read.
 *
 * D2's analog of D1's spike: with `DEBUG_RECOGNITION` set, the OCR recognizer
 * logs what it actually read live — the raw ML Kit text, the parsed
 * `RecognitionSource`, and the ranked candidates with confidences — so the
 * routing thresholds in `decideRecognition` can be tuned against real captures
 * instead of guesses. (The spike was 10/10 on curated stills; live reads drift,
 * and this is how we see the drift.)
 *
 * `formatRecognitionDiagnostics` is pure — text in, text out, unit-tested
 * directly. `logRecognitionDiagnostics` is the only side-effecting part and
 * no-ops unless the flag is on, so production builds stay silent and nothing
 * reaches the release UI. Not an A3 contract — a D2-local dev seam.
 *
 * @format
 */

import { cardDisplayTitle } from '@domain';
import type {
  RecognitionCandidate,
  RecognitionResult,
  RecognitionSource,
} from '@domain';
import type { OcrResult, OcrTextLine } from './OcrEngine';
import { shouldLogRecognitionDiagnostics } from './visionConfig';

/** The three signals a single recognition pass exposes for tuning. */
export interface RecognitionDiagnostics {
  ocr: OcrResult;
  source: RecognitionSource;
  result: RecognitionResult;
}

/** One ranked candidate as a single diagnostics line. */
const candidateLine = (
  candidate: RecognitionCandidate,
  index: number,
): string => {
  const { card, confidence } = candidate;
  const title = cardDisplayTitle(card);
  const pct = Math.round(confidence * 100);
  return `  ${index + 1}. ${title} (${card.setCode} #${
    card.collectorNumber
  }) ${pct}%`;
};

/**
 * Flatten blocks → lines exactly as `parseCardText` sees them (a block with no
 * lines contributes its own text), so the dumped geometry is the parser's input.
 */
const ocrLines = (ocr: OcrResult): OcrTextLine[] =>
  ocr.blocks.flatMap(block => {
    if (block.lines.length > 0) {
      return block.lines;
    }
    if (!block.text) {
      return [];
    }
    return [
      block.frame
        ? { text: block.text, frame: block.frame }
        : { text: block.text },
    ];
  });

/** One OCR line as a compact `{t,x,y,w,h}` record — the geometry the parser ranks on. */
const lineGeometry = (
  line: OcrTextLine,
): { t: string; x?: number; y?: number; w?: number; h?: number } => {
  const frame = line.frame;
  if (!frame) {
    return { t: line.text };
  }
  return {
    t: line.text,
    x: Math.round(frame.x),
    y: Math.round(frame.y),
    w: Math.round(frame.width),
    h: Math.round(frame.height),
  };
};

/** Render one recognition pass as a human-readable diagnostics block. Pure. */
export const formatRecognitionDiagnostics = (
  diagnostics: RecognitionDiagnostics,
): string => {
  const { ocr, source, result } = diagnostics;
  const candidates =
    result.candidates.length > 0
      ? result.candidates.map(candidateLine)
      : ['  (none)'];
  // Per-line frames (top-left x,y + w,h) as JSON — the version selection anchors on
  // these, so dumping them makes a misparse diagnosable without a screenshot.
  const lines = JSON.stringify(ocrLines(ocr).map(lineGeometry));
  return [
    '[recognition] raw OCR text:',
    ocr.text.length > 0 ? ocr.text : '(empty)',
    `[recognition] parsed source: ${JSON.stringify(source)}`,
    `[recognition] OCR lines (JSON): ${lines}`,
    '[recognition] ranked candidates:',
    ...candidates,
  ].join('\n');
};

// --- Dev overlay sink --------------------------------------------------------
// On a bundled device build with no debugger attached, console.log has nowhere to
// surface — so the dev overlay (RecognitionDiagnosticsOverlay) reads the latest
// block from here instead. useSyncExternalStore-compatible: subscribe(onChange)
// returns an unsubscribe, getLastRecognitionDiagnostics() is the snapshot. A
// bounded session history is also kept so every capture can be exported (shared)
// at once — screenshotting each read is tedious.
let lastBlock: string | undefined;
const history: string[] = [];
/** Cap the exportable history so a long session can't grow without bound. */
const MAX_HISTORY = 30;
/** Divider between captures in the exported history. */
const HISTORY_DIVIDER = '\n\n────────────────────────────\n\n';
const listeners = new Set<() => void>();

/** The latest formatted diagnostics block, or undefined before the first scan. */
export const getLastRecognitionDiagnostics = (): string | undefined =>
  lastBlock;

/**
 * Every diagnostics block captured this session (oldest → newest, capped),
 * joined into one string for off-device export (the overlay's Share button).
 * Empty before the first scan; resets on app relaunch (module state).
 */
export const getRecognitionDiagnosticsHistory = (): string =>
  history.join(HISTORY_DIVIDER);

/** Subscribe to diagnostics updates; returns an unsubscribe. */
export const subscribeRecognitionDiagnostics = (
  onChange: () => void,
): (() => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

/** Log + publish the diagnostics block — only when `DEBUG_RECOGNITION` is set. */
export const logRecognitionDiagnostics = (
  diagnostics: RecognitionDiagnostics,
): void => {
  if (!shouldLogRecognitionDiagnostics()) {
    return;
  }
  const block = formatRecognitionDiagnostics(diagnostics);
  console.log(block);
  // Publish to the on-screen overlay (the only channel a bundled, debugger-less
  // device build can actually show), and append to the exportable history.
  lastBlock = block;
  history.push(block);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  listeners.forEach(listener => listener());
};
