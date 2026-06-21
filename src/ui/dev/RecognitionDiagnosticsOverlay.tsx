/**
 * RecognitionDiagnosticsOverlay — a dev-only, flag-gated on-screen readout of the
 * latest scan's diagnostics (raw OCR text + parsed RecognitionSource + ranked
 * candidates with confidences).
 *
 * On a bundled device build with no debugger attached, `console.log` has nowhere
 * to surface — Metro, os_log, and the Hermes inspector are all unavailable — so
 * this renders the same block the logger formats, right on the phone. It is the
 * tool for tuning the `decideRecognition` thresholds against real live reads.
 *
 * Shown only when `DEBUG_RECOGNITION` is set; it returns null otherwise, so it
 * never appears in a release build or the normal UI. Tap to collapse/expand so it
 * doesn't block the screen underneath. Reads the latest block from the
 * recognitionDiagnostics sink via useSyncExternalStore — no navigation threading.
 *
 * @format
 */

import { useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import {
  getLastRecognitionDiagnostics,
  shouldLogRecognitionDiagnostics,
  subscribeRecognitionDiagnostics,
} from '@services';

export function RecognitionDiagnosticsOverlay(): React.JSX.Element | null {
  const block = useSyncExternalStore(
    subscribeRecognitionDiagnostics,
    getLastRecognitionDiagnostics,
  );
  const [collapsed, setCollapsed] = useState(false);

  // Dev-only: invisible unless the flag is on and at least one scan has run.
  if (!shouldLogRecognitionDiagnostics() || block === undefined) {
    return null;
  }

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.9}
      onPress={() => setCollapsed(value => !value)}
      accessibilityRole="button"
      accessibilityLabel="Recognition diagnostics"
    >
      {collapsed ? (
        <Text style={styles.collapsed}>▸ recognition diagnostics (tap)</Text>
      ) : (
        <ScrollView style={styles.scroll}>
          <Text style={styles.text}>{block}</Text>
        </ScrollView>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxHeight: '45%',
    paddingTop: 52, // clear the status bar / notch
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  scroll: {
    flexGrow: 0,
  },
  text: {
    color: '#7CFC8A',
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 15,
  },
  collapsed: {
    color: '#7CFC8A',
    fontFamily: 'Menlo',
    fontSize: 11,
  },
});
