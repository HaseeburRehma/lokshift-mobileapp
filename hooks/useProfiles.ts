/**
 * Profiles (org members) hook — list profiles, change role, toggle
 * is_active, reset password by email.
 *
 * Notes on the surface vs the webapp:
 *   - Listing + role + status: direct Supabase mutations (RLS gates to
 *     admins). Matches what the web's /api/users/role and
 *     /api/users/[id]/status endpoints do, server-side, with a session
 *     check — the RLS policy enforces the same on the mobile path.
 *   - resetPassword: client-side `supabase.auth.resetPasswordForEmail`
 *     using EXPO_PUBLIC_WEBAPP_URL as the redirect, so the user lands on
 *     the web app's /change-password page. Mirrors what the web's
 *     /api/auth/send-recovery does internally.
 *   - createUser (invite): not exposed here. The web's POST /api/users
 *     uses the service-role key, which mobile cannot hold. The Users
 *     screen displays a hint pointing to the web for invites.
 *
 * `target_hours` and `working_time_model_id` are returned so the edit
 * screen can show / change them.
 */

import { useCallback, useEffect, useState } from 'react'
import Constants from 'expo-constants'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { normalizeRole } from '@/lib/rbac/permissions'
import type { Profile, UserRole } from '@/lib/types'

/**
 * Failure modes the UI cares about — used to render an actionable
 * banner instead of a silent "0 members" empty state when something is
 * actually wrong with the admin's own account or the Supabase RLS rules.
 */
export type ProfilesError =
  | { kind: 'missing_org'; message: string }
  | { kind: 'fetch_failed'; message: string }

export function useProfiles(includeInactive = true) {
  const supabase = getSupabase()
  const { profile: me } = useUser()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ProfilesError | null>(null)

  const fetchProfiles = useCallback(
    async (silent = false) => {
      // Surface missing organization explicitly. If the admin's own
      // profile row has no organization_id (a fresh signup whose
      // handle_new_lokshift_user trigger errored, a manually-inserted
      // row, etc.), every "filter by org" hook in the app returns an
      // empty list. The user sees "0 members" and concludes the org is
      // empty — when really their own account is broken. Bubble that
      // up so the screen can show a fixable explanation.
      if (!me?.organization_id) {
        setLoading(false)
        setError({
          kind: 'missing_org',
          message:
            'Your profile is not linked to an organization. Ask an admin to set your organization_id in Supabase, or re-run the user-creation trigger.',
        })
        setProfiles([])
        return
      }
      if (!silent) setLoading(true)
      // ── Defensive SELECT ──────────────────────────────────────────────
      // Some Supabase instances were provisioned before the later
      // migrations that added onboarding_completed, must_change_password
      // and working_time_model_id to `profiles`. Including them in the
      // SELECT made PostgREST return 400 ("column does not exist") and
      // the entire members list vanished. We first try the full schema;
      // on failure we retry with just the base columns so the screen
      // still works against an older instance.
      const FULL_COLUMNS =
        'id, organization_id, full_name, email, role, avatar_url, is_active, ' +
        'onboarding_completed, must_change_password, target_hours, working_time_model_id, ' +
        'created_at, updated_at'
      const BASE_COLUMNS =
        'id, organization_id, full_name, email, role, avatar_url, is_active, target_hours, created_at, updated_at'

      const runQuery = async (cols: string) => {
        let q = supabase
          .from('profiles')
          .select(cols)
          .eq('organization_id', me.organization_id)
          .order('full_name', { ascending: true })
        if (!includeInactive) q = q.eq('is_active', true)
        return q
      }

      let { data, error: queryError } = await runQuery(FULL_COLUMNS)
      if (queryError) {
        // 400 from PostgREST when a column is missing — fall back to
        // the base column set so the UI still loads.
        const msg = String(queryError.message ?? '').toLowerCase()
        const looksLikeMissingColumn =
          msg.includes('column') ||
          msg.includes('does not exist') ||
          msg.includes('schema') ||
          queryError.code === '42703' ||
          (queryError as any).status === 400
        if (looksLikeMissingColumn) {
          console.warn(
            '[useProfiles] full SELECT failed, retrying with base columns:',
            queryError.message,
          )
          const retry = await runQuery(BASE_COLUMNS)
          data = retry.data
          queryError = retry.error as any
        }
      }
      if (queryError) {
        console.warn('[useProfiles] fetch failed', queryError.message)
        setError({ kind: 'fetch_failed', message: queryError.message })
      } else {
        // Normalize legacy roles ("administrator" → "admin", etc.) so the
        // UI always works with the canonical three values.
        const normalized = (data ?? []).map((p: any) => ({
          ...p,
          role: normalizeRole(p.role),
        })) as Profile[]
        setProfiles(normalized)
        setError(null)
      }
      setLoading(false)
    },
    [supabase, me?.organization_id, includeInactive],
  )

  useEffect(() => {
    fetchProfiles()
    if (!me?.organization_id) return
    const channel = supabase
      .channel(uniqueChannelName(`profiles-${me.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `organization_id=eq.${me.organization_id}`,
        },
        () => fetchProfiles(true),
      )
      .subscribe()
    return () => {
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [supabase, me?.organization_id, fetchProfiles])

  const updateRole = async (id: string, role: UserRole) => {
    const previous = profiles
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, role } : p)),
    )
    const { error } = await supabase
      .from('profiles')
      .update({ role } as any)
      .eq('id', id)
    if (error) {
      setProfiles(previous)
      throw error
    }
  }

  const toggleActive = async (id: string, currentlyActive: boolean) => {
    const previous = profiles
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !currentlyActive } : p)),
    )
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentlyActive } as any)
      .eq('id', id)
    if (error) {
      setProfiles(previous)
      throw error
    }
  }

  const updateProfile = async (id: string, patch: Partial<Profile>) => {
    const previous = profiles
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? ({ ...p, ...patch } as Profile) : p)),
    )
    const { error } = await supabase
      .from('profiles')
      .update(patch as any)
      .eq('id', id)
    if (error) {
      setProfiles(previous)
      throw error
    }
  }

  /**
   * Sends a password-reset email. Redirect URL points at the web app's
   * /change-password page so the user lands somewhere they can actually
   * enter a new password.
   */
  const resetPassword = async (email: string) => {
    const webappUrl =
      (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_WEBAPP_URL ??
      process.env.EXPO_PUBLIC_WEBAPP_URL ??
      undefined
    const redirectTo = webappUrl ? `${webappUrl}/change-password` : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    )
    if (error) throw error
  }

  return {
    profiles,
    loading,
    error,
    fetchProfiles,
    updateRole,
    toggleActive,
    updateProfile,
    resetPassword,
  }
}
