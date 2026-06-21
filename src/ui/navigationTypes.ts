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
  // The unified manual-pick / search screen. An ambiguous scan seeds it with the
  // scan's top-N candidates; a manual entry searches by name. Pick → Confirm.
  CardSearch: { seed?: RecognitionCandidate[] };
  // A chosen card (+ its scan confidence, when it came from a confident scan)
  // feeds the one confirm+save screen — whether from a confident scan, an
  // ambiguous top-N pick, or a manual search. Confidence is a display hint only.
  Confirm: { card: Card; confidence?: number };
};
