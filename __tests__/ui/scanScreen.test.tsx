/**
 * ScanScreen — rendered over a fake AppServicesProvider with a mock recognizer
 * and mocked navigation/route.
 *
 * This file replaces the global react-native-vision-camera mock with a richer
 * one: a forwardRef Camera that exposes `takePhoto` and a configurable device,
 * so Capture can drive the real takePhoto → recognize → navigate → cleanup path.
 * The captured-still cleanup is asserted via the mocked RNFS `unlink`.
 *
 * @format
 */

import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { unlink } from '@dr.pogodin/react-native-fs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanScreen } from '@ui/scan/ScanScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import type { CardRecognizer } from '@services';
import type { RecognitionResult } from '@domain';
import {
  CARD_BILLY_BONES,
  CARD_BOUN,
  CARD_ELSA,
  CARD_MICKEY,
} from '../fixtures/cards';

// The captured still's on-disk path the mock camera reports; ScanScreen prefixes
// `file://` for the recognizer and unlinks the bare path for cleanup.
const CAPTURE_PATH = '/data/tmp/inkcapture-capture.jpg';

const mockTakePhoto = jest.fn(async () => ({ path: CAPTURE_PATH }));
const mockFocus = jest.fn(async () => undefined);
let mockDevice: unknown = { id: 'back-camera', supportsFocus: true };
let mockHasPermission = true;

jest.mock('react-native-vision-camera', () => {
  const ReactLib = require('react');
  return {
    Camera: ReactLib.forwardRef((_props: unknown, ref: unknown) => {
      ReactLib.useImperativeHandle(ref, () => ({
        takePhoto: mockTakePhoto,
        focus: mockFocus,
      }));
      return null;
    }),
    useCameraDevice: () => mockDevice,
    useCameraPermission: () => ({
      hasPermission: mockHasPermission,
      requestPermission: jest.fn(async () => mockHasPermission),
    }),
  };
});

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

const RESULT: RecognitionResult = {
  candidates: [{ card: CARD_ELSA, confidence: 1 }],
  source: { collectorNumber: '42', name: 'Elsa Snow Queen' },
};

const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
const route = {
  key: 'Scan-1',
  name: 'Scan',
  params: undefined,
} as unknown as Props['route'];

// ScanScreen only consumes `recognizer`, so the rest of the graph is unneeded.
const buildServices = (recognize: CardRecognizer['recognize']): AppServices =>
  ({ recognizer: { recognize } } as unknown as AppServices);

const renderScreen = (recognize: CardRecognizer['recognize']) =>
  render(
    <AppServicesProvider services={buildServices(recognize)}>
      <ScanScreen navigation={navigation} route={route} />
    </AppServicesProvider>,
  );

beforeEach(() => {
  mockDevice = { id: 'back-camera', supportsFocus: true };
  mockHasPermission = true;
});

afterEach(() => {
  jest.clearAllMocks();
});

test('renders the Capture control when permission is granted and a device exists', () => {
  renderScreen(jest.fn(async () => RESULT));
  expect(screen.getByText('Capture')).toBeOnTheScreen();
});

test('Capture takes a still, recognizes it, navigates to Confirm, and deletes the still', async () => {
  const recognize = jest.fn(async () => RESULT);
  renderScreen(recognize);

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
      card: CARD_ELSA,
      confidence: 1,
    }),
  );
  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  // The recognizer receives the captured file as a file:// URI...
  expect(recognize).toHaveBeenCalledWith({ uri: `file://${CAPTURE_PATH}` });
  // ...and the temp still is unlinked afterwards (bare path, no file://).
  await waitFor(() => expect(unlink).toHaveBeenCalledWith(CAPTURE_PATH));
});

test('an ambiguous read (the Boun #104 case) routes to CardSearch seeded with the top-N', async () => {
  // Two same-number cards, top at a weak ~0.26 — below the floor: never assert
  // the wrong #1, route to a manual pick with both candidates on offer.
  const ambiguous: RecognitionResult = {
    candidates: [
      { card: CARD_BILLY_BONES, confidence: 0.26 },
      { card: CARD_BOUN, confidence: 0.24 },
    ],
    source: { collectorNumber: '104', name: 'boun' },
  };
  renderScreen(jest.fn(async () => ambiguous));

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('CardSearch', {
      seed: ambiguous.candidates,
    }),
  );
  expect(navigation.navigate).not.toHaveBeenCalledWith(
    'Confirm',
    expect.anything(),
  );
  await waitFor(() => expect(unlink).toHaveBeenCalledWith(CAPTURE_PATH));
});

