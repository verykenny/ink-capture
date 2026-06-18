/**
 * Ink Capture — A1 scaffold hello screen.
 *
 * Minimal camera-permission probe: on mount it requests camera permission via
 * react-native-vision-camera, shows the resulting status, and renders a live
 * back-camera preview once granted. No navigation, state management, OCR, or
 * frame processors yet — those arrive in later milestones (C2 / D1+).
 *
 * @format
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { APP_NAME } from '@lib';
// TODO(C2): remove this temporary debug affordance — these imports wire a
// throwaway on-screen persistence smoke check (B3). Delete with the "Test DB"
// button + handler below; the real persistence gate is the repository unit tests.
import {
  createCollectionRepository,
  createPersistenceService,
  openDatabase,
  type NewCollectionEntry,
} from '@services';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [didRequest, setDidRequest] = useState(false);

  // TODO(C2): remove this temporary debug affordance — a throwaway smoke check
  // that drives the REAL op-sqlite persistence stack through its public
  // interfaces (no shortcuts into SQL), so we can verify the native binding on a
  // simulator/device before C2 builds the real collection UI.
  const persistence = useMemo(() => {
    const db = openDatabase();
    return {
      service: createPersistenceService(db),
      repo: createCollectionRepository(db),
    };
  }, []);
  const [dbStatus, setDbStatus] = useState('');
  const handleTestDb = useCallback(async () => {
    try {
      await persistence.service.init(); // idempotent — safe to tap repeatedly
      const entry: NewCollectionEntry = {
        cardId: 'TFC-042', // a card from the test fixtures (Elsa, Snow Queen)
        quantity: 1,
        finish: 'normal',
        condition: 'NM',
      };
      await persistence.repo.add(entry); // create (or increment if it exists)
      await persistence.repo.add(entry); // same identity → B1 merge increments qty
      const entries = await persistence.repo.list();
      const topQty = entries.reduce((max, e) => Math.max(max, e.quantity), 0);
      const summary = `${entries.length} entries, top stack qty=${topQty}`;
      console.log('[TEMP DB smoke]', summary, entries); // temporary (C2 removes it)
      setDbStatus(summary);
    } catch (error) {
      const message = `DB error: ${String(error)}`;
      console.log('[TEMP DB smoke]', message, error); // temporary (C2 removes it)
      setDbStatus(message);
    }
  }, [persistence]);

  // Trigger the OS permission prompt once on first mount if not yet granted.
  useEffect(() => {
    if (!hasPermission) {
      // eslint-disable-next-line no-void -- mark the fire-and-forget promise as intentionally unawaited
      void requestPermission().finally(() => setDidRequest(true));
    }
  }, [hasPermission, requestPermission]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Text style={styles.title}>{APP_NAME}</Text>
      <Text style={styles.subtitle}>A1 scaffold — camera permission check</Text>

      <View style={styles.preview}>
        {hasPermission && device ? (
          <Camera style={StyleSheet.absoluteFill} device={device} isActive />
        ) : hasPermission && !device ? (
          <Status text="Permission granted, but no camera device was found (expected on a simulator without a virtual camera)." />
        ) : !didRequest ? (
          <ActivityIndicator />
        ) : (
          <View style={styles.deniedBox}>
            <Status text="Camera permission is needed to scan cards." />
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                // eslint-disable-next-line no-void -- mark the fire-and-forget promise as intentionally unawaited
                void Linking.openSettings();
              }}
            >
              <Text style={styles.buttonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* TODO(C2): remove this temporary debug affordance (B3 persistence smoke check). */}
      <TouchableOpacity
        style={styles.debugButton}
        onPress={() => {
          // eslint-disable-next-line no-void -- fire-and-forget the async smoke check
          void handleTestDb();
        }}
      >
        <Text style={styles.buttonText}>Test DB</Text>
      </TouchableOpacity>
      {dbStatus ? <Text style={styles.status}>{dbStatus}</Text> : null}
    </SafeAreaView>
  );
}

function Status({ text }: { text: string }): React.JSX.Element {
  return <Text style={styles.status}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 4,
    marginBottom: 24,
  },
  preview: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#00000011',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deniedBox: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  status: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#3b5bfd',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  // TODO(C2): remove with the temporary "Test DB" smoke-check button.
  debugButton: {
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#8a8a8a',
  },
});

export default App;
