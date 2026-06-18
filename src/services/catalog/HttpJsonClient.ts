/**
 * The catalog's HTTP fetch seam.
 *
 * All network access in B2 goes through this one interface so the DoD's I/O
 * isolation holds: the service depends on `HttpJsonClient`, tests inject a fake
 * returning fixture JSON, and only `createFetchJsonClient` ever touches the
 * platform `fetch`. RN 0.86 ships a global `fetch`, so no HTTP library is added.
 *
 * @format
 */

/** Fetches a URL and returns its JSON body, typed by the caller. */
export interface HttpJsonClient {
  getJson<T>(url: string): Promise<T>;
}

/** Production client over the global `fetch`. Throws on any non-2xx response. */
export const createFetchJsonClient = (): HttpJsonClient => ({
  getJson: async <T>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `HttpJsonClient: ${response.status} ${response.statusText} for ${url}`,
      );
    }
    return (await response.json()) as T;
  },
});
