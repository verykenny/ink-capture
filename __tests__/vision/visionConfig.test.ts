/**
 * visionConfig — reads react-native-config's USE_STUB_RECOGNIZER so a developer
 * can force the stub recognizer without a code change.
 *
 * react-native-config is mocked globally (jest.setup.ts) so `Config` is an empty
 * object in tests → the default is "use OCR". This spec mutates that mocked
 * object to exercise the force-stub branch, restoring it afterwards.
 *
 * @format
 */

import Config from 'react-native-config';
import { shouldUseStubRecognizer } from '@services';

type MutableConfig = Record<string, string | undefined>;

describe('visionConfig.shouldUseStubRecognizer', () => {
  afterEach(() => {
    delete (Config as MutableConfig).USE_STUB_RECOGNIZER;
  });

  test('defaults to false (use OCR) when the flag is unset', () => {
    expect(shouldUseStubRecognizer()).toBe(false);
  });

  test('is true when USE_STUB_RECOGNIZER is "true"', () => {
    (Config as MutableConfig).USE_STUB_RECOGNIZER = 'true';
    expect(shouldUseStubRecognizer()).toBe(true);
  });

  test('is true when USE_STUB_RECOGNIZER is "1"', () => {
    (Config as MutableConfig).USE_STUB_RECOGNIZER = '1';
    expect(shouldUseStubRecognizer()).toBe(true);
  });

  test('is false for any other value', () => {
    (Config as MutableConfig).USE_STUB_RECOGNIZER = 'false';
    expect(shouldUseStubRecognizer()).toBe(false);
  });
});
