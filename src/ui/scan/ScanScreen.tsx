/**
 * ScanScreen — camera capture, the entry point of the scan→confirm→save loop.
 *
 * Carries over A1's camera-permission probe + live back-camera preview, and adds
 * a real Capture action: it takes a still with `camera.takePhoto()`, runs the
 * injected `CardRecognizer` over the captured file, pushes the Confirm route with
 * the result, and then deletes the temp still (privacy + storage) in a `finally`.
 * D1's OcrCardRecognizer reads the still with ML Kit; the C2 stub ignores the URI
 * — either satisfies the same interface. Confidence is never thresholded here:
 * the user always confirms on the next screen, so a low-confidence (or empty)
 * read still routes to Confirm.
 *
 * Capture needs a real camera device, so it is offered only when one is present
 * (a simulator reports none); the preview area explains the no-device case.
 *
 * @format
 */

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { unlink } from '@dr.pogodin/react-native-fs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export function ScanScreen({ navigation }: Props): React.JSX.Element {
  const { recognizer } = useAppServices();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);
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
    const camera = cameraRef.current;
    if (!camera) {
      return;
    }
    const photo = await camera.takePhoto();
    try {
      const result = await recognizer.recognize({
        uri: `file://${photo.path}`,
      });
      navigation.navigate('Confirm', { result });
    } finally {
      // Best-effort: delete the captured still so card photos don't linger on
      // disk. Cleanup failure must not mask the recognition result.
      await unlink(photo.path).catch(() => undefined);
    }
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
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            photo
          />
        ) : (
          <Text style={styles.status}>
            No camera device found (expected on a simulator). Connect a device
            to scan a card.
          </Text>
        )}
      </View>

      {device ? (
        <TouchableOpacity
          style={styles.captureButton}
          onPress={() => {
            // Fire-and-forget: cleanup runs in onCapture's finally; surfacing a
            // capture/recognition failure is E2. The catch keeps a hard error
            // from becoming an unhandled rejection.
            // eslint-disable-next-line no-void -- fire-and-forget the async capture
            void onCapture().catch(() => undefined);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.captureButtonText}>Capture</Text>
        </TouchableOpacity>
      ) : null}
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
