/**
 * CollectionListScreen — rendered directly (no NavigationContainer) over a fake
 * AppServicesProvider with the real store on a TestSqliteDatabase and a hand
 * catalog. Mocked navigation/route props. Covers the empty state, a seeded row
 * (name resolved via the catalog), and the Scan CTA.
 *
 * @format
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CollectionListScreen } from '@ui/collection/CollectionListScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider, createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  StubCardRecognizer,
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService } from '@services';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA, newEntry } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'Collection'>;

const FIXED_NOW = '2026-06-18T00:00:00.000Z';

const buildServices = async (
  seed: boolean,
): Promise<{ services: AppServices; db: TestSqliteDatabase }> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  const collectionStore = createCollectionStore(repo);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA],
    findByCollectorNumber: async () => null,
  };
  if (seed) {
    await collectionStore.getState().add(newEntry({ quantity: 2 }));
  }
  const services: AppServices = {
    persistence: createPersistenceService(db),
    repo,
    catalog,
    recognizer: new StubCardRecognizer({ candidates: [] }),
    collectionStore,
  };
  return { services, db };
};

const navigation = { navigate: jest.fn() } as unknown as Props['navigation'];
const route = {
  key: 'Collection-1',
  name: 'Collection',
  params: undefined,
} as unknown as Props['route'];

const renderScreen = (services: AppServices) =>
  render(
    <AppServicesProvider services={services}>
      <CollectionListScreen navigation={navigation} route={route} />
    </AppServicesProvider>,
  );

afterEach(() => {
  jest.clearAllMocks();
});

test('shows the full empty state (title + hint) when the collection is empty', async () => {
  const { db, services } = await buildServices(false);
  renderScreen(services);
  // The empty collection reads as an intentional, friendly state — title plus
  // the hint that points at the same Scan CTA. Locked against regression so the
  // empty path never degrades to a blank screen.
  // findBy flushes the async catalog lookup (useCardLookup) inside act().
  expect(await screen.findByText('No cards yet.')).toBeOnTheScreen();
  expect(
    screen.getByText('Scan a card to start your collection.'),
  ).toBeOnTheScreen();
  await db.close();
});

test('renders a stored entry with its resolved card name, finish/condition, and quantity', async () => {
  const { db, services } = await buildServices(true);
  renderScreen(services);
  // Name resolves asynchronously via the catalog lookup.
  expect(await screen.findByText('Elsa — Snow Queen')).toBeOnTheScreen();
  expect(screen.getByText('normal · NM')).toBeOnTheScreen();
  expect(screen.getByText('×2')).toBeOnTheScreen();
  // FlatList's VirtualizedList schedules a deferred cell-render via a ~50ms
  // timer; flush it inside act() so it doesn't fire after teardown.
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  await db.close();
});

test('the Scan CTA navigates to the Scan route', async () => {
  const { db, services } = await buildServices(false);
  renderScreen(services);
  // findBy settles the async catalog lookup before we assert/press.
  fireEvent.press(await screen.findByText('Scan a card'));
  expect(navigation.navigate).toHaveBeenCalledWith('Scan');
  await db.close();
});
