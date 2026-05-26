const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// pnpm stores packages under node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>
// and links the top-level ones via symlinks. Metro doesn't follow symlinks
// by default, and even when it does (unstable_enableSymlinks), nested
// peer-dependency resolutions sometimes can't find their transitive
// modules because pnpm hides them behind another `.pnpm/<peer>@<ver>/`
// layer. Adding the `.pnpm` directory to `nodeModulesPaths` makes Metro
// also search there as a fallback, which fixes the resolution gap.
config.resolver = config.resolver || {}
config.resolver.unstable_enableSymlinks = true
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
