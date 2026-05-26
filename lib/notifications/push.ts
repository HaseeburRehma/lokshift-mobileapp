/**
 * Push-notification registration + foreground handling.
 *
 * This module covers the **mobile side** of the pipeline:
 *   1. Configure the foreground notification handler so banners /
 *      sounds appear when the app is in the foreground.
 *   2. Request OS notification permission (idempotent).
 *   3. Fetch the Expo push token and persist it onto the user's
 *      profile (`profiles.push_token`).
 *   4. Subscribe to incoming notification responses and route the
 *      user to the right screen based on the `type` and `data` fields
 *      that the backend writes into the notification payload.
 *
 * **Backend gap (out of scope for mobile):**
 *   - The webapp doesn't ship a push dispatcher today. To make the
 *     pipeline fire end-to-end, an Edge Function (or a Postgres
 *     trigger via pg_net) needs to listen for INSERT on the
 *     `notifications` table, look up the recipient's
 *     `profiles.push_token`, and POST to
 *     https://exp.host/--/api/v2/push/send.
 *   - The `push_token` column also needs to exist on `profiles`.
 *     Until that migration ships, the token write here fails silently
 *     and the rest of the app keeps working.
 */

import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

let foregroundHandlerSet = false
function configureForegroundHandler() {
  if (foregroundHandlerSet) return
  foregroundHandlerSet = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      // SDK 50+ field names; harmless on older SDKs.
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

/**
 * Read both the older `granted` boolean shape and the newer `status`
 * enum shape so we work regardless of which expo-modules-core version
 * the dep tree happens to resolve to.
 */
function permissionIsGranted(
  resp: { status?: string; granted?: boolean } | null | undefined,
): boolean {
  if (!resp) return false
  if (resp.granted === true) return true
  if (resp.status === 'granted') return true
  return false
}

async function ensurePermission(): Promise<boolean> {
  const existing = (await Notifications.getPermissionsAsync()) as unknown as {
    status?: string
    granted?: boolean
  }
  if (permissionIsGranted(existing)) return true
  const next = (await Notifications.requestPermissionsAsync()) as unknown as {
    status?: string
    granted?: boolean
  }
  return permissionIsGranted(next)
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lokshift',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      lightColor: '#0064E0',
      vibrationPattern: [0, 250, 250, 250],
    })
  } catch {
    // Channel set-up failures shouldn't block the user — push falls back to default.
  }
}

async function getExpoPushToken(): Promise<string | null> {
  try {
    const projectId =
      (Constants.expoConfig as any)?.extra?.eas?.projectId ??
      (Constants.easConfig as any)?.projectId ??
      undefined
    const tokenInfo = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return tokenInfo?.data ?? null
  } catch (e) {
    console.warn('[push] failed to get Expo push token (non-fatal):', e)
    return null
  }
}

/**
 * Resolve a notification payload to an in-app route. Mirrors the
 * `type` values the existing notifications callers in the codebase
 * already use (`plans`, `chat`, `times`, `absence`, etc).
 */
function routeForNotification(data: Record<string, unknown> | null): string | null {
  if (!data) return '/notifications'
  const type = (data.type as string) ?? null
  const moduleId = (data.moduleId as string) ?? null

  switch (type) {
    case 'chat':
      return moduleId ? `/chat/${moduleId}` : '/(tabs)/chat'
    case 'plans':
      return moduleId ? `/plans/${moduleId}` : '/plans'
    case 'times':
      return '/times'
    case 'absence':
      return '/absences'
    case 'per-diem':
    case 'per_diem':
      return '/per-diem'
    case 'bonuses':
      return '/bonuses'
    default:
      return '/notifications'
  }
}

/**
 * React hook mounted at the root layout. Registers the device once the
 * user is signed in and tears down listeners on sign-out.
 */
export function usePushRegistration() {
  const router = useRouter()
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const supabase = getSupabase()
  const lastWrittenToken = useRef<string | null>(null)

  useEffect(() => {
    configureForegroundHandler()
    ensureAndroidChannel()
  }, [])

  useEffect(() => {
    if (!myId) {
      lastWrittenToken.current = null
      return
    }

    let cancelled = false
    const register = async () => {
      try {
        const granted = await ensurePermission()
        if (!granted) return

        // Physical-device check: emulators / simulators don't have a
        // working push transport. Expo returns null in that case
        // anyway, so we just no-op silently.
        const token = await getExpoPushToken()
        if (!token || cancelled) return

        if (lastWrittenToken.current === token) return
        lastWrittenToken.current = token

        // Best-effort write. If the column doesn't exist yet on the
        // deployed DB (see "backend gap" in the file header), Supabase
        // returns a 400-level error which we swallow so the app keeps
        // working. Once the migration ships, this becomes the real
        // delivery channel.
        const { error } = await supabase
          .from('profiles')
          .update({
            push_token: token,
            push_token_platform: Platform.OS,
            push_token_updated_at: new Date().toISOString(),
          } as any)
          .eq('id', myId)
        if (error) {
          console.info(
            '[push] token persistence skipped — backend migration may be missing:',
            error.message,
          )
        }
      } catch (e) {
        console.warn('[push] registration failed (non-fatal):', e)
      }
    }
    register()

    return () => {
      cancelled = true
    }
  }, [supabase, myId])

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data =
        (response.notification.request.content.data as Record<string, unknown>) ??
        null
      const route = routeForNotification(data)
      if (route) {
        try {
          router.push(route as any)
        } catch (e) {
          console.warn('[push] route failed:', e)
        }
      }
    })

    // Some users tap the notification before the app has fully booted —
    // expo-notifications surfaces this via getLastNotificationResponseAsync.
    Notifications.getLastNotificationResponseAsync()
      .then((res) => {
        if (!res) return
        const data =
          (res.notification.request.content.data as Record<string, unknown>) ??
          null
        const route = routeForNotification(data)
        if (route) {
          try {
            router.push(route as any)
          } catch {}
        }
      })
      .catch(() => {})

    return () => sub.remove()
  }, [router])
}
