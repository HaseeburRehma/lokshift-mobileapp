const { withGradleProperties } = require('expo/config-plugins')

// Raises the Gradle/Kotlin JVM limits used during Android builds.
// The Expo template ships -Xmx2048m -XX:MaxMetaspaceSize=512m, and KSP
// (expo-updates) exhausts that 512m metaspace on a release build.
// expo-build-properties exposes no JVM options, and `eas build --local`
// regenerates android/ via prebuild, so gradle.properties has to be
// patched through a config plugin to survive.
const PROPERTIES = {
  'org.gradle.jvmargs': '-Xmx3072m -XX:MaxMetaspaceSize=2048m',
  // These are ceilings, not reservations — the JVM commits only what it uses.
  'kotlin.daemon.jvmargs': '-Xmx2048m -XX:MaxMetaspaceSize=1024m',
  // Serial execution keeps peak footprint survivable on an 8 GB machine.
  'org.gradle.parallel': 'false',
  'org.gradle.workers.max': '2',
}

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === key
      )
      if (existing) {
        existing.value = value
      } else {
        cfg.modResults.push({ type: 'property', key, value })
      }
    }
    return cfg
  })
}
