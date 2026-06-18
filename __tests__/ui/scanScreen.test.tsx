/**
 * ScanScreen — rendered directly over a fake AppServicesProvider with a mock
 * recognizer and mocked navigation/route. The global jest mock for
 * react-native-vision-camera grants permission and reports no device, so the
 * Capture control renders (capture works with the stub even without a camera).
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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScanScreen } from '@ui/scan/ScanScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import type { CardRecognizer } from '@services';
import type { RecognitionResult } from '@domain';
import { CARD_ELSA } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

const RESULT: RecognitionResult = {
  candidates: [{ card: CARD_ELSA, confidence: 1 }],
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

afterEach(() => {
  jest.clearAllMocks();
});

test('renders the Capture control when permission is granted', () => {
  renderScreen(jest.fn(async () => RESULT));
  expect(screen.getByText('Capture')).toBeOnTheScreen();
});

test('Capture runs the recognizer and pushes Confirm with the result', async () => {
  const recognize = jest.fn(async () => RESULT);
  renderScreen(recognize);

  fireEvent.press(screen.getByText('Capture'));

  await waitFor(() =>
    expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
      result: RESULT,
    }),
  );
  expect(recognize).toHaveBeenCalledWith({ uri: 'capture://stub' });
});
