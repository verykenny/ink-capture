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
  createCardMatcher,
  createCatalogService,
  createCollectionRepository,
  createFetchJsonClient,
  createMlKitOcrEngine,
  createOcrCardRecognizer,
  createPersistenceService,
  openDatabase,
  shouldUseStubRecognizer,
} from '@services';
import type { CardRecognizer, CatalogReader } from '@services';
import { createCollectionStore } from '@state';
import type { AppServices } from '@state';

/**
 * The production recognizer: on-device ML Kit OCR → parser → C1 matcher. The
 * matcher reads the catalog lazily at match() time, so no demo card or pre-sync
 * is needed. `USE_STUB_RECOGNIZER` forces the (empty) stub instead — a code-free
 * escape hatch for manual runs without a camera, or to isolate the OCR path.
 */
const buildRecognizer = (catalog: CatalogReader): CardRecognizer =>
  shouldUseStubRecognizer()
    ? new StubCardRecognizer({ candidates: [] })
    : createOcrCardRecognizer({
        engine: createMlKitOcrEngine(),
        matcher: createCardMatcher(catalog),
      });

/**
 * Build the real service graph. `overrides` replaces individual services (a
 * coarse test seam); App's `services` prop is the primary one — when supplied,
 * this is never called, so `openDatabase()` (native) and `createMlKitOcrEngine()`
 * never run in Jest.
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
    recognizer: buildRecognizer(catalog),
    collectionStore,
    ...overrides,
  };
};

/**
 * One-time startup, run behind the loading gate:
 *   1. apply migrations,
 *   2. sync the catalog (first-run download; no-op when already current) so the
 *      matcher has cards to rank against,
 *   3. load the persisted collection into the store.
 *
 * The recognizer is constructed in `createAppServices` (the matcher reads the
 * catalog lazily), so there is no demo-card step here. Rich first-run/offline/
 * no-match UX is E2 — an empty read still routes to Confirm's no-match branch.
 */
export const initialize = async (services: AppServices): Promise<void> => {
  await services.persistence.init();
  await services.catalog.sync();
  await services.collectionStore.getState().load();
};
