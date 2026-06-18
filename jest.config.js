module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Shared, non-test helpers (e.g. hand-authored fixtures, the in-memory DB
  // adapter) live under __tests__/ too; exclude them so Jest doesn't run them
  // as empty suites.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/fixtures/',
    '<rootDir>/__tests__/persistence/testDatabase.ts',
  ],
  // The RN preset only transforms react-native / @react-native(-community). The
  // React Navigation stack and its native peers ship ESM, so whitelist them for
  // Babel transformation too — otherwise a full <App /> render (NavigationContainer
  // → native-stack) hits "SyntaxError: Unexpected token 'export'".
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?' +
      '|@react-navigation|react-native-screens|react-native-safe-area-context)/)',
  ],
};
