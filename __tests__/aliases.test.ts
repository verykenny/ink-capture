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
import type { CardRecognizer } from '@services';
import type { RecognitionResult } from '@domain';

test('@lib alias resolves to a runtime value', () => {
  expect(APP_NAME).toBe('Ink Capture');
});

test('the @services / @domain contracts are importable and satisfiable', () => {
  const result: RecognitionResult = { candidates: [] };
  const recognizer: CardRecognizer = { recognize: async () => result };
  expect(recognizer).toBeDefined();
});
