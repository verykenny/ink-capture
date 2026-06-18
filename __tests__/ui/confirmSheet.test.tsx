/**
 * ConfirmSheet — rendered directly over a fake AppServicesProvider with the REAL
 * store on a TestSqliteDatabase (so Add genuinely persists through the
 * repository) and mocked navigation/route. Covers the candidate display, that
 * every FINISHES/CONDITIONS option renders, that Add saves the selected entry
 * and pops to top, that a low confidence never gates Save, and the no-match
 * branch.
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
import { ConfirmSheet } from '@ui/scan/ConfirmSheet';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider, createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import { CONDITIONS, FINISHES } from '@domain';
import type { RecognitionResult } from '@domain';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirm'>;

const FIXED_NOW = '2026-06-18T00:00:00.000Z';

const ELSA_RESULT: RecognitionResult = {
  candidates: [{ card: CARD_ELSA, confidence: 1 }],
};

const buildServices = async (): Promise<{
  services: AppServices;
  db: TestSqliteDatabase;
  store: ReturnType<typeof createCollectionStore>;
}> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  const store = createCollectionStore(repo);
  // ConfirmSheet only consumes collectionStore.
  const services = { collectionStore: store } as unknown as AppServices;
  return { services, db, store };
};

const navigation = {
  popToTop: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
} as unknown as Props['navigation'];

const routeFor = (result: RecognitionResult) =>
  ({
    key: 'Confirm-1',
    name: 'Confirm',
    params: { result },
  } as unknown as Props['route']);

const renderSheet = (services: AppServices, result: RecognitionResult) =>
  render(
    <AppServicesProvider services={services}>
      <ConfirmSheet navigation={navigation} route={routeFor(result)} />
    </AppServicesProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('shows the top candidate, every finish/condition option, and the confidence hint', async () => {
  const { db, services } = await buildServices();
  renderSheet(services, ELSA_RESULT);

  expect(screen.getByText('Elsa — Snow Queen')).toBeOnTheScreen();
  expect(screen.getByText('TFC · #042 · Legendary')).toBeOnTheScreen();
  expect(screen.getByText('100% match')).toBeOnTheScreen();

  for (const finish of FINISHES) {
    expect(screen.getByText(finish)).toBeOnTheScreen();
  }
  for (const condition of CONDITIONS) {
    expect(screen.getByText(condition)).toBeOnTheScreen();
  }
  await db.close();
});

test('Add saves the selected finish/condition/quantity and pops to the list', async () => {
  const { db, services, store } = await buildServices();
  renderSheet(services, ELSA_RESULT);

  fireEvent.press(screen.getByText('foil'));
  fireEvent.press(screen.getByText('LP'));
  fireEvent.press(screen.getByLabelText('Increase quantity')); // 1 → 2

  fireEvent.press(screen.getByText('Add to collection'));

  await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());

  const { entries } = store.getState();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    cardId: 'TFC-042',
    finish: 'foil',
    condition: 'LP',
    quantity: 2,
  });
  await db.close();
});

test('Save is never gated by confidence — a low-confidence candidate still saves', async () => {
  const { db, services, store } = await buildServices();
  renderSheet(services, {
    candidates: [{ card: CARD_ELSA, confidence: 0.05 }],
  });

  expect(screen.getByText('5% match')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Add to collection'));

  await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
  expect(store.getState().entries).toHaveLength(1);
  await db.close();
});

test('an empty candidate list shows the no-match branch with no save control', async () => {
  const { db, services } = await buildServices();
  renderSheet(services, { candidates: [] });

  expect(screen.getByText('No match found.')).toBeOnTheScreen();
  expect(screen.queryByText('Add to collection')).toBeNull();
  await db.close();
});