test('an empty read routes to an empty CardSearch (manual search), not Confirm', async () => {
  renderScreen(jest.fn(async () => ({ candidates: [] })));

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('CardSearch', {}),
  );
  expect(navigation.navigate).not.toHaveBeenCalledWith(
    'Confirm',
    expect.anything(),
  );
});

test('a confident read with a runner-up beaten by the margin routes to Confirm (the policy is consulted, not candidates[0])', async () => {
  // Two candidates above the floor; #1 (0.95) beats #2 (0.4) by > the 0.15
  // margin → confident. Guards the integration-level margin path, not just the
  // degenerate single-candidate case.
  const confident: RecognitionResult = {
    candidates: [
      { card: CARD_ELSA, confidence: 0.95 },
      { card: CARD_MICKEY, confidence: 0.4 },
    ],
  };
  renderScreen(jest.fn(async () => confident));

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
      card: CARD_ELSA,
      confidence: 0.95,
    }),
  );
  expect(navigation.navigate).not.toHaveBeenCalledWith(
    'CardSearch',
    expect.anything(),
  );
});

test('a near-tie of two HIGH candidates (within the margin) routes to CardSearch, not Confirm', async () => {
  // Both above the floor, but #1 (0.95) beats #2 (0.9) by only 0.05 < margin →
  // ambiguous. A confident-but-within-margin read must NOT assert #1.
  const nearTie: RecognitionResult = {
    candidates: [
      { card: CARD_BILLY_BONES, confidence: 0.95 },
      { card: CARD_BOUN, confidence: 0.9 },
    ],
  };
  renderScreen(jest.fn(async () => nearTie));

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('CardSearch', {
      seed: nearTie.candidates,
    }),
  );
  expect(navigation.navigate).not.toHaveBeenCalledWith(
    'Confirm',
    expect.anything(),
  );
});

test('ignores a second Capture while the first is still in flight', async () => {
  const recognize = jest.fn(async () => RESULT);
  renderScreen(recognize);

  const button = screen.getByText('Capture');
  fireEvent.press(button);
  fireEvent.press(button); // rapid double-tap before the first capture resolves

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledTimes(1));
  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  expect(recognize).toHaveBeenCalledTimes(1);
});

test('tap-to-focus: tapping the preview focuses the camera at that point', () => {
  renderScreen(jest.fn(async () => RESULT));

  fireEvent(screen.getByTestId('focusTarget'), 'touchEnd', {
    nativeEvent: { locationX: 120, locationY: 200 },
  });

  expect(mockFocus).toHaveBeenCalledWith({ x: 120, y: 200 });
});

test('autofocuses the centre before capturing once the preview is measured', async () => {
  const recognize = jest.fn(async () => RESULT);
  renderScreen(recognize);

  // The real preview reports its size via onLayout on mount; simulate that so
  // the centre point is known, then capture.
  fireEvent(screen.getByTestId('cameraPreview'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
  });
  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() => expect(navigation.navigate).toHaveBeenCalled());
  expect(mockFocus).toHaveBeenCalledWith({ x: 200, y: 300 });
});

test('still deletes the captured file even when recognition rejects', async () => {
  const recognize = jest.fn(async () => {
    throw new Error('ocr failed');
  });
  renderScreen(recognize);

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() => expect(unlink).toHaveBeenCalledWith(CAPTURE_PATH));
  expect(navigation.navigate).not.toHaveBeenCalled();
});

test('no camera device: shows the simulator message and offers no Capture', () => {
  mockDevice = undefined;
  renderScreen(jest.fn(async () => RESULT));

  expect(screen.getByText(/No camera device found/)).toBeOnTheScreen();
  expect(screen.queryByText('Capture')).toBeNull();
});

test('without permission: shows the permission prompt, not the camera', async () => {
  mockHasPermission = false;
  renderScreen(jest.fn(async () => RESULT));

  expect(
    await screen.findByText('Camera permission is needed to scan cards.'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Capture')).toBeNull();
});
