/**
 * This device's Expo push token, kept outside push.ts so user-context can
 * remove it on sign-out without an import cycle (push.ts imports
 * user-context for the registration hook).
 */

import { getSupabase } from '@/lib/supabase/client'

let currentDeviceToken: string | null = null

export function setCurrentDeviceToken(token: string | null) {
  currentDeviceToken = token
}

/** Removes this device's token before sign-out so the next user on a shared phone gets no pushes for the old account. */
export async function unregisterPushToken(): Promise<void> {
  if (!currentDeviceToken) return
  try {
    await getSupabase().from('push_tokens').delete().eq('token', currentDeviceToken)
  } catch {
    // best-effort
  }
  currentDeviceToken = null
}
