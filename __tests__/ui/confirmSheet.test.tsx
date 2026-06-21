/**
 * ConfirmSheet — rendered directly over a fake AppServicesProvider with the REAL
 * store on a TestSqliteDatabase (so Add genuinely persists through the
 * repository) and mocked navigation/route. It now takes a chosen `{ card;
 * confidence? }` (D2 decoupled it from RecognitionResult), so this covers: the
 * card display, that every FINISHES/CONDITIONS option renders, the confidence
 * hint when present and its absence when omitted, that Add saves the selected
 * entry and pops to top, that a low confidence never gates Save, and the
 * card's-first-finish default.
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
import type { AppServices, CollectionStore } from '@state';
import {
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import { CONDITIONS, FINISHES } from '@domain';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA, CARD_ELSA_ENCHANTED } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'Confirm'>;
type ConfirmParams = RootStackParamList['Confirm'];

const FIXED_NOW = '2026-06-18T00:00:00.000Z';

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

const routeFor = (params: ConfirmParams) =>
  ({
    key: 'Confirm-1',
    name: 'Confirm',
    params,
  } as unknown as Props['route']);

const renderSheet = (services: AppServices, params: ConfirmParams) =>
  render(
    <AppServicesProvider services={services}>
      <ConfirmSheet navigation={navigation} route={routeFor(params)} />
    </AppServicesProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('shows the chosen card, every finish/condition option, and the confidence hint', async () => {
  const { db, services } = await buildServices();
  renderSheet(services, { card: CARD_ELSA, confidence: 1 });

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

test('omits the confidence hint when no confidence is supplied (manual pick / search)', async () => {
  const { db, services } = await buildServices();
  renderSheet(services, { card: CARD_ELSA });

  expect(screen.getByText('Elsa — Snow Queen')).toBeOnTheScreen();
  expect(screen.queryByText(/% match/)).toBeNull();
  // Save still works without a confidence.
  expect(screen.getByText('Add to collection')).toBeOnTheScreen();
  await db.close();
});

test('Add saves the selected finish/condition/quantity and pops to the list', async () => {
  const { db, services, store } = await buildServices();
  renderSheet(services, { card: CARD_ELSA, confidence: 1 });

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

test('Save is never gated by confidence — a low-confidence card still saves', async () => {
  const { db, services, store } = await buildServices();
  renderSheet(services, { card: CARD_ELSA, confidence: 0.05 });

  expect(screen.getByText('5% match')).toBeOnTheScreen();
  fireEvent.press(screen.getByText('Add to collection'));

  await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
  expect(store.getState().entries).toHaveLength(1);
  await db.close();
});

test('defaults the finish to the card’s first availableFinishes (not FINISHES[0])', async () => {
  const { db, services, store } = await buildServices();
  // CARD_ELSA_ENCHANTED is foil-only, so the default finish must be 'foil' — which
  // distinguishes availableFinishes[0] from FINISHES[0] ('normal').
  renderSheet(services, { card: CARD_ELSA_ENCHANTED });

  // Press Add without touching any picker — exercise the documented defaults.
  fireEvent.press(screen.getByText('Add to collection'));

  await waitFor(() => expect(navigation.popToTop).toHaveBeenCalled());
  expect(store.getState().entries[0]).toMatchObject({
    cardId: 'TFC-204',
    finish: 'foil',
    condition: 'NM',
    quantity: 1,
  });
  await db.close();
});

test('a rejected save stays on the sheet and re-enables Add (no popToTop)', async () => {
  const add = jest.fn(() => Promise.reject(new Error('save failed')));
  const collectionStore = {
    getState: () => ({ add }),
  } as unknown as CollectionStore;
  const services = { collectionStore } as unknown as AppServices;

  renderSheet(services, { card: CARD_ELSA, confidence: 1 });
  fireEvent.press(screen.getByLabelText('Add to collection'));

  await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
  // The save failed: do not navigate, and re-enable the button for a retry.
  expect(navigation.popToTop).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByLabelText('Add to collection')).toBeEnabled(),
  );
});
