/**
 * Ink Capture — application root + composition.
 *
 * Builds the service graph once (real by default; tests inject a `services`
 * prop), runs the startup sequence behind a loading gate, then mounts
 * SafeAreaProvider → AppServicesProvider → NavigationContainer → RootNavigator.
 * The gate shows a spinner while `initialize()` runs and minimal error text on
 * failure (rich first-run/offline UX is E2).
 *
 * @format
 */

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppServicesProvider } from '@state';
import type { AppServices } from '@state';
import { createAppServices, initialize } from './compositionRoot';
import { RootNavigator } from './navigation';

type GateStatus = 'loading' | 'ready' | 'error';

function App({ services }: { services?: AppServices }): React.JSX.Element {
  // Build (or accept injected) services exactly once. The lazy initializer means
  // createAppServices() — and its native openDatabase() — never runs when a test
  // supplies fakes.
  const [appServices] = useState<AppServices>(
    () => services ?? createAppServices(),
  );
  const [status, setStatus] = useState<GateStatus>('loading');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    initialize(appServices)
      .then(() => {
        if (!cancelled) {
          setStatus('ready');
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appServices]);

  return (
    <SafeAreaProvider>
      {status === 'ready' ? (
        <AppServicesProvider services={appServices}>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </AppServicesProvider>
      ) : (
        <View style={styles.gate}>
          {status === 'loading' ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.error}>
              Couldn’t start Ink Capture.{error ? `\n${error}` : ''}
            </Text>
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
});

export default App;
