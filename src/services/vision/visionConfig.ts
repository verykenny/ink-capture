/**
 * Recognizer feature flags — change recognizer behaviour without a code change.
 *
 * Like `catalogConfig` isolates the catalog URL, this isolates the
 * react-native-config reads, keeping the native env dependency contained to the
 * config modules (and trivially mockable in Jest) and out of the composition
 * root.
 *
 *  - `USE_STUB_RECOGNIZER=true` (or `1`) skips OCR and wires
 *    `StubCardRecognizer` — handy for manual runs on a simulator with no camera,
 *    or to isolate a bug to the OCR path.
 *  - `DEBUG_RECOGNITION=true` (or `1`) turns on D2's dev-only recognition
 *    diagnostics: the recognizer logs what it actually read live (raw OCR text +
 *    parsed source + ranked candidates) so the routing thresholds can be tuned
 *    against real captures. Dev-only; it never gates release behaviour or
 *    surfaces in the UI.
 *
 * @format
 */

import Config from 'react-native-config';

/** True when `USE_STUB_RECOGNIZER` asks the composition root to force the stub. */
export const shouldUseStubRecognizer = (): boolean =>
  Config.USE_STUB_RECOGNIZER === 'true' || Config.USE_STUB_RECOGNIZER === '1';

/** True when `DEBUG_RECOGNITION` asks the recognizer to log dev diagnostics. */
export const shouldLogRecognitionDiagnostics = (): boolean =>
  Config.DEBUG_RECOGNITION === 'true' || Config.DEBUG_RECOGNITION === '1';
