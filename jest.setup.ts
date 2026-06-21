// @testing-library/react-native v12.4+ auto-registers its Jest matchers (e.g.
// toBeOnTheScreen) when the library is imported, so no extend-expect import is
// needed — the deprecated @testing-library/jest-native package is not used.

// react-native-vision-camera is a native module; mock it so App renders in Jest.
jest.mock('react-native-vision-camera', () => ({
  Camera: () => null,
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: jest.fn(),
  }),
  useCameraDevice: () => undefined,
}));

// @op-engineering/op-sqlite is a native (JSI) module; mock it so any transitive
// import of the production adapter (OpSqliteDatabase) resolves in Jest without
// the native binary. Persistence tests exercise REAL SQLite through Node's
// built-in node:sqlite (the TestSqliteDatabase seam), so this mock only
// satisfies the import — op-sqlite is never the engine under test.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rows: [], rowsAffected: 0 })),
    close: jest.fn(),
  })),
}));

// react-native-safe-area-context's real SafeAreaProvider withholds its children
// until an onLayout delivers frame metrics — an event that never fires in Jest,
// so a full <App /> render would mount the provider with no descendants. Its
// shipped jest mock supplies static metrics and renders children synchronously.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// @dr.pogodin/react-native-fs is a native module; mock it so ScanScreen's
// temp-file cleanup (unlink of the captured still) resolves in Jest without
// touching the filesystem.
jest.mock('@dr.pogodin/react-native-fs', () => ({
  __esModule: true,
  unlink: jest.fn(() => Promise.resolve()),
}));

// @react-native-ml-kit/text-recognition is a native module; mock it so any
// transitive import of MlKitOcrEngine (via the @services barrel) resolves in
// Jest without the native binary. D1's parser + recognizer are tested against a
// FAKE OcrEngine, so this mock only satisfies the import — its recognize() is
// never the unit under test and simply returns an empty result.
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  __esModule: true,
  default: { recognize: jest.fn(async () => ({ text: '', blocks: [] })) },
  TextRecognitionScript: { LATIN: 'Latin' },
}));

// react-native-config surfaces native build-time env vars to JS; in Jest there
// is no native layer, so mock its default export as an empty Config object.
// Config.X is therefore undefined and catalogConfig falls back to the code
// default (DEFAULT_CATALOG_BASE_URL). catalogConfig.test.ts mutates this object
// to exercise the override branch.
jest.mock('react-native-config', () => ({ __esModule: true, default: {} }));
