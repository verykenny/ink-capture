/**
 * Route table for the root native-stack — the contract between the screens
 * (`@ui`) and the navigator that wires them (`@app/navigation.tsx`).
 *
 * It lives in `@ui` so screens can type their `navigation`/`route` props without
 * importing from `@app` (the composition root is the outermost layer; UI never
 * depends outward on it). The navigator imports this inward. C2-internal — not
 * an A3 service contract.
 *
 * @format
 */

import type { RecognitionResult } from '@domain';

export type RootStackParamList = {
  Collection: undefined;
  Scan: undefined;
  Confirm: { result: RecognitionResult };
};
