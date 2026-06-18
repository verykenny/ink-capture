/**
 * createFetchJsonClient — the production HttpJsonClient wrapping global `fetch`.
 *
 * The whole point of the seam is network isolation: every other catalog spec
 * injects a fake client and never touches `fetch`. THIS spec is the one place
 * the real `fetch` wrapper is exercised, with `global.fetch` mocked — so the
 * non-2xx-throws and JSON-parse behavior is pinned without a live request.
 *
 * @format
 */

import { createFetchJsonClient } from '@services/catalog/HttpJsonClient';

describe('createFetchJsonClient', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test('returns the parsed JSON body on a 2xx response', async () => {
    const body = { metadata: { generatedOn: 'x' } };
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createFetchJsonClient();
    const result = await client.getJson<typeof body>(
      'https://example.test/m.json',
    );

    expect(result).toEqual(body);
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/m.json');
  });

  test('throws on a non-2xx response (status surfaced)', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createFetchJsonClient();
    await expect(
      client.getJson('https://example.test/missing.json'),
    ).rejects.toThrow(/404/);
  });

  test('does not parse the body when the response is not ok', async () => {
    const json = jest.fn(async () => ({}));
    const fetchMock = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json,
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createFetchJsonClient();
    await expect(
      client.getJson('https://example.test/x.json'),
    ).rejects.toThrow();
    expect(json).not.toHaveBeenCalled();
  });
});
