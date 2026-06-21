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
 * never appears in a release build or the normal UI. The header toggles
 * collapse/expand (so it doesn't block the screen underneath) and carries a
 * **Share** button that exports every capture this session via the OS share sheet
 * (Copy / Save to Files / Mail) — screenshotting each read is tedious. The readout
 * itself is `selectable` for ad-hoc copy. Uses React Native's core `Share` API, so
 * no new native dependency. Reads the latest block from the recognitionDiagnostics
 * sink via useSyncExternalStore — no navigation threading.
 *
 * @format
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  getLastRecognitionDiagnostics,
  getRecognitionDiagnosticsHistory,
  shouldLogRecognitionDiagnostics,
  subscribeRecognitionDiagnostics,
} from '@services';

export function RecognitionDiagnosticsOverlay(): React.JSX.Element | null {
  const block = useSyncExternalStore(
    subscribeRecognitionDiagnostics,
    getLastRecognitionDiagnostics,
  );
  const [collapsed, setCollapsed] = useState(false);

  const onShare = useCallback(() => {
    // Export every capture this session so they can be copied / saved / mailed in
    // one go. Best-effort: the share sheet can be dismissed (rejects) — swallow it.
    // eslint-disable-next-line no-void -- fire-and-forget the share sheet
    void Share.share({ message: getRecognitionDiagnosticsHistory() }).catch(
      () => undefined,
    );
  }, []);

  // Dev-only: invisible unless the flag is on and at least one scan has run.
  if (!shouldLogRecognitionDiagnostics() || block === undefined) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.toggle}
          onPress={() => setCollapsed(value => !value)}
          accessibilityRole="button"
          accessibilityLabel="Recognition diagnostics"
        >
          <Text style={styles.headerText}>
            {collapsed
              ? '▸ recognition diagnostics (tap)'
              : '▾ recognition diagnostics'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share recognition diagnostics"
        >
          <Text style={styles.shareText}>⧉ Share all</Text>
        </TouchableOpacity>
      </View>
      {collapsed ? null : (
        <ScrollView style={styles.scroll}>
          <Text style={styles.text} selectable>
            {block}
          </Text>
        </ScrollView>
      )}
    </View>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  toggle: {
    flexShrink: 1,
  },
  headerText: {
    color: '#7CFC8A',
    fontFamily: 'Menlo',
    fontSize: 11,
  },
  shareButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#7CFC8A',
    marginLeft: 8,
  },
  shareText: {
    color: '#7CFC8A',
    fontFamily: 'Menlo',
    fontSize: 11,
    fontWeight: '600',
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
});
