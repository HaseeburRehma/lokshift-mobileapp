/**
 * Organization hook — fetch + update the current user's org row.
 *
 * Read access: any signed-in user (so the rest of the app can show the
 * company name / logo).
 *
 * Write access: enforced server-side via RLS; the UI gates the edit
 * form behind `canManageUsers(role)`.
 *
 * Mirrors the columns the web's /dashboard/settings/company page reads
 * + writes: name, legal_name, email, phone, website, address, tax_id,
 * currency, timezone, logo_url, plus the Phase-2 spesen rate columns.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { Organization } from '@/lib/types'

export interface OrganizationInput {
  name: string
  legal_name?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  tax_id?: string | null
  currency?: string | null
  timezone?: string | null
  logo_url?: string | null
  spesen_rate_partial?: number | null
  spesen_rate_full?: number | null
}

export function useOrganization() {
  const supabase = getSupabase()
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchOrg = useCallback(
    async (silent = false) => {
      if (!orgId) {
        setOrganization(null)
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .maybeSingle()
      if (error) {
        console.warn('[useOrganization] fetch failed', error.message)
      } else {
        setOrganization((data ?? null) as Organization | null)
      }
      setLoading(false)
    },
    [supabase, orgId],
  )

  useEffect(() => {
    fetchOrg()
    if (!orgId) return
    const channel = supabase
      .channel(uniqueChannelName(`organization-${orgId}`))
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'organizations',
          filter: `id=eq.${orgId}`,
        },
        () => fetchOrg(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, fetchOrg])

  const updateOrganization = async (patch: Partial<OrganizationInput>): Promise<Organization> => {
    if (!orgId) throw new Error('No organization in session')
    const previous = organization
    setOrganization((prev) => (prev ? ({ ...prev, ...patch } as Organization) : prev))
    const { data, error } = await supabase
      .from('organizations')
      .update(patch as any)
      .eq('id', orgId)
      .select('*')
      .single()
    if (error) {
      setOrganization(previous)
      throw error
    }
    setOrganization(data as Organization)
    return data as Organization
  }

  return { organization, loading, fetchOrg, updateOrganization }
}
