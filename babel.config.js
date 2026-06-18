module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./'],
        alias: {
          '@domain': './src/domain',
          '@services': './src/services',
          '@state': './src/state',
          '@ui': './src/ui',
          '@lib': './src/lib',
        },
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    ],
  ],
};
