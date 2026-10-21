/**
 * Push-notification registration + foreground handling.
 *
 *   1. Foreground handler so banners / sounds appear in the open app.
 *   2. OS permission (idempotent).
 *   3. Expo push token stored in `push_tokens` (private per user; the
 *      webapp route /api/notifications/dispatch sends via Expo).
 *   4. Taps route to the matching screen via `data.module`.
 */

import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { useRouter } from 'expo-router'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { setCurrentDeviceToken } from './push-token-store'

export { unregisterPushToken } from './push-token-store'

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
      name: 'LokShift',
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
/** Webapp links in notifications → matching app screens. */
const LINK_ROUTES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^\/dashboard\/plans\/my-week(?:\?date=(\d{4}-\d{2}-\d{2}))?/, (m) => (m[1] ? `/plans/my-week?date=${m[1]}` : '/plans/my-week')],
  [/^\/dashboard\/plans\/week(?:\?date=(\d{4}-\d{2}-\d{2}))?/, (m) => (m[1] ? `/dashboard?date=${m[1]}` : '/dashboard')],
  [/^\/dashboard\/times\/approvals/, () => '/times/verify'],
  [/^\/dashboard\/times\/monthly/, () => '/times/monthly'],
  [/^\/dashboard\/personnel/, () => '/qualifications'],
  [/^\/dashboard\/settings\/qualifications/, () => '/qualifications'],
  [/^\/dashboard\/holiday-bonus/, () => '/bonuses'],
]

export function routeForNotification(data: Record<string, unknown> | null): string | null {
  if (!data) return '/notifications'
  const type = ((data.module ?? data.type) as string) ?? null
  const moduleId = (data.moduleId as string) ?? null
  const link = typeof data.link === 'string' ? data.link : null
  if (link) {
    for (const [re, to] of LINK_ROUTES) {
      const m = link.match(re)
      if (m) return to(m)
    }
  }

  switch (type) {
    case 'chat':
      return moduleId ? `/chat/${moduleId}` : '/(tabs)/chat'
    case 'plans':
      return moduleId ? `/plans/${moduleId}` : '/plans/my-week'
    case 'times':
    case 'time_entries':
      return moduleId ? `/times/${moduleId}` : '/times'
    case 'corrections':
      return '/times/verify'
    case 'personnel':
      return '/qualifications'
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
  const { session, profile } = useUser()
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
        setCurrentDeviceToken(token)

        // register_push_token() moves the token to whoever is signed in on
        // this device now (a plain upsert is blocked by RLS when the
        // previous user didn't sign out, and their pushes would keep
        // arriving here). Best-effort: a missing function on an older
        // server is logged and ignored.
        const { error } = await (supabase as any).rpc('register_push_token', {
          p_token: token,
          p_platform: Platform.OS,
        })
        if (error) {
          lastWrittenToken.current = null
          console.info('[push] token not stored:', error.message)
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
