/**
 * "Angemeldet bleiben" (stay signed in) for the app.
 *
 *   checked (default) → the session is kept on the device and refreshed
 *                       silently; the user stays signed in until they log out
 *   unchecked         → the session ends when the app is started fresh
 *                       (closed or ended by the system), not when the user
 *                       merely switches apps, takes a photo or answers a call
 *
 * Previously an unchecked box signed the user out on every switch to the
 * background, which also hit the photo picker and incoming calls.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSupabase } from '@/lib/supabase/client'

export const REMEMBER_KEY = 'lokshift.remember'

export async function saveRememberChoice(remember: boolean): Promise<void> {
  await AsyncStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false')
}

let coldStartHandled = false

/**
 * Run once per app process, before the auth guard routes: a session from a
 * previous run without "stay signed in" is ended. Sign-ins during this run
 * are untouched (the check never runs twice).
 */
export async function enforceRememberChoiceOnColdStart(): Promise<void> {
  if (coldStartHandled) return
  coldStartHandled = true
  try {
    if ((await AsyncStorage.getItem(REMEMBER_KEY)) === 'false') {
      await getSupabase().auth.signOut()
    }
  } catch {
    // Storage unavailable: keep the session rather than locking the user out.
  }
}
