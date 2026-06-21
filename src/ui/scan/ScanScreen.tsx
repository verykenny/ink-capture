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
 * Sharpness is everything for OCR, so the preview selects a **multi-camera device
 * including the ultra-wide lens** (which autofocuses far closer than the wide
 * lens — the iPhone's macro path), supports **tap-to-focus** (with a brief
 * reticle) and **pinch-to-zoom** (pinch out engages the ultra-wide for close-up
 * macro), and **autofocuses the centre before every capture** so a soft frame
 * doesn't starve the recogniser.
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
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { unlink } from '@dr.pogodin/react-native-fs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { decideRecognition } from '@domain';
import { useAppServices } from '@state';
import type { RootStackParamList } from '../navigationTypes';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

interface FocusPoint {
  x: number;
  y: number;
}

const RETICLE_SIZE = 72;
const RETICLE_MS = 900;

export function ScanScreen({ navigation }: Props): React.JSX.Element {
  const { recognizer } = useAppServices();
  const { hasPermission, requestPermission } = useCameraPermission();
  // Prefer a multi-camera device that includes the ultra-wide lens: on recent
  // iPhones the ultra-wide autofocuses much closer (macro), so a card held near
  // the phone can actually be focused — the plain wide lens cannot focus that
  // close. vision-camera engages the ultra-wide at <=1x zoom, so pinch-zoom out
  // for the closest macro focus.
  const device = useCameraDevice('back', {
    physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera'],
  });
  const cameraRef = useRef<Camera>(null);
  const capturing = useRef(false);
  const previewSize = useRef<{ width: number; height: number } | null>(null);
  const reticleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [didRequest, setDidRequest] = useState(false);
  const [reticle, setReticle] = useState<FocusPoint | null>(null);

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

  // Clear any pending reticle timer on unmount.
  useEffect(
    () => () => {
      if (reticleTimer.current) {
        clearTimeout(reticleTimer.current);
      }
    },
    [],
  );

  /** Focus the camera at a view-space point. Best-effort: focus can reject if the
   * device is busy or the point is invalid, and a failed focus must never block a
   * capture. Resolves to nothing whether or not focus is supported. */
  const focusAt = useCallback(
    async (point: FocusPoint): Promise<void> => {
      const camera = cameraRef.current;
      if (!camera || !device?.supportsFocus) {
        return;
      }
      await camera.focus(point).catch(() => undefined);
    },
    [device],
  );

  const onPreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    previewSize.current = { width, height };
  }, []);

  const onFocusTap = useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      const point = { x: locationX, y: locationY };
      setReticle(point);
      if (reticleTimer.current) {
        clearTimeout(reticleTimer.current);
      }
      reticleTimer.current = setTimeout(() => setReticle(null), RETICLE_MS);
      // eslint-disable-next-line no-void -- best-effort focus; errors are swallowed
      void focusAt(point);
    },
    [focusAt],
  );

  const onCapture = useCallback(async () => {
    const camera = cameraRef.current;
    // Ignore taps with no camera and re-entrant taps while a capture is in
    // flight (a rapid double-tap would otherwise push Confirm twice).
    if (!camera || capturing.current) {
      return;
    }
    capturing.current = true;
    let path: string | undefined;
    try {
      // Autofocus the centre and let it settle before the still — a blurry frame
      // is the #1 cause of a missed read. Best-effort; capture proceeds regardless.
      const size = previewSize.current;
      if (size) {
        await focusAt({ x: size.width / 2, y: size.height / 2 });
      }
      const photo = await camera.takePhoto();
      path = photo.path;
      const result = await recognizer.recognize({
        uri: `file://${photo.path}`,
      });
      // Gate the read through the D2 routing policy so a low-confidence or
      // ambiguous scan never silently asserts the wrong #1: confident → confirm
      // it directly; ambiguous → a top-N manual pick (seeded with the candidates,
      // so the right same-number card — the Boun case — is on offer); none → an
      // empty manual search.
      const decision = decideRecognition(result);
      switch (decision.kind) {
        case 'confident':
          navigation.navigate('Confirm', {
            card: decision.candidate.card,
            confidence: decision.candidate.confidence,
          });
          break;
        case 'ambiguous':
          navigation.navigate('CardSearch', { seed: decision.candidates });
          break;
        case 'none':
          // Nothing read — route to manual search with no-match context so the
          // empty box explains why the user landed here.
          navigation.navigate('CardSearch', { reason: 'no-match' });
          break;
      }
    } finally {
      if (path !== undefined) {
        // Best-effort: delete the captured still so card photos don't linger on
        // disk. Cleanup failure must not mask the recognition result.
        //
        // Ordering invariant: this unlink runs only AFTER `recognize` above has
        // resolved, and the OCR engine reads the file fully (synchronously) before
        // its async recognition completes — so the still always outlives the read.
        // Do NOT hoist this delete to run concurrently with recognition: that would
        // race the engine's file read and is NOT the cause of the repeated-capture
        // failure (a native recognizer-resource leak was — see the D1 OCR engine).
        await unlink(path).catch(() => undefined);
      }
      capturing.current = false;
    }
  }, [recognizer, navigation, focusAt]);

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
      <View
        style={styles.preview}
        onLayout={onPreviewLayout}
        testID="cameraPreview"
      >
        {device ? (
          <>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive
              photo
              enableZoomGesture
            />
            <View style={styles.guide} pointerEvents="none">
              <View style={styles.guideBox} />
            </View>
            <View
              style={StyleSheet.absoluteFill}
              onTouchEnd={onFocusTap}
              testID="focusTarget"
            />
            {reticle ? (
              <View
                pointerEvents="none"
                style={[
                  styles.reticle,
                  {
                    left: reticle.x - RETICLE_SIZE / 2,
                    top: reticle.y - RETICLE_SIZE / 2,
                  },
                ]}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.status}>
            No camera device found (expected on a simulator). Connect a device
            to scan a card.
          </Text>
        )}
      </View>

      {device ? (
        <>
          <Text style={styles.hint}>
            Tap the card to focus · pinch to zoom (pinch out for close-up macro)
            · hold steady.
          </Text>
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
        </>
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
  guide: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBox: {
    width: '74%',
    height: '82%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 14,
  },
  reticle: {
    position: 'absolute',
    width: RETICLE_SIZE,
    height: RETICLE_SIZE,
    borderRadius: RETICLE_SIZE / 2,
    borderWidth: 2,
    borderColor: '#ffd24a',
  },
  deniedBox: {
    alignItems: 'center',
  },
  status: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
  },
  hint: {
    textAlign: 'center',
    fontSize: 13,
    opacity: 0.6,
    marginHorizontal: 16,
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
