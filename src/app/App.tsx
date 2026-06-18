/**
 * Ink Capture — application root.
 *
 * C2 shell: mounts SafeAreaProvider → NavigationContainer → RootNavigator. The
 * injectable composition root + the startup loading gate land in the next commit;
 * the real Collection/Scan/Confirm screens then replace the navigation
 * placeholders. This replaces the A1 camera-permission screen and retires the
 * temporary B3 "Test DB" persistence smoke affordance (its inline composition
 * root is superseded by the real one).
 *
 * @format
 */

import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './navigation';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

export default App;
