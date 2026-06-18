/**
 * ScanScreen — camera capture, the entry point of the scan→confirm→save loop.
 *
 * Carries over A1's camera-permission probe + live back-camera preview, and adds
 * a Capture action: it runs the injected `CardRecognizer` and pushes the Confirm
 * route with the result. The recognizer is the C2 stub (it ignores the image), so
 * Capture works even without a physical camera device (e.g. on a simulator);
 * D1's OcrCardRecognizer swaps in behind the same interface and will capture a
 * real frame to OCR. Confidence is never thresholded here — the user always
 * confirms on the next screen.
 *
 * @format
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

// The stub recognizer ignores the image; D1 replaces this with a real captured
// still (camera.takePhoto()) to OCR.
const STUB_CAPTURE_URI = 'capture://stub';

export function ScanScreen({ navigation }: Props): React.JSX.Element {
  const { recognizer } = useAppServices();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [didRequest, setDidRequest] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      let cancelled = false;
      // eslint-disable-next-line no-void -- fire-and-forget the permission prompt
      void requestPermission().finally(() => {
        if (!cancelled) {
          setDidRequest(true);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [hasPermission, requestPermission]);

  const onCapture = useCallback(async () => {
    const result = await recognizer.recognize({ uri: STUB_CAPTURE_URI });
    navigation.navigate('Confirm', { result });
  }, [recognizer, navigation]);

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        {didRequest ? (
          <View style={styles.deniedBox}>
            <Text style={styles.status}>
              Camera permission is needed to scan cards.
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                // eslint-disable-next-line no-void -- fire-and-forget
                void Linking.openSettings();
              }}
            >
              <Text style={styles.secondaryButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.preview}>
        {device ? (
          <Camera style={StyleSheet.absoluteFill} device={device} isActive />
        ) : (
          <Text style={styles.status}>
            No camera device found (expected on a simulator). Capture still
            works with the stub recognizer.
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.captureButton}
        onPress={() => {
          // eslint-disable-next-line no-void -- fire-and-forget the async capture
          void onCapture();
        }}
        accessibilityRole="button"
      >
        <Text style={styles.captureButtonText}>Capture</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  preview: {
    flex: 1,
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#00000011',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  deniedBox: {
    alignItems: 'center',
  },
  status: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  captureButton: {
    margin: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#3b5bfd',
    alignItems: 'center',
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#3b5bfd',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
