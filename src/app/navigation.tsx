/**
 * Root navigation — the native-stack that wires the three C2 screens.
 *
 * Shape (ratified): Collection (initial) → Scan → Confirm (modal). Relaunch
 * lands on the persisted Collection list, which is what demonstrates
 * persistence-across-restart; the Scan CTA pushes Scan, and Confirm is presented
 * modally carrying the RecognitionResult the Scan screen produced.
 *
 * `RootStackParamList` is C2-internal — it is NOT an A3 service contract; it only
 * types the routes and their params for `navigation`/`route` across the screens.
 *
 * @format
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import type { RecognitionResult } from '@domain';

/** Route table for the root native-stack. */
export type RootStackParamList = {
  Collection: undefined;
  Scan: undefined;
  Confirm: { result: RecognitionResult };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Placeholder screens — replaced by the real @ui screens in later C2 commits
// (collection list → scan → confirm). They keep this shell independently
// buildable and let the app boot end-to-end before the screens exist.
const Placeholder = ({ label }: { label: string }): React.JSX.Element => (
  <View style={styles.placeholder}>
    <Text>{label}</Text>
  </View>
);

const CollectionPlaceholder = (): React.JSX.Element => (
  <Placeholder label="Collection" />
);
const ScanPlaceholder = (): React.JSX.Element => <Placeholder label="Scan" />;
const ConfirmPlaceholder = (): React.JSX.Element => (
  <Placeholder label="Confirm" />
);

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName="Collection">
      <Stack.Screen
        name="Collection"
        component={CollectionPlaceholder}
        options={{ title: 'My Collection' }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanPlaceholder}
        options={{ title: 'Scan a Card' }}
      />
      <Stack.Screen
        name="Confirm"
        component={ConfirmPlaceholder}
        options={{ presentation: 'modal', title: 'Confirm Card' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
