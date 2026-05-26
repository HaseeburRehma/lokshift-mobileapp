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
import { ThemeProvider, useTheme } from '@/lib/theme'
import { BiometricLockProvider } from '@/lib/biometric/lock-context'
import { AppDrawer } from '@/components/AppDrawer'
import { BiometricLockOverlay } from '@/components/BiometricLockOverlay'

/**
 * Mounts the push registration hook inside the authenticated tree so it
 * runs only after the session is known. Rendered as a sibling (returns
 * null) instead of wrapping children to keep the layout tree shallow.
 */
function PushRegistrar() {
  usePushRegistration()
  return null
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { loading, session, profile, role } = useUser()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (loading) return
    const first = segments[0]
    const inAuthGroup = first === '(auth)'
    const onPasswordChange = first === 'change-password'
    const onOnboarding = first === 'onboarding'

    if (!session) {
      // Unauthenticated — only the (auth) group is allowed.
      if (!inAuthGroup) router.replace('/(auth)/login')
      return
    }

    // Authenticated. Must change password takes precedence over everything.
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

    if (!mustChange && !needsOnboarding && (inAuthGroup || onPasswordChange || onOnboarding)) {
      router.replace('/(tabs)/home')
    }
  }, [loading, session, profile?.must_change_password, profile?.onboarding_completed, role, segments, router])

  if (loading) {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <UserProvider>
              <BiometricLockProvider>
                <NotificationsProvider>
                  <DrawerProvider>
                  <AuthGuard>
                    <PushRegistrar />
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="change-password" />
                      <Stack.Screen name="onboarding" />
                    </Stack>
                    {/* Drawer is rendered at the root so it's reachable from any
                        authenticated screen, not just tab routes. It's a Modal
                        so it overlays everything above it. */}
                    <AppDrawer />
                    {/* Lock overlay sits above everything (zIndex 9999) so
                        it covers the tab bar, drawer, and any open modal. */}
                    <BiometricLockOverlay />
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
  )
}
