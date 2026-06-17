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

import { useEffect, useState } from 'react';
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

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [didRequest, setDidRequest] = useState(false);

  // Trigger the OS permission prompt once on first mount if not yet granted.
  useEffect(() => {
    if (!hasPermission) {
      void requestPermission().finally(() => setDidRequest(true));
    }
  }, [hasPermission, requestPermission]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Text style={styles.title}>Ink Capture</Text>
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
                void Linking.openSettings();
              }}>
              <Text style={styles.buttonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
});

export default App;
