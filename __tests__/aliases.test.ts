/**
 * Cross-alias smoke test.
 *
 * Proves the path aliases resolve through the babel transform that Jest (and
 * Metro) use. The `@lib` case asserts a real runtime value — the type-only
 * `@services`/`@domain` seams are added alongside the service interfaces.
 *
 * @format
 */

import { APP_NAME } from '@lib';

test('@lib alias resolves to a runtime value', () => {
  expect(APP_NAME).toBe('Ink Capture');
});
