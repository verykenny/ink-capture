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
import { render, screen } from '@testing-library/react-native';
import App from '../src/app/App';
import { createCollectionStore } from '@state';
import type { AppServices } from '@state';
import {
  StubCardRecognizer,
  createCollectionRepository,
  createPersistenceService,
} from '@services';
import type { CatalogService } from '@services';
import { TestSqliteDatabase } from './persistence/testDatabase';
import { CARD_ELSA } from './fixtures/cards';

const makeFakeServices = (): AppServices => {
  const db = new TestSqliteDatabase();
  const persistence = createPersistenceService(db); // initialize() runs init()
  const repo = createCollectionRepository(db);
  const catalog: CatalogService = {
    sync: async () => ({ updated: false }),
    getAllCards: async () => [CARD_ELSA],
    findByCollectorNumber: async () => null,
  };
  return {
    persistence,
    repo,
    catalog,
    recognizer: new StubCardRecognizer({ candidates: [] }),
    collectionStore: createCollectionStore(repo),
  };
};

test('boots through the loading gate to the Collection screen', async () => {
  render(<App services={makeFakeServices()} />);
  expect(await screen.findByText('Collection')).toBeOnTheScreen();
});
