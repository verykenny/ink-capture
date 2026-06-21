/**
 * Composition root — where the abstract `AppServices` graph is built from
 * concrete implementations.
 *
 * `createAppServices` wires the real op-sqlite database, the persistence service
 * + repository, the catalog service (over `fetch`), the collection store, and a
 * placeholder recognizer. The one-time startup *sequence* now lives in the
 * `appInitStore` state machine (`@state`), which `App` owns and drives behind its
 * gate. `overrides` and the `services` prop on `App` are the test seams: fakes
 * are injected so no real DB, network, or native runs in Jest.
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
  createCustomCardRepository,
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
  const customCards = createCustomCardRepository(db);
  const catalog = createCatalogService({ db, http: createFetchJsonClient() });
  const collectionStore = createCollectionStore(repo);

  return {
    persistence,
    repo,
    catalog,
    customCards,
    recognizer: buildRecognizer(catalog),
    collectionStore,
    ...overrides,
  };
};
