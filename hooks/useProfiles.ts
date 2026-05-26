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

export function useProfiles(includeInactive = true) {
  const supabase = getSupabase()
  const { profile: me } = useUser()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProfiles = useCallback(
    async (silent = false) => {
      if (!me?.organization_id) return
      if (!silent) setLoading(true)
      let query = supabase
        .from('profiles')
        .select(
          'id, organization_id, full_name, email, role, avatar_url, is_active, onboarding_completed, must_change_password, target_hours, working_time_model_id, created_at, updated_at',
        )
        .eq('organization_id', me.organization_id)
        .order('full_name', { ascending: true })

      if (!includeInactive) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) {
        console.warn('[useProfiles] fetch failed', error.message)
      } else {
        // Normalize legacy roles ("administrator" → "admin", etc.) so the
        // UI always works with the canonical three values.
        const normalized = (data ?? []).map((p: any) => ({
          ...p,
          role: normalizeRole(p.role),
        })) as Profile[]
        setProfiles(normalized)
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
      supabase.removeChannel(channel)
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
    fetchProfiles,
    updateRole,
    toggleActive,
    updateProfile,
    resetPassword,
  }
}
