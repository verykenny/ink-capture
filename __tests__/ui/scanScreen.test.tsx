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
import { CARD_ELSA } from '../fixtures/cards';

// The captured still's on-disk path the mock camera reports; ScanScreen prefixes
// `file://` for the recognizer and unlinks the bare path for cleanup.
const CAPTURE_PATH = '/data/tmp/inkcapture-capture.jpg';

const mockTakePhoto = jest.fn(async () => ({ path: CAPTURE_PATH }));
let mockDevice: unknown = { id: 'back-camera' };
let mockHasPermission = true;

jest.mock('react-native-vision-camera', () => {
  const ReactLib = require('react');
  return {
    Camera: ReactLib.forwardRef((_props: unknown, ref: unknown) => {
      ReactLib.useImperativeHandle(ref, () => ({ takePhoto: mockTakePhoto }));
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
  mockDevice = { id: 'back-camera' };
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
      result: RESULT,
    }),
  );
  expect(mockTakePhoto).toHaveBeenCalledTimes(1);
  // The recognizer receives the captured file as a file:// URI...
  expect(recognize).toHaveBeenCalledWith({ uri: `file://${CAPTURE_PATH}` });
  // ...and the temp still is unlinked afterwards (bare path, no file://).
  await waitFor(() => expect(unlink).toHaveBeenCalledWith(CAPTURE_PATH));
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
