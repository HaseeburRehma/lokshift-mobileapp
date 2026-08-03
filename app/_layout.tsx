/**
 * Root layout — wraps the entire app in providers and runs the auth /
 * forced-password-change guard.
 *
 * Guard logic (mirrors the webapp middleware):
 *   - No session              → /(auth)/login
 *   - Session, must change pw → /change-password
 *   - Session, otherwise      → /(tabs)/dashboard
 */

import '../global.css'

// IMPORTANT: monitoring init runs at module-load time so the very first
// crash (even one inside a provider's constructor) is captured. Keep
// this above every other import that has runtime side-effects.
import { initMonitoring, setMonitoringUser, addBreadcrumb } from '@/lib/monitoring'
initMonitoring()

import React, { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ActivityIndicator, View } from 'react-native'

import { UserProvider, useUser } from '@/lib/user-context'
import { I18nProvider } from '@/lib/i18n'
import { DrawerProvider } from '@/lib/drawer-context'
import { NotificationsProvider } from '@/lib/notifications-context'
import { usePushRegistration } from '@/lib/notifications/push'
import { useSessionGuard } from '@/lib/session-guard'
import { ThemeProvider, useTheme } from '@/lib/theme'
import { BiometricLockProvider } from '@/lib/biometric/lock-context'
import { AppDrawer } from '@/components/AppDrawer'
import { BiometricLockOverlay } from '@/components/BiometricLockOverlay'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastHost } from '@/components/Toast'

/**
 * Watches the user-context for auth changes and forwards user id + email
 * to the monitoring layer so errors thereafter are correlated with the
 * actual person who hit them.
 */
function MonitoringIdentitySync() {
  const { session, profile } = useUser()
  useEffect(() => {
    const uid = session?.user?.id
    if (uid) {
      setMonitoringUser({ id: uid, email: profile?.email ?? session?.user?.email ?? null })
      addBreadcrumb('session active', { uid }, 'auth')
    } else {
      setMonitoringUser(null)
      addBreadcrumb('session cleared', undefined, 'auth')
    }
  }, [session?.user?.id, profile?.email, session?.user?.email])
  return null
}

/**
 * Mounts the push registration hook inside the authenticated tree so it
 * runs only after the session is known. Rendered as a sibling (returns
 * null) instead of wrapping children to keep the layout tree shallow.
 */
function PushRegistrar() {
  usePushRegistration()
  return null
}

/**
 * Mounted inside AuthGuard so the auth event listener attaches only
 * once after the session resolves. Forces routing back to /login when
 * the Supabase session dies under us (token revoked / password changed
 * elsewhere / refresh window exceeded).
 */
function SessionGuardRunner() {
  useSessionGuard()
  return null
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, ready, profileLoading, session, profile, role } = useUser()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const first = segments[0]
    const last = segments[segments.length - 1]
    const inAuthGroup = first === '(auth)'
    const onPasswordChange = first === 'change-password'
    const onOnboarding = first === 'onboarding'
    // Screens where the user MUST stay even after verifyOtp creates a
    // session — forgot-password finishes setting a password inline, and
    // an eager redirect to /home would strand them without a real password.
    // Register is intentionally NOT included here — the mobile app no
    // longer allows account creation (Apple 3.1.1 compliance); the screen
    // just shows an info page.
    const onPasswordFlow = last === 'forgot-password'

    if (!session) {
      // Unauthenticated — only the (auth) group is allowed. Defence-in-
      // depth: even if the file the user navigates to is mistakenly
      // outside (auth), we redirect here.
      if (!inAuthGroup) router.replace('/(auth)/login')
      return
    }

    // Session present but profile hasn't been validated yet — don't make
    // any routing decisions. Wait. (Once profile validation finishes,
    // user-context either flips `ready=true` or signs the session out,
    // and this effect re-fires.)
    if (!ready) return

    // Authenticated and profile valid. Must change password takes
    // precedence over everything.
    const mustChange = !!profile?.must_change_password
    if (mustChange && !onPasswordChange) {
      router.replace('/change-password')
      return
    }

    // First-login onboarding — only employees that haven't completed it
    // are routed here, mirroring the webapp's middleware §6.A.
    const needsOnboarding = role === 'employee' && profile?.onboarding_completed === false
    if (!mustChange && needsOnboarding && !onOnboarding) {
      router.replace('/onboarding')
      return
    }

    // Kick authenticated users out of stale auth screens — but NEVER out
    // of a live password-setting flow (register/forgot-password), because
    // those screens finish the login handshake with a password.
    if (!mustChange && !needsOnboarding && !onPasswordFlow && (inAuthGroup || onPasswordChange || onOnboarding)) {
      router.replace('/(tabs)/home')
    }
  }, [
    loading,
    ready,
    session,
    profile?.must_change_password,
    profile?.onboarding_completed,
    role,
    segments,
    router,
  ])

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-brand">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }

  // Session in storage but profile not yet validated — block render so
  // a stale session can't paint authed UI before user-context decides
  // whether to keep it or sign out.
  if (session && profileLoading && !ready) {
    return (
      <View className="flex-1 items-center justify-center bg-brand">
        <ActivityIndicator color="#fff" size="large" />
      </View>
    )
  }
  return <>{children}</>
}

function ThemedStatusBar() {
  const { scheme } = useTheme()
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
}

export default function RootLayout() {
  return (
    // Top-level ErrorBoundary so a render crash anywhere in the tree —
    // including providers below — shows a recovery screen and ships the
    // error to monitoring instead of the RN red-box.
    <ErrorBoundary boundary="root">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <I18nProvider>
              <UserProvider>
                <MonitoringIdentitySync />
                <BiometricLockProvider>
                  <NotificationsProvider>
                    <DrawerProvider>
                    <AuthGuard>
                      <PushRegistrar />
                      <SessionGuardRunner />
                      {/* A second ErrorBoundary scopes route-level crashes so
                          one broken screen doesn't tear down the providers
                          (tab bar, drawer, biometric lock) above it. */}
                      <ErrorBoundary boundary="screen">
                        <Stack screenOptions={{ headerShown: false }}>
                          <Stack.Screen name="(auth)" />
                          <Stack.Screen name="(tabs)" />
                          <Stack.Screen name="change-password" />
                          <Stack.Screen name="onboarding" />
                        </Stack>
                      </ErrorBoundary>
                      {/* Drawer is rendered at the root so it's reachable from any
                          authenticated screen, not just tab routes. It's a Modal
                          so it overlays everything above it. */}
                      <AppDrawer />
                      {/* Lock overlay sits above everything (zIndex 9999) so
                          it covers the tab bar, drawer, and any open modal. */}
                      <BiometricLockOverlay />
                      {/* Toasts sit just below the lock overlay (zIndex 99999)
                          so they're visible over every screen — including
                          modals — without blocking the lock itself. */}
                      <ToastHost />
                      <ThemedStatusBar />
                    </AuthGuard>
                    </DrawerProvider>
                  </NotificationsProvider>
                </BiometricLockProvider>
              </UserProvider>
            </I18nProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  )
}
