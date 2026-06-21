/**
 * Catalog base-URL configuration.
 *
 * Together with `visionConfig`, this contains the react-native-config import to
 * the config modules, keeping the native env dependency isolated (and trivially
 * mockable in Jest). The canonical URL is
 * a code default so the app works with no `.env`; `CATALOG_API_BASE_URL` is an
 * optional override surfaced by react-native-config at build time.
 *
 * @format
 */

import Config from 'react-native-config';

/** Canonical LorcanaJSON base — `${base}/metadata.json` + `${base}/allCards.json`. */
export const DEFAULT_CATALOG_BASE_URL =
  'https://lorcanajson.org/files/current/en';

/** The configured catalog base URL, or the canonical default when unset. */
export const resolveCatalogBaseUrl = (): string =>
  Config.CATALOG_API_BASE_URL ?? DEFAULT_CATALOG_BASE_URL;
