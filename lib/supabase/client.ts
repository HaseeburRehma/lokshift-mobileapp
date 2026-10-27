/**
 * Supabase client for React Native.
 *
 * Key differences from the webapp client:
 *   1. Session storage uses AsyncStorage (per-app sandbox on iOS/Android,
 *      localStorage on web). Tokens are NOT in the OS Keychain — see the
 *      inline comment above SupabaseStorage for the Mac Catalyst reason.
 *   2. URL polyfill is loaded before supabase-js — RN's stock URL is
 *      missing pieces the Supabase auth code expects.
 *   3. detectSessionInUrl is disabled (no browser callback flow).
 *
 * The URL + anon key MUST match the webapp's Supabase project so RLS,
 * RBAC, and data are shared end-to-end.
 */

import 'react-native-url-polyfill/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { AppState, Platform } from 'react-native'

// Session storage uses AsyncStorage across all platforms — iOS, Android,
// Mac Catalyst, and web. expo-secure-store would be more "secure" (OS
// keychain) on native, but it errors with `errSecDuplicateItem` on Mac
// Catalyst, breaking sign-in for testers running TestFlight builds on
// Apple Silicon Macs. AsyncStorage works identically everywhere; tokens
// live in the app sandbox which is already access-controlled per-app.
const SupabaseStorage = AsyncStorage

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl
  ?? process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey
  ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Hard fail at startup if the env is missing — otherwise every
  // subsequent supabase call would throw a generic "Invalid URL" later
  // that's hard to debug.
  throw new Error(
    '[Supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Copy .env.example to .env and fill in the values.',
  )
}

/**
 * Permissive auth shape covering the methods our screens actually call.
 * The shipped `@supabase/supabase-js` types declare `auth` as a
 * `SupabaseAuthClient` class whose method bag is only partially
 * surfaced in the .d.ts — which causes 30+ TS2339 "Property X does not
 * exist" false positives across the auth screens. Casting to this
 * augmented type at the public boundary makes the editor + tsc happy
 * without touching every call site.
 */
type AuthLike = {
  signInWithPassword: (creds: { email: string; password: string }) => Promise<any>
  signInWithOtp: (params: { email: string; options?: any }) => Promise<any>
  verifyOtp: (params: { email: string; token: string; type: string }) => Promise<any>
  signOut: () => Promise<any>
  resetPasswordForEmail: (email: string, opts?: any) => Promise<any>
  updateUser: (attrs: any) => Promise<any>
  getUser: () => Promise<any>
  getSession: () => Promise<any>
  onAuthStateChange: (cb: (event: string, session: any) => void) => { data: { subscription: { unsubscribe: () => void } } }
  admin?: any
}

export type AppSupabase = Omit<SupabaseClient, 'auth'> & { auth: AuthLike }

let cached: SupabaseClient | null = null

export function getSupabase(): AppSupabase {
  if (cached) return cached as unknown as AppSupabase
  cached = createClient(supabaseUrl as string, supabaseAnonKey as string, {
    // Tells the database this is a current client (see time_entries_normalize:
    // requests without it are treated as the previous app version).
    global: { headers: { 'x-lokshift-client': '2' } },
    auth: {
      storage: SupabaseStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      // RN has no URL-fragment session-recovery flow.
      detectSessionInUrl: false,
    },
  })
  // Supabase's React Native guidance: refresh tokens only while the app is
  // in the foreground and refresh right away when it returns, so a phone
  // that slept for hours resumes with a valid session instead of failing
  // requests with an expired token.
  if (Platform.OS !== 'web') {
    // auth-js 2.69 has both methods; the bundled typings here lack them.
    const auth = cached.auth as unknown as { startAutoRefresh?: () => Promise<void>; stopAutoRefresh?: () => Promise<void> }
    AppState.addEventListener('change', (state) => {
      if (state === 'active') auth.startAutoRefresh?.()
      else auth.stopAutoRefresh?.()
    })
  }
  return cached as unknown as AppSupabase
}
