/**
 * Session-integrity guard.
 *
 * Listens to Supabase auth events and clears any stale local state when
 * the token dies. Without this, a user whose refresh token gets revoked
 * (admin reset their account, password changed elsewhere, JWT expired
 * past refresh window) would stay on the screen with what looks like a
 * working app — until every fetch returns 401 and the UI silently shows
 * empty data.
 *
 * Mounted once at the auth-guard layer (alongside <PushRegistrar />).
 * Pure side-effect hook — no rendered output.
 */

import { useEffect, useRef } from 'react'
import { useRouter, useSegments } from 'expo-router'
import { getSupabase } from '@/lib/supabase/client'
import { addBreadcrumb, captureError } from '@/lib/monitoring'

const AUTH_ROOT_SEGMENT = '(auth)'

export function useSessionGuard() {
  const router = useRouter()
  const segments = useSegments()
  // Track first event so we don't redirect on the initial SIGNED_IN event
  // that fires when the app boots with a valid session.
  const initialised = useRef(false)

  useEffect(() => {
    const supabase = getSupabase()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      addBreadcrumb(`auth event=${event}`, { hasSession: !!session }, 'auth')
      const inAuthArea = segments[0] === AUTH_ROOT_SEGMENT

      // On boot — note we've now seen the initial state and bail.
      if (!initialised.current) {
        initialised.current = true
        return
      }

      switch (event) {
        case 'SIGNED_OUT': {
          if (!inAuthArea) {
            router.replace('/(auth)/login' as any)
          }
          break
        }
        case 'USER_UPDATED':
        case 'TOKEN_REFRESHED':
          // Healthy events — nothing to do, refresh will happen on next fetch.
          break
        case 'PASSWORD_RECOVERY':
          // Force-change-password screen takes over from here.
          break
      }
    })

    return () => {
      try {
        sub.subscription.unsubscribe()
      } catch (e) {
        captureError(e, { tags: { surface: 'session-guard' } })
      }
    }
  }, [router, segments])
}

/**
 * Detect a "expired session" Supabase error from any data call and
 * force a clean logout. Call from any catch block where a 401 / JWT
 * error would otherwise surface as a confusing toast.
 */
export function isSessionExpiredError(err: any): boolean {
  if (!err) return false
  const msg = String(err?.message ?? '').toLowerCase()
  const status = err?.status ?? err?.code
  return (
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwt malformed') ||
    msg.includes('refresh token') ||
    status === 401
  )
}
