module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Shared, non-test helpers (e.g. hand-authored fixtures) live under
  // __tests__/ too; exclude them so Jest doesn't run them as empty suites.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/fixtures/'],
};
