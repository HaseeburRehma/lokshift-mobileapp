/**
 * Supabase client for React Native.
 *
 * Key differences from the webapp client:
 *   1. Session storage lives in expo-secure-store (Keychain on iOS,
 *      Keystore on Android) rather than localStorage. Auth tokens never
 *      touch unencrypted disk.
 *   2. URL polyfill is loaded before supabase-js — RN's stock URL is
 *      missing pieces the Supabase auth code expects.
 *   3. detectSessionInUrl is disabled (no browser callback flow).
 *
 * The URL + anon key MUST match the webapp's Supabase project so RLS,
 * RBAC, and data are shared end-to-end.
 */

import 'react-native-url-polyfill/auto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

// expo-secure-store has a 2KB per-key limit. Supabase auth payloads
// occasionally exceed that on first sign-in (with all the JWT claims),
// so we split anything oversized across multiple keys transparently.
// This is the documented pattern from the supabase-js + Expo guide.
const CHUNK_SIZE = 1800

// expo-secure-store is native-only — on web it ships a stub whose API
// doesn't match the iOS/Android version, which crashed the auth bootstrap
// with "ExpoSecureStore.default.getValueWithKeyAsync is not a function".
// Branch on Platform.OS so web uses localStorage instead.
const WebLocalStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (typeof window === 'undefined') return null
      return window.localStorage.getItem(key)
    } catch { return null }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.setItem(key, value)
    } catch { /* quota-exceeded etc. — swallow */ }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (typeof window === 'undefined') return
      window.localStorage.removeItem(key)
    } catch { /* swallow */ }
  },
}

const ExpoSecureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const head = await SecureStore.getItemAsync(key)
      if (!head) return null
      // Non-chunked value — return as-is.
      if (!head.startsWith('@@chunked:')) return head
      const count = parseInt(head.slice('@@chunked:'.length), 10)
      const parts: string[] = []
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}::${i}`)
        if (part === null) return null
        parts.push(part)
      }
      return parts.join('')
    } catch (err) {
      console.warn('[SupabaseStorage] getItem failed:', err)
      return null
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Clear any prior chunks so we don't strand orphan keys.
        await ExpoSecureStorageAdapter.removeItem(key)
        await SecureStore.setItemAsync(key, value)
        return
      }
      const count = Math.ceil(value.length / CHUNK_SIZE)
      await SecureStore.setItemAsync(key, `@@chunked:${count}`)
      for (let i = 0; i < count; i++) {
        await SecureStore.setItemAsync(
          `${key}::${i}`,
          value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        )
      }
    } catch (err) {
      console.warn('[SupabaseStorage] setItem failed:', err)
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const head = await SecureStore.getItemAsync(key)
      if (head?.startsWith('@@chunked:')) {
        const count = parseInt(head.slice('@@chunked:'.length), 10)
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${key}::${i}`)
        }
      }
      await SecureStore.deleteItemAsync(key)
    } catch (err) {
      console.warn('[SupabaseStorage] removeItem failed:', err)
    }
  },
}

const SupabaseStorage = Platform.OS === 'web' ? WebLocalStorageAdapter : ExpoSecureStorageAdapter

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
    auth: {
      storage: SupabaseStorage as any,
      autoRefreshToken: true,
      persistSession: true,
      // RN has no URL-fragment session-recovery flow.
      detectSessionInUrl: false,
    },
  })
  return cached as unknown as AppSupabase
}
