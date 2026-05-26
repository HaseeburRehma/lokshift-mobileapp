/**
 * UserContext — central place for the current session + profile + role.
 *
 * Loading model (rewritten for perceived performance):
 *
 *   - `loading` flips to false as soon as the **session** check finishes.
 *     The UI can render and the AuthGuard can route immediately — we no
 *     longer block the whole app waiting for the profile fetch.
 *
 *   - `profileLoading` tracks the profile fetch separately. Screens that
 *     need profile data either gate on it, or render skeleton state.
 *
 *   - Profile fetch has a 6-second hard timeout. If Supabase is slow we
 *     fall through to a fallback profile derived from the auth user's
 *     metadata so the UI never gets stuck on an infinite spinner.
 *
 *   - A simple AsyncStorage cache (`lokshift.profileCache.<userId>`)
 *     persists the last-seen profile so the UI hydrates instantly on
 *     subsequent launches, then refreshes in the background.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSupabase } from './supabase/client'
import type { Profile, UserRole } from './types'
import { normalizeRole } from './rbac/permissions'

// Minimal session shape we read off the auth client. We deliberately
// don't import `Session` from @supabase/supabase-js — its public d.ts
// doesn't export the name in some installs (tsc bug w/ pnpm symlinks).
interface Session {
  user?: { id: string; email?: string | null; user_metadata?: any }
}

const PROFILE_CACHE_KEY = (uid: string) => `lokshift.profileCache.${uid}`
const PROFILE_TIMEOUT_MS = 6_000

interface UserContextValue {
  loading: boolean          // session check finished
  profileLoading: boolean   // profile fetch finished (independent of loading)
  session: Session | null
  profile: Profile | null
  role: UserRole | null
  isAdmin: boolean
  isDispatcher: boolean
  isEmployee: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const UserContext = createContext<UserContextValue | null>(null)

// Race a promise against a timeout — returns null if the timeout fires
// first. Keeps the UI responsive when Supabase is slow.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then((v) => { clearTimeout(timer); resolve(v) })
     .catch(() => { clearTimeout(timer); resolve(null) })
  })
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] = useState(false)
  // Track the user id we're currently loading a profile for so old
  // requests can't overwrite newer state after a fast sign-in/out cycle.
  const activeUserIdRef = useRef<string | null>(null)

  const loadProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    // Supabase's query builder returns a PromiseLike (`.then` only).
    // Wrapping in `Promise.resolve()` gives us a real Promise that
    // `withTimeout` can race.
    const fetchPromise: Promise<Profile | null> = Promise.resolve(
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    ).then(({ data, error }: any) => {
      if (error) {
        console.warn('[UserContext] profile fetch failed:', error.message)
        return null
      }
      return (data as Profile | null) ?? null
    })

    const raced = await withTimeout(fetchPromise, PROFILE_TIMEOUT_MS)
    if (raced) return raced

    // Either the fetch errored or it timed out — fall back to a profile
    // synthesised from the auth user so the UI is never blank.
    const { data: userResp } = await supabase.auth.getUser()
    const u = userResp.user
    if (!u) return null

    const fallback: Profile = {
      id: u.id,
      organization_id: null,
      email: u.email ?? null,
      full_name: (u.user_metadata?.full_name as string | undefined) ?? null,
      role: ((u.user_metadata?.role as UserRole | undefined) ?? 'employee') as UserRole,
      avatar_url: null,
      is_active: true,
      onboarding_completed: true, // assume true to avoid forcing onboarding when offline
      must_change_password: false,
      target_hours: 40,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Best-effort upsert in the background — don't block returning the
    // fallback so the UI renders immediately.
    Promise.resolve(supabase.from('profiles').upsert(fallback as any, { onConflict: 'id' }))
      .then(() => {})
      .catch(() => {})
    return fallback
  }, [supabase])

  // Hydrate profile from AsyncStorage cache, then refresh in background.
  const loadProfileWithCache = useCallback(async (userId: string) => {
    activeUserIdRef.current = userId
    setProfileLoading(true)

    // 1) instant-hydrate from cache
    try {
      const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY(userId))
      if (cached && activeUserIdRef.current === userId) {
        try { setProfile(JSON.parse(cached) as Profile) } catch {}
      }
    } catch {}

    // 2) network refresh
    const fresh = await loadProfile(userId)
    if (activeUserIdRef.current !== userId) return // stale, ignore

    if (fresh) {
      setProfile(fresh)
      AsyncStorage.setItem(PROFILE_CACHE_KEY(userId), JSON.stringify(fresh)).catch(() => {})
    }
    setProfileLoading(false)
  }, [loadProfile])

  useEffect(() => {
    let mounted = true

    // Read the session synchronously from storage. Setting `loading=false`
    // happens AS SOON as this resolves, regardless of whether the profile
    // has loaded yet. This unblocks AuthGuard's redirect logic in <300ms.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
      if (data.session?.user?.id) {
        // fire-and-forget — UI renders without waiting
        loadProfileWithCache(data.session.user.id)
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      if (newSession?.user?.id) {
        loadProfileWithCache(newSession.user.id)
      } else {
        activeUserIdRef.current = null
        setProfile(null)
        setProfileLoading(false)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [supabase, loadProfileWithCache])

  const role = useMemo<UserRole | null>(
    () => (profile ? normalizeRole(profile.role) : null),
    [profile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    // Drop cached profile so the next user starts fresh.
    const id = activeUserIdRef.current
    if (id) AsyncStorage.removeItem(PROFILE_CACHE_KEY(id)).catch(() => {})
    activeUserIdRef.current = null
  }, [supabase])

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id) return
    await loadProfileWithCache(session.user.id)
  }, [session?.user?.id, loadProfileWithCache])

  const value = useMemo<UserContextValue>(() => ({
    loading,
    profileLoading,
    session,
    profile,
    role,
    isAdmin: role === 'admin',
    isDispatcher: role === 'dispatcher',
    isEmployee: role === 'employee',
    signOut,
    refreshProfile,
  }), [loading, profileLoading, session, profile, role, signOut, refreshProfile])

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used inside <UserProvider />')
  return ctx
}
