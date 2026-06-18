/**
 * AppServices — the dependency-injection container + its React context.
 *
 * `AppServices` is the set of service *interfaces* the UI and state layers
 * consume (the store, plus the recognizer/catalog/repository/persistence ports).
 * The concrete graph is built by the composition root (`@app`) and handed to
 * `AppServicesProvider`; screens read it via `useAppServices()`.
 *
 * It lives in `@state` (not `@app`) on purpose: there is no `@app` alias, so
 * placing the hook here lets `@ui` depend *inward* on `@state` for it, keeping
 * the dependency direction clean (UI → State → Domain; services as interfaces).
 * This is the convention E1/E2/E3 inherit.
 *
 * @format
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type {
  CardRecognizer,
  CatalogService,
  CollectionRepository,
  PersistenceService,
} from '@services';
import type { CollectionStore } from './collectionStore';

/** The injectable service graph shared across the app via context. */
export interface AppServices {
  persistence: PersistenceService;
  repo: CollectionRepository;
  catalog: CatalogService;
  /** Set during `initialize()` from the synced catalog — D1 swaps this one line. */
  recognizer: CardRecognizer;
  collectionStore: CollectionStore;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <AppServicesContext.Provider value={services}>
      {children}
    </AppServicesContext.Provider>
  );
}

/** Read the injected services. Throws if used outside an AppServicesProvider. */
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === null) {
    throw new Error(
      'useAppServices must be used within an AppServicesProvider',
    );
  }
  return services;
}
