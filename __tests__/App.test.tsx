/**
 * App smoke test — boots the real composition through the startup loading gate
 * with FAKE services injected via the `services` prop: a hand catalog (no
 * network), the real persistence/repository/store over a TestSqliteDatabase
 * (node:sqlite, no native), and an empty stub recognizer. Proves the gate
 * resolves and the navigator mounts to the initial Collection screen.
 *
 * @format
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import App from '../src/app/App';
import { createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  StubCardRecognizer,
  createCollectionRepository,
  createCustomCardRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService } from '@services';
import { TestSqliteDatabase } from './persistence/testDatabase';
import { CARD_ELSA } from './fixtures/cards';

const makeFakeServices = (
  catalogOverrides: Partial<CatalogService> = {},
): AppServices => {
  const db = new TestSqliteDatabase();
  const persistence = createPersistenceService(db); // the init store runs init()
  const repo = createCollectionRepository(db);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA], // a cached catalog → boots straight through
    findByCollectorNumber: async () => null,
    ...catalogOverrides,
  };
  return {
    persistence,
    repo,
    catalog,
    customCards: createCustomCardRepository(db),
    recognizer: new StubCardRecognizer({ candidates: [] }),
    collectionStore: createCollectionStore(repo),
  };
};

test('boots through the loading gate to the Collection screen', async () => {
  render(<App services={makeFakeServices()} />);
  // The injected repository is empty, so the Collection screen shows its empty state.
  expect(await screen.findByText('No cards yet.')).toBeOnTheScreen();
});

test('first run with no cached catalog shows the indeterminate setup message', async () => {
  render(
    <App
      services={makeFakeServices({
        getAllCards: async () => [], // no local cache → first-run download
        sync: () => new Promise<never>(() => {}), // network in flight, never settles
      })}
    />,
  );
  expect(
    await screen.findByText('Setting up the card catalog… (first run only)'),
  ).toBeOnTheScreen();
  // The app is gated while downloading — the Collection screen is not mounted yet.
  expect(screen.queryByText('No cards yet.')).toBeNull();
});

test('offline first run shows the setup-needed gate, and Retry recovers to the Collection', async () => {
  // No local cache; the first-run download fails once (offline) then succeeds —
  // exactly the airplane-mode-then-reconnect path.
  const sync = jest.fn(async () => ({ updated: true }));
  sync.mockRejectedValueOnce(new Error('offline'));
  render(
    <App
      services={makeFakeServices({
        getAllCards: async () => [], // no cache to fall back to
        sync,
      })}
    />,
  );

  // The setup-needed gate, never a spinner-forever or a crash.
  expect(
    await screen.findByText(
      'Couldn’t download the card catalog. Check your connection and try again.',
    ),
  ).toBeOnTheScreen();

  // Retry re-runs startup; sync now resolves → ready → the (empty) Collection.
  fireEvent.press(screen.getByText('Retry'));

  expect(await screen.findByText('No cards yet.')).toBeOnTheScreen();
  expect(sync).toHaveBeenCalledTimes(2); // the failed attempt, then the retry
});
