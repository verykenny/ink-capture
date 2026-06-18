/**
 * Composition root — where the abstract `AppServices` graph is built from
 * concrete implementations and started.
 *
 * `createAppServices` wires the real op-sqlite database, the persistence service
 * + repository, the catalog service (over `fetch`), the collection store, and a
 * placeholder recognizer. `initialize` runs the one-time startup sequence behind
 * the App's loading gate. `overrides` and the `services` prop on `App` are the
 * test seams: fakes are injected so no real DB, network, or native runs in Jest.
 *
 * Only this module imports concrete services — the UI and state layers depend on
 * the interfaces (`@services`) and the store/context (`@state`).
 *
 * @format
 */

import {
  StubCardRecognizer,
  createCatalogService,
  createCollectionRepository,
  createFetchJsonClient,
  createPersistenceService,
  openDatabase,
} from '@services';
import { createCollectionStore } from '@state';
import type { AppServices } from '@state';

/** An empty recognizer used until `initialize` picks a demo card from the catalog. */
const noMatchRecognizer = new StubCardRecognizer({ candidates: [] });

/**
 * Build the real service graph. `overrides` replaces individual services (a
 * coarse test seam); App's `services` prop is the primary one — when supplied,
 * this is never called, so `openDatabase()` (native) never runs in Jest.
 */
export const createAppServices = (
  overrides: Partial<AppServices> = {},
): AppServices => {
  const db = openDatabase();
  const persistence = createPersistenceService(db);
  const repo = createCollectionRepository(db);
  const catalog = createCatalogService({ db, http: createFetchJsonClient() });
  const collectionStore = createCollectionStore(repo);

  return {
    persistence,
    repo,
    catalog,
    recognizer: noMatchRecognizer,
    collectionStore,
    ...overrides,
  };
};

/**
 * One-time startup, run behind the loading gate:
 *   1. apply migrations,
 *   2. sync the catalog (first-run download; no-op when already current),
 *   3. pick a demo card and wire the stub recognizer to it (D1 swaps this line
 *      for the real OCR recognizer),
 *   4. load the persisted collection into the store.
 *
 * Rich first-run/offline/no-match UX is E2 — here a missing demo card simply
 * leaves the no-match recognizer in place (Confirm shows its empty branch).
 */
export const initialize = async (services: AppServices): Promise<void> => {
  await services.persistence.init();
  await services.catalog.sync();
  const [demoCard] = await services.catalog.getAllCards();
  if (demoCard) {
    services.recognizer = StubCardRecognizer.forCard(demoCard);
  }
  await services.collectionStore.getState().load();
};
