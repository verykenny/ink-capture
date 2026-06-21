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

import type { Card, RecognitionCandidate } from '@domain';

export type RootStackParamList = {
  Collection: undefined;
  Scan: undefined;
  // Edit or remove one saved stack, reached by tapping a Collection row. Carries
  // the entry's id; the screen reads the live entry from the collection store.
  EditEntry: { entryId: string };
  // The unified manual-pick / search screen. An ambiguous scan seeds it with the
  // scan's top-N candidates; a manual entry searches by name. `reason: 'no-match'`
  // marks a scan that read nothing, so the empty box explains the arrival rather
  // than showing the generic prompt. Pick → Confirm.
  CardSearch: { seed?: RecognitionCandidate[]; reason?: 'no-match' };
  // A chosen card (+ its scan confidence, when it came from a confident scan)
  // feeds the one confirm+save screen — whether from a confident scan, an
  // ambiguous top-N pick, or a manual search. Confidence is a display hint only.
  Confirm: { card: Card; confidence?: number };
};
