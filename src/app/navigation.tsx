/**
 * Root navigation — the native-stack that wires the three C2 screens.
 *
 * Shape (ratified): Collection (initial) → Scan → Confirm (modal). Relaunch
 * lands on the persisted Collection list, which is what demonstrates
 * persistence-across-restart; the Scan CTA pushes Scan, and Confirm is presented
 * modally carrying the chosen card the Scan screen (or, in D2, the manual pick)
 * produced.
 *
 * The route table (`RootStackParamList`) lives in `@ui/navigationTypes` so the
 * screens can type their props without importing from `@app`; it is re-exported
 * here for convenience. C2-internal — not an A3 service contract.
 *
 * @format
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CollectionListScreen } from '@ui/collection/CollectionListScreen';
import { ScanScreen } from '@ui/scan/ScanScreen';
import { ConfirmSheet } from '@ui/scan/ConfirmSheet';
import type { RootStackParamList } from '@ui/navigationTypes';

export type { RootStackParamList } from '@ui/navigationTypes';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator initialRouteName="Collection">
      <Stack.Screen
        name="Collection"
        component={CollectionListScreen}
        options={{ title: 'My Collection' }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ title: 'Scan a Card' }}
      />
      <Stack.Screen
        name="Confirm"
        component={ConfirmSheet}
        options={{ presentation: 'modal', title: 'Confirm Card' }}
      />
    </Stack.Navigator>
  );
}
