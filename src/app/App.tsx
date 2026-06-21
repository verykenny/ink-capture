/**
 * Ink Capture — application root + composition.
 *
 * Builds the service graph once (real by default; tests inject a `services`
 * prop), then drives the `appInitStore` startup state machine behind a gate.
 * The gate shows an indeterminate "setting up the catalog" spinner on first run,
 * minimal error text on a hard failure, and — once `ready` — mounts
 * SafeAreaProvider → AppServicesProvider → NavigationContainer → RootNavigator.
 *
 * The init store (not `initialize()`) owns the startup sequence now: it checks
 * the LOCAL catalog cache before any network call, so an offline launch with a
 * cached catalog boots straight through. A first run with no network shows a
 * setup-needed gate with a Retry that recovers once back online.
 *
 * @format
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useStore } from 'zustand';
import { AppServicesProvider, createAppInitStore } from '@state';
import type { AppInitPhase, AppServices } from '@state';
import { RecognitionDiagnosticsOverlay } from '@ui/dev/RecognitionDiagnosticsOverlay';
import { createAppServices } from './compositionRoot';
import { RootNavigator } from './navigation';

/** The first-run / startup gate shown until the init store reports `ready`. */
function StartupGate({
  phase,
  error,
  onRetry,
}: {
  phase: AppInitPhase;
  error?: string;
  onRetry: () => void;
}): React.JSX.Element {
  if (phase === 'first-run-failed') {
    // Offline-no-cache or a download error — the same recoverable case: there is
    // no cached catalog to fall back to, so offer a clear path to try again.
    return (
      <View style={styles.gate}>
        <Text style={styles.gateMessage}>
          Couldn’t download the card catalog. Check your connection and try
          again.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (phase === 'error') {
    return (
      <View style={styles.gate}>
        <Text style={styles.error}>
          Couldn’t start Ink Capture.{error ? `\n${error}` : ''}
        </Text>
      </View>
    );
  }
  // 'starting' | 'first-run-downloading': an indeterminate first-run setup.
  return (
    <View style={styles.gate}>
      <ActivityIndicator />
      <Text style={styles.gateMessage}>
        Setting up the card catalog… (first run only)
      </Text>
    </View>
  );
}

function App({ services }: { services?: AppServices }): React.JSX.Element {
  // Build (or accept injected) services exactly once. The lazy initializer means
  // createAppServices() — and its native openDatabase() — never runs when a test
  // supplies fakes.
  const [appServices] = useState<AppServices>(
    () => services ?? createAppServices(),
  );
  // Build the init store ONCE, over the same lazy seam — a fresh store per render
  // would re-fire start() endlessly.
  const [initStore] = useState(() => createAppInitStore(appServices));
  const phase = useStore(initStore, s => s.phase);
  const error = useStore(initStore, s => s.error);

  useEffect(() => {
    // Fire-and-forget: the store owns all error handling, so start() never
    // rejects — it just drives `phase`.
    // eslint-disable-next-line no-void -- fire-and-forget; the store captures failures
    void initStore.getState().start();
  }, [initStore]);

  if (phase !== 'ready') {
    return (
      <SafeAreaProvider>
        <StartupGate
          phase={phase}
          error={error}
          onRetry={() => {
            // eslint-disable-next-line no-void -- fire-and-forget; the store captures failures
            void initStore.getState().retry();
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <AppServicesProvider services={appServices}>
        <View style={styles.root}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
          {/* Dev-only, flag-gated; renders null unless DEBUG_RECOGNITION is set. */}
          <RecognitionDiagnosticsOverlay />
        </View>
      </AppServicesProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  gateMessage: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    opacity: 0.7,
  },
  error: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  retryButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
    backgroundColor: '#3b5bfd',
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
