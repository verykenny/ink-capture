/**
 * ManualAddScreen — rendered over a fake AppServicesProvider with a custom-card
 * repository stub and mocked navigation/route. Covers: name is required (empty
 * submit surfaces validation and never creates), and a valid submit mints the
 * custom card (trimming + optional fields) and routes to the one Confirm sheet.
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
import { ManualAddScreen } from '@ui/scan/ManualAddScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import type { CustomCardRepository } from '@services';
import type { Card } from '@domain';

type Props = NativeStackScreenProps<RootStackParamList, 'ManualAdd'>;

const CREATED: Card = {
  id: 'manual:1',
  name: 'Homemade Hero',
  setCode: '',
  collectorNumber: '',
  rarity: '',
  availableFinishes: ['normal', 'foil'],
};

const buildServices = (create: CustomCardRepository['create']): AppServices => {
  const customCards: CustomCardRepository = {
    create,
    getAll: async () => [],
    getById: async () => null,
  };
  return { customCards } as unknown as AppServices;
};

const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
const route = {
  key: 'ManualAdd-1',
  name: 'ManualAdd',
  params: undefined,
} as unknown as Props['route'];

const renderScreen = (services: AppServices) =>
  render(
    <AppServicesProvider services={services}>
      <ManualAddScreen navigation={navigation} route={route} />
    </AppServicesProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('requires a name — an empty submit surfaces validation and never creates', () => {
  const create = jest.fn();
  renderScreen(buildServices(create));

  fireEvent.press(screen.getByText('Add card'));

  expect(create).not.toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
  expect(screen.getByText(/name must be a non-empty/i)).toBeOnTheScreen();
});

test('mints the custom card (trimmed, optional fields) and routes to Confirm', async () => {
  const create = jest.fn(async () => CREATED);
  renderScreen(buildServices(create));

  fireEvent.changeText(screen.getByLabelText('Card name'), '  Homemade Hero  ');
  fireEvent.changeText(screen.getByLabelText('Set'), 'XXX');
  fireEvent.changeText(screen.getByLabelText('Collector number'), '7');
  fireEvent.press(screen.getByText('Add card'));

  await waitFor(() =>
    expect(create).toHaveBeenCalledWith({
      name: 'Homemade Hero',
      version: undefined,
      setCode: 'XXX',
      collectorNumber: '7',
    }),
  );
  // Reuses the one Confirm→save flow with the minted card.
  expect(navigation.navigate).toHaveBeenCalledWith('Confirm', {
    card: CREATED,
  });
});

test('re-enables the Add button after a successful create (a back-out can retry)', async () => {
  const create = jest.fn(async () => CREATED);
  renderScreen(buildServices(create));

  fireEvent.changeText(screen.getByLabelText('Card name'), 'Homemade Hero');
  fireEvent.press(screen.getByText('Add card'));

  await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
  // The screen stays in the stack (it navigates forward), so the button must
  // not be left permanently disabled.
  await waitFor(() => expect(screen.getByLabelText('Add card')).toBeEnabled());

  // A second create can be triggered (e.g. after backing out to fix the name).
  fireEvent.press(screen.getByText('Add card'));
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
});
