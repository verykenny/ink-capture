/**
 * Recognizer feature flag — force the stub backend without a code change.
 *
 * Like `catalogConfig` isolates the catalog URL, this isolates the
 * react-native-config read for `USE_STUB_RECOGNIZER`, keeping the native env
 * dependency contained to the config modules (and trivially mockable in Jest)
 * and out of the composition root. Set `USE_STUB_RECOGNIZER=true` (or `1`) to
 * skip OCR and wire `StubCardRecognizer` — handy for manual runs on a simulator
 * with no camera, or to isolate a bug to the OCR path.
 *
 * @format
 */

import Config from 'react-native-config';

/** True when `USE_STUB_RECOGNIZER` asks the composition root to force the stub. */
export const shouldUseStubRecognizer = (): boolean =>
  Config.USE_STUB_RECOGNIZER === 'true' || Config.USE_STUB_RECOGNIZER === '1';
