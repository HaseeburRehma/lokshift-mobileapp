/**
 * Crash / error monitoring layer — Sentry by default, but the consumer
 * surface (`initMonitoring`, `captureError`, `setMonitoringUser`,
 * `addBreadcrumb`) is provider-agnostic so we can swap to Bugsnag /
 * Datadog / etc. by editing only this file.
 *
 *   Install:    pnpm add @sentry/react-native
 *   Env:        EXPO_PUBLIC_SENTRY_DSN=https://… (from sentry.io)
 *   Activate:   add `Sentry.init` runs automatically once DSN + package
 *               are present. Until both are set up the module no-ops
 *               and just logs to the console, so this code is safe to
 *               land before the install step.
 *
 * Tagging strategy:
 *   - user.id + user.email set after login (cleared on logout)
 *   - release tag = app version from app.json (resolved via Constants)
 *   - environment tag = `production` for prod builds, `development` for
 *     `__DEV__` / Expo Go
 */

// We deliberately use `require` and try/catch so the codebase remains
// type-safe (`tsc --noEmit` doesn't need the package installed) and the
// runtime no-ops cleanly if monitoring isn't set up yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sentry: any = null
let _initialized = false

function loadSentry(): any | null {
  if (_sentry) return _sentry
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _sentry = require('@sentry/react-native')
    return _sentry
  } catch {
    return null
  }
}

function getAppVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants').default
    return (
      Constants?.expoConfig?.version ||
      Constants?.manifest?.version ||
      Constants?.manifest2?.extra?.expoClient?.version ||
      'unknown'
    )
  } catch {
    return 'unknown'
  }
}

export function initMonitoring(): void {
  if (_initialized) return
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) {
    // Silent in production builds — adding noise here would clutter
    // user-visible console logs on devices.
    if (__DEV__) {
      console.log('[monitoring] EXPO_PUBLIC_SENTRY_DSN not set — running without crash reporting')
    }
    return
  }
  const sentry = loadSentry()
  if (!sentry) {
    if (__DEV__) {
      console.warn(
        '[monitoring] @sentry/react-native not installed — DSN present but crash reporting is offline.\n' +
          '  Fix:  pnpm add @sentry/react-native',
      )
    }
    return
  }
  try {
    sentry.init({
      dsn,
      release: `locshift-mobile@${getAppVersion()}`,
      environment: __DEV__ ? 'development' : 'production',
      // Performance traces are opt-in and noisy by default. Start at
      // 10% sample so the client doesn't get billed for chatter; tune
      // once we know what the real volume looks like.
      tracesSampleRate: __DEV__ ? 0 : 0.1,
      // Avoid sending breadcrumbs for every console.log — too noisy.
      enableAutoSessionTracking: true,
      // Never ship the raw error message verbatim if it contains PII.
      // The `beforeSend` hook lets us scrub. For now we just pass through
      // — wire in scrubbing if the privacy review flags anything.
      beforeSend: (event: any) => event,
      // Don't initialise in Expo Go — the native pieces aren't linked
      // there so errors fall back to the JS layer anyway, and the SDK
      // logs warnings every render. `enableNative` defaults to true on
      // standalone builds.
      enableNative: !__DEV__,
    })
    _initialized = true
    if (__DEV__) console.log('[monitoring] Sentry initialised')
  } catch (err) {
    if (__DEV__) console.warn('[monitoring] init failed:', err)
  }
}

/**
 * Manually report an error with optional context (will appear under
 * "Additional Data" in the Sentry issue). Use this in catch blocks
 * around critical paths: payments, exports, API calls that must work.
 */
export function captureError(
  err: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown>; message?: string },
): void {
  if (!_initialized || !_sentry) {
    // Fall back to console — at least the error isn't silently swallowed
    // in development.
    if (__DEV__) {
      console.error('[monitoring fallback]', context?.message ?? 'error', err, context)
    }
    return
  }
  try {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([k, v]) => _sentry.setTag(k, v))
    }
    if (context?.extra) {
      Object.entries(context.extra).forEach(([k, v]) => _sentry.setExtra(k, v))
    }
    _sentry.captureException(err)
  } catch {
    // never let monitoring crash the caller
  }
}

/**
 * Drop a navigation/UI breadcrumb. Helps reconstruct what the user
 * tapped right before a crash.
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category: 'navigation' | 'ui' | 'auth' | 'data' = 'ui',
): void {
  if (!_initialized || !_sentry) return
  try {
    _sentry.addBreadcrumb({ message, category, data, level: 'info' })
  } catch {
    // never let monitoring crash the caller
  }
}

/** Identify the logged-in user so errors can be correlated. */
export function setMonitoringUser(user: { id: string; email?: string | null } | null): void {
  if (!_initialized || !_sentry) return
  try {
    if (user) {
      _sentry.setUser({ id: user.id, email: user.email ?? undefined })
    } else {
      _sentry.setUser(null)
    }
  } catch {
    // never let monitoring crash the caller
  }
}
