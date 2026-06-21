/**
 * RecognitionDiagnosticsOverlay — the dev-only, flag-gated on-screen readout.
 *
 * Renders nothing unless DEBUG_RECOGNITION is set (mocked empty in Jest, so OFF by
 * default). When on, it shows the latest scan block from the recognitionDiagnostics
 * sink and collapses on tap. IP guardrail: hand-authored fixtures only.
 *
 * @format
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Config from 'react-native-config';
import { RecognitionDiagnosticsOverlay } from '@ui/dev/RecognitionDiagnosticsOverlay';
import { logRecognitionDiagnostics } from '@services';
import type { RecognitionResult } from '@domain';
import { CARD_BILLY_BONES, CARD_BOUN } from '../fixtures/cards';

type MutableConfig = Record<string, string | undefined>;

const DIAG = {
  ocr: { text: 'BOUN\n104/204', blocks: [] },
  source: { collectorNumber: '104', name: 'boun' },
  result: {
    candidates: [
      { card: CARD_BILLY_BONES, confidence: 0.26 },
      { card: CARD_BOUN, confidence: 0.24 },
    ],
  } as RecognitionResult,
};

const enableFlag = () => {
  (Config as MutableConfig).DEBUG_RECOGNITION = 'true';
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  delete (Config as MutableConfig).DEBUG_RECOGNITION;
});

test('renders nothing when DEBUG_RECOGNITION is off', () => {
  render(<RecognitionDiagnosticsOverlay />);
  expect(screen.queryByLabelText('Recognition diagnostics')).toBeNull();
});

test('shows the latest scan block (the Boun case) on-screen when the flag is on', () => {
  enableFlag();
  logRecognitionDiagnostics(DIAG); // populate the sink
  render(<RecognitionDiagnosticsOverlay />);

  expect(screen.getByLabelText('Recognition diagnostics')).toBeOnTheScreen();
  // The whole formatted block renders verbatim — raw OCR + ranked candidates.
  expect(screen.getByText(/raw OCR text/)).toBeOnTheScreen();
  expect(
    screen.getByText(/Billy Bones — Ship Steward \(TFC #104\) 26%/),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(/Boun — Tireless Boatman \(URR #104\) 24%/),
  ).toBeOnTheScreen();
});

test('tapping collapses the readout', () => {
  enableFlag();
  logRecognitionDiagnostics(DIAG);
  render(<RecognitionDiagnosticsOverlay />);

  fireEvent.press(screen.getByLabelText('Recognition diagnostics'));

  expect(screen.getByText(/recognition diagnostics \(tap\)/)).toBeOnTheScreen();
  expect(screen.queryByText(/raw OCR text/)).toBeNull();
});
