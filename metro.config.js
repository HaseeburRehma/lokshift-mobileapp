const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// pnpm hoists packages via symlinks. Expo's default Metro resolver
// handles symlinks natively as of SDK 54, so we do NOT set
// `resolver.unstable_enableSymlinks` (expo-doctor flags it as unsafe).
// We still add the `.pnpm` directory to nodeModulesPaths as a fallback
// for transitive peer-dependency lookups that occasionally miss when
// the peer sits in a nested `.pnpm/<peer>@<ver>/` layer.
config.resolver = config.resolver || {}
config.resolver.unstable_enablePackageExports = true
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, 'node_modules/.pnpm'),
]
// Make sure Metro watches the pnpm store too so changes to a freshly
// installed peer-dep are picked up without a manual cache clear.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, 'node_modules/.pnpm'),
]

module.exports = withNativeWind(config, { input: './global.css' })
