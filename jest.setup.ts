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
