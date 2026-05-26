// NativeWind requires its babel plugin to live BEFORE the Expo preset's
// jsx transformer can see Tailwind className strings. Reanimated's plugin
// must be LAST per its docs.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
  }
}
