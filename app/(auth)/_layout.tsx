/**
 * Auth group layout. Mirrors the webapp's `app/(auth)/layout.tsx` —
 * blue background on the login page, white on register/forgot. Each
 * screen sets its own background; we just disable headers and provide
 * a sensible default.
 */

import { Stack, useSegments } from 'expo-router'

export default function AuthLayout() {
  const segments = useSegments()
  // The last segment is the screen name within the (auth) group.
  const screen = segments[segments.length - 1]
  const isBlueBg = screen === 'login' || screen === 'forgot-password'
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: isBlueBg ? '#0064E0' : '#FFFFFF' },
      }}
    />
  )
}

