/**
 * catalogConfig — the ONLY module that reads react-native-config. The base URL
 * is a code default (so the app works with no `.env`); Config provides an
 * optional override.
 *
 * react-native-config is mocked globally (jest.setup.ts) so `Config` is an empty
 * object in tests → the default is used. This spec mutates that mocked object to
 * exercise the override branch, restoring it afterwards.
 *
 * @format
 */

import Config from 'react-native-config';
import {
  DEFAULT_CATALOG_BASE_URL,
  resolveCatalogBaseUrl,
} from '@services/catalog/catalogConfig';

type MutableConfig = Record<string, string | undefined>;

describe('catalogConfig', () => {
  afterEach(() => {
    delete (Config as MutableConfig).CATALOG_API_BASE_URL;
  });

  test('DEFAULT_CATALOG_BASE_URL is the canonical LorcanaJSON base', () => {
    expect(DEFAULT_CATALOG_BASE_URL).toBe(
      'https://lorcanajson.org/files/current/en',
    );
  });

  test('falls back to the default when Config has no override', () => {
    expect(resolveCatalogBaseUrl()).toBe(DEFAULT_CATALOG_BASE_URL);
  });

  test('returns the Config override when CATALOG_API_BASE_URL is set', () => {
    (Config as MutableConfig).CATALOG_API_BASE_URL =
      'https://override.example.test/v0';
    expect(resolveCatalogBaseUrl()).toBe('https://override.example.test/v0');
  });
});
