/**
 * appInitStore — the startup state machine that gates the app.
 *
 * A Zustand *vanilla* store (no React coupling), built by `createAppInitStore`
 * over the persistence / catalog / collection-store ports — mirroring
 * `createCollectionStore`. `App` owns the single instance, calls `start()` on
 * mount, and renders a gate off `phase`. It is deliberately NOT part of
 * `AppServices`: it orchestrates those services for startup but isn't one of them.
 *
 * The ordering is the whole point. `catalog.getAllCards()` is a LOCAL cache read
 * and runs BEFORE any network call, so a launch with a cached catalog boots
 * straight to `ready` and the network `sync()` becomes a fail-soft background
 * refresh — offline-with-cache never blocks or crashes. Only a first run with no
 * cache awaits the network, and its failure (offline OR a download error — the
 * same case) is a recoverable `first-run-failed` that `retry()` clears once the
 * network returns.
 *
 * `sync()` and the HTTP client are unchanged — they correctly throw; this store
 * owns the catch.
 *
 * @format
 */

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CatalogService, PersistenceService } from '@services';
import type { CollectionStore } from './collectionStore';

export type AppInitPhase =
  | 'starting'
  | 'first-run-downloading'
  | 'first-run-failed'
  | 'ready'
  | 'error';

export interface AppInitState {
  phase: AppInitPhase;
  /** Set on a failure gate (`error`); display-only. */
  error?: string;
  /** Run the one-time startup sequence. Owns its own errors — never rejects. */
  start(): Promise<void>;
  /** Re-run `start()` after a recoverable failure. */
  retry(): Promise<void>;
}

export type AppInitStore = StoreApi<AppInitState>;

/** The services the startup sequence orchestrates (a subset of `AppServices`). */
export interface AppInitDeps {
  persistence: PersistenceService;
  catalog: CatalogService;
  collectionStore: CollectionStore;
}

/** Narrow an unknown thrown value to a display string. */
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const createAppInitStore = ({
  persistence,
  catalog,
  collectionStore,
}: AppInitDeps): AppInitStore =>
  createStore<AppInitState>(set => {
    const start = async (): Promise<void> => {
      set({ phase: 'starting', error: undefined });

      // Migrations / DB open: a hard, non-network failure. There is no local
      // store to fall back to, so surface the error gate and stop.
      try {
        await persistence.init();
      } catch (error) {
        set({ phase: 'error', error: messageOf(error) });
        return;
      }

      // LOCAL read — must precede any network call. A non-empty cache means the
      // app is fully usable offline; the network sync becomes a background refresh.
      const hasCache = (await catalog.getAllCards()).length > 0;

      // Local load; the collection store owns its own error status, so a failure
      // here must not block startup.
      await collectionStore.getState().load();

      if (hasCache) {
        set({ phase: 'ready', error: undefined });
        // Fail-soft background refresh: a rejected sync (e.g. offline) must never
        // disturb the already-usable app.
        // eslint-disable-next-line no-void -- fire-and-forget background refresh
        void catalog.sync().catch(() => undefined);
        return;
      }

      // No cache: the first-run download is the ONE step that needs the network.
      set({ phase: 'first-run-downloading', error: undefined });
      try {
        await catalog.sync();
        set({ phase: 'ready', error: undefined });
      } catch (error) {
        // Recoverable: offline-no-cache and a download error are the same
        // setup-needed state, cleared by `retry()` once the network returns.
        set({ phase: 'first-run-failed', error: messageOf(error) });
      }
    };

    return {
      phase: 'starting',
      start,
      retry: start,
    };
  });
