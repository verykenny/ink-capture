/**
 * EditEntryScreen — rendered over a fake AppServicesProvider with the REAL store
 * on a TestSqliteDatabase (so edits/removes genuinely persist through the
 * repository) plus catalog/custom-card stubs for the title lookup, with mocked
 * navigation/route. Covers: prefill from the entry, an in-place edit of
 * finish/condition/quantity, a finish change that MERGES into another stack
 * (integration over the real repo+store), and the two-step remove (confirm /
 * cancel).
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
import { EditEntryScreen } from '@ui/collection/EditEntryScreen';
import type { RootStackParamList } from '@ui/navigationTypes';
import { AppServicesProvider, createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService, CustomCardRepository } from '@services';
import type { CollectionEntry } from '@domain';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import { CARD_ELSA, newEntry } from '../fixtures/cards';

type Props = NativeStackScreenProps<RootStackParamList, 'EditEntry'>;

const FIXED_NOW = '2026-06-21T00:00:00.000Z';

const buildServices = async (): Promise<{
  services: AppServices;
  db: TestSqliteDatabase;
  store: ReturnType<typeof createCollectionStore>;
}> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  const store = createCollectionStore(repo);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA],
    findByCollectorNumber: async () => null,
  };
  const customCards: CustomCardRepository = {
    create: async () => CARD_ELSA,
    getAll: async () => [],
    getById: async () => null,
  };
  const services = {
    collectionStore: store,
    catalog,
    customCards,
  } as unknown as AppServices;
  return { services, db, store };
};

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
} as unknown as Props['navigation'];

const routeFor = (entryId: string) =>
  ({
    key: 'EditEntry-1',
    name: 'EditEntry',
    params: { entryId },
  } as unknown as Props['route']);

const renderScreen = (services: AppServices, entryId: string) =>
  render(
    <AppServicesProvider services={services}>
      <EditEntryScreen navigation={navigation} route={routeFor(entryId)} />
    </AppServicesProvider>,
  );

/** Add an entry through the store (populating store.entries) and return it. */
const seed = (
  store: ReturnType<typeof createCollectionStore>,
  overrides: Parameters<typeof newEntry>[0] = {},
): Promise<CollectionEntry> => store.getState().add(newEntry(overrides));

afterEach(() => {
  jest.clearAllMocks();
});

test('prefills from the entry and saves the unchanged values in place', async () => {
  const { db, services, store } = await buildServices();
  const entry = await seed(store, {
    finish: 'foil',
    condition: 'LP',
    quantity: 3,
  });

  renderScreen(services, entry.id);
  // Settle the async title lookup, and prove the quantity prefilled.
  await screen.findByText('Elsa — Snow Queen');
  expect(screen.getByText('3')).toBeOnTheScreen();

  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

  const { entries } = store.getState();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    finish: 'foil',
    condition: 'LP',
    quantity: 3,
  });
  await db.close();
});

test('edits finish/condition/quantity and the list reflects the update', async () => {
  const { db, services, store } = await buildServices();
  const entry = await seed(store, {
    finish: 'normal',
    condition: 'NM',
    quantity: 1,
  });

  renderScreen(services, entry.id);
  await screen.findByText('Elsa — Snow Queen');

  fireEvent.press(screen.getByText('foil')); // finish
  fireEvent.press(screen.getByText('LP')); // condition
  fireEvent.press(screen.getByLabelText('Increase quantity')); // 1 → 2

  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

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

test('an edit that collides with another stack MERGES (one row, summed quantity)', async () => {
  const { db, services, store } = await buildServices();
  const normal = await seed(store, { finish: 'normal', quantity: 2 });
  await seed(store, { finish: 'foil', quantity: 3 });

  renderScreen(services, normal.id);
  await screen.findByText('Elsa — Snow Queen');

  fireEvent.press(screen.getByText('foil')); // move the normal stack onto foil
  fireEvent.press(screen.getByText('Save changes'));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());

  const { entries } = store.getState();
  expect(entries).toHaveLength(1); // merged, not a duplicate
  expect(entries[0].quantity).toBe(5); // 3 + 2
  await db.close();
});

test('remove → confirm deletes the entry and pops back', async () => {
  const { db, services, store } = await buildServices();
  const entry = await seed(store, { quantity: 1 });

  renderScreen(services, entry.id);
  await screen.findByText('Elsa — Snow Queen');

  fireEvent.press(screen.getByText('Remove from collection'));
  // The confirm step appears before anything is deleted.
  fireEvent.press(screen.getByText('Yes, remove'));

  await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
  expect(store.getState().entries).toEqual([]);
  await db.close();
});

test('remove can be cancelled — the entry survives', async () => {
  const { db, services, store } = await buildServices();
  const entry = await seed(store, { quantity: 1 });

  renderScreen(services, entry.id);
  await screen.findByText('Elsa — Snow Queen');

  fireEvent.press(screen.getByText('Remove from collection'));
  fireEvent.press(screen.getByText('Cancel'));

  expect(screen.queryByText('Yes, remove')).toBeNull();
  expect(store.getState().entries).toHaveLength(1);
  await db.close();
});
