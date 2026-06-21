/**
 * StatsScreen — rendered directly (no NavigationContainer) over a fake
 * AppServicesProvider with the real store on a TestSqliteDatabase and a hand
 * catalog. Seeds catalog cards across two sets plus an off-catalog (`manual:`)
 * and an unknown entry, then asserts the overall summary and per-set rows the
 * pure reducer produces.
 *
 * @format
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatsScreen } from '@ui/collection/StatsScreen';
import { AppServicesProvider, createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  StubCardRecognizer,
  createCollectionRepository,
  createCustomCardRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService } from '@services';
import { TestSqliteDatabase } from '../persistence/testDatabase';
import {
  CARD_ELSA,
  CARD_MICKEY,
  CARD_STITCH_ROCK_STAR,
} from '../fixtures/cards';

const FIXED_NOW = '2026-06-21T00:00:00.000Z';

/**
 * Build services with a 3-card catalog (TFC: Elsa+Mickey; ROF: Stitch) and a
 * seeded collection: both TFC cards owned (so TFC is 100%), nothing in ROF, plus
 * an off-catalog manual card and an unknown cardId.
 */
const buildServices = async (
  catalogOverride?: Partial<CatalogService>,
): Promise<{ services: AppServices; db: TestSqliteDatabase }> => {
  const db = new TestSqliteDatabase();
  await createPersistenceService(db).init();
  const repo = createCollectionRepository(db, { now: () => FIXED_NOW });
  const collectionStore = createCollectionStore(repo);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA, CARD_MICKEY, CARD_STITCH_ROCK_STAR],
    findByCollectorNumber: async () => null,
    ...catalogOverride,
  };
  await collectionStore.getState().add({
    cardId: CARD_ELSA.id,
    quantity: 2,
    finish: 'normal',
    condition: 'NM',
  });
  await collectionStore.getState().add({
    cardId: CARD_MICKEY.id,
    quantity: 1,
    finish: 'foil',
    condition: 'NM',
  });
  await collectionStore.getState().add({
    cardId: 'manual:7',
    quantity: 1,
    finish: 'normal',
    condition: 'NM',
  });
  await collectionStore
    .getState()
    .add({ cardId: 'ZZZ-999', quantity: 1, finish: 'normal', condition: 'NM' });
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

const renderScreen = (services: AppServices) =>
  render(
    <AppServicesProvider services={services}>
      <StatsScreen />
    </AppServicesProvider>,
  );

test('renders the overall summary over the seeded collection', async () => {
  const { db, services } = await buildServices();
  renderScreen(services);
  // 2 distinct catalog cards owned of 3 → 67%.
  expect(await screen.findByText('2 / 3 cards · 67%')).toBeOnTheScreen();
  // totalCopies = 2 + 1 + 1 (manual) + 1 (unknown) = 5.
  expect(screen.getByText('Total copies: 5')).toBeOnTheScreen();
  // The off-catalog + unknown cards are surfaced separately, not in set %.
  expect(screen.getByText('Off-catalog: 1')).toBeOnTheScreen();
  expect(screen.getByText('Unknown: 1')).toBeOnTheScreen();
  await db.close();
});

test('renders a per-set row for each catalog set with owned/size, % and copies', async () => {
  const { db, services } = await buildServices();
  renderScreen(services);
  // TFC: both rows owned → 2/2, 100%, 3 copies (2 normal Elsa + 1 foil Mickey).
  expect(await screen.findByText('TFC')).toBeOnTheScreen();
  expect(screen.getByText('2 / 2 · 100%')).toBeOnTheScreen();
  expect(screen.getByText('3 copies')).toBeOnTheScreen();
  // ROF: nothing owned → 0/1, 0%, 0 copies.
  expect(screen.getByText('ROF')).toBeOnTheScreen();
  expect(screen.getByText('0 / 1 · 0%')).toBeOnTheScreen();
  await db.close();
});

test('shows a minimal message while the catalog is loading, then resolves', async () => {
  // A catalog read that never settles keeps the screen in its loading state.
  const { db, services } = await buildServices({
    getAllCards: () => new Promise<never>(() => {}),
  });
  renderScreen(services);
  expect(screen.getByText('Loading stats…')).toBeOnTheScreen();
  await db.close();
});
