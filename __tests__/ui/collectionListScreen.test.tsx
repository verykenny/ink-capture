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
  createCustomCardRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService } from '@services';
import type { Card, NewCollectionEntry } from '@domain';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA, CARD_MICKEY, newEntry } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'Collection'>;

const FIXED_NOW = '2026-06-18T00:00:00.000Z';

const buildServices = async (
  opts: { entries?: NewCollectionEntry[]; catalog?: Card[] } = {},
): Promise<{ services: AppServices; db: TestSqliteDatabase }> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  const collectionStore = createCollectionStore(repo);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => opts.catalog ?? [CARD_ELSA],
    findByCollectorNumber: async () => null,
  };
  for (const entry of opts.entries ?? []) {
    await collectionStore.getState().add(entry);
  }
  const services: AppServices = {
    persistence: createPersistenceService(db),
    repo,
    catalog,
    customCards: createCustomCardRepository(db),
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
  const { db, services } = await buildServices();
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
  const { db, services } = await buildServices({
    entries: [newEntry({ quantity: 2 })],
  });
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
  const { db, services } = await buildServices();
  renderScreen(services);
  // findBy settles the async catalog lookup before we assert/press.
  fireEvent.press(await screen.findByText('Scan a card'));
  expect(navigation.navigate).toHaveBeenCalledWith('Scan');
  await db.close();
});

test('tapping a row navigates to EditEntry with that entry’s id', async () => {
  const { db, services } = await buildServices({
    entries: [newEntry({ quantity: 2 })],
  });
  renderScreen(services);
  // The seeded row resolves its name; tapping it opens the edit screen.
  fireEvent.press(await screen.findByText('Elsa — Snow Queen'));
  expect(navigation.navigate).toHaveBeenCalledWith('EditEntry', {
    entryId: expect.any(String),
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  await db.close();
});

test('the search box filters the rendered list in place and keeps row-tap working', async () => {
  const { db, services } = await buildServices({
    entries: [newEntry({ quantity: 2 }), newEntry({ cardId: CARD_MICKEY.id })],
    catalog: [CARD_ELSA, CARD_MICKEY],
  });
  renderScreen(services);
  // Both resolved rows are present before searching.
  expect(await screen.findByText('Elsa — Snow Queen')).toBeOnTheScreen();
  expect(
    screen.getByText('Mickey Mouse — Brave Little Tailor'),
  ).toBeOnTheScreen();

  // Typing a name narrows the list to the matching row.
  fireEvent.changeText(
    screen.getByLabelText('Search your collection'),
    'mickey',
  );
  expect(
    screen.getByText('Mickey Mouse — Brave Little Tailor'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('Elsa — Snow Queen')).toBeNull();

  // Row-tap still routes to EditEntry from the filtered list.
  fireEvent.press(screen.getByText('Mickey Mouse — Brave Little Tailor'));
  expect(navigation.navigate).toHaveBeenCalledWith('EditEntry', {
    entryId: expect.any(String),
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  await db.close();
});

test('a search with no matches shows the no-results state, distinct from the empty collection', async () => {
  const { db, services } = await buildServices({
    entries: [newEntry({ quantity: 2 })],
  });
  renderScreen(services);
  await screen.findByText('Elsa — Snow Queen');

  fireEvent.changeText(
    screen.getByLabelText('Search your collection'),
    'zzzzz',
  );
  // The no-results state, NOT the empty-collection copy.
  expect(screen.getByText('No matches.')).toBeOnTheScreen();
  expect(screen.queryByText('No cards yet.')).toBeNull();
  await db.close();
});
