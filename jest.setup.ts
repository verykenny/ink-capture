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
// the native binary. Persistence tests exercise REAL SQLite through the
// better-sqlite3 driver seam, so this mock only satisfies the import — it is
// never the engine under test.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => ({
    execute: jest.fn(async () => ({ rows: [], rowsAffected: 0 })),
    close: jest.fn(),
  })),
}));
