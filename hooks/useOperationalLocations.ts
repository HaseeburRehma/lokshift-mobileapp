/**
 * Betriebsstellen (operational locations) data hook — mirrors the
 * webapp's useOperationalLocations. List, create, update, archive,
 * hard-delete. Realtime subscription syncs admin edits made on web.
 *
 * Hard-delete may fail when plans / time_entries reference the row;
 * the FK constraint surfaces the error untouched (web uses ON DELETE
 * SET NULL but older orgs may not have the migration applied).
 * Archive (toggle is_active) is the safe default.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { OperationalLocation, OperationalLocationType } from '@/lib/types'
import { invalidateLocationCache } from '@/lib/operational-locations/cache'

export interface OperationalLocationInput {
  name: string
  short_code?: string | null
  type: OperationalLocationType
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  phone_number?: string | null
  notes?: string | null
  is_active?: boolean
}

export function useOperationalLocations(includeArchived = true) {
  const supabase = getSupabase()
  const { profile } = useUser()
  const [locations, setLocations] = useState<OperationalLocation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchLocations = useCallback(
    async (silent = false) => {
      if (!profile?.organization_id) { setLoading(false); return }
      if (!silent) setLoading(true)

      // PostgREST caps responses at 1000 rows — page through so several
      // hundred imported Betriebsstellen never get cut off (Punkt 12).
      const rows: OperationalLocation[] = []
      for (let from = 0; from < 20000; from += 1000) {
        let query = supabase
          .from('operational_locations')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, from + 999)
        if (!includeArchived) query = query.eq('is_active', true)
        const { data, error } = await query
        if (error) {
          // Keep the previous list rather than replacing it with a partial one.
          console.warn('[useOperationalLocations] fetch failed', error.message)
          setLoading(false)
          return
        }
        rows.push(...((data ?? []) as OperationalLocation[]))
        if (!data || data.length < 1000) break
      }
      setLocations(rows)
      invalidateLocationCache(profile.organization_id)
      setLoading(false)
    },
    [supabase, profile?.organization_id, includeArchived],
  )

  useEffect(() => {
    fetchLocations()
    if (!profile?.organization_id) return
    // An import inserts hundreds of rows — coalesce into one reload.
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fetchLocations(true), 500)
    }

    const channel = supabase
      .channel(uniqueChannelName(`operational-locations-${profile.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operational_locations',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        schedule,
      )
      .subscribe()

    return () => {
      if (timer) clearTimeout(timer)
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [supabase, profile?.organization_id, fetchLocations])

  const createLocation = async (
    input: OperationalLocationInput,
  ): Promise<OperationalLocation> => {
    if (!profile?.organization_id) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('operational_locations')
      .insert({
        ...input,
        organization_id: profile.organization_id,
        is_active: input.is_active ?? true,
      } as any)
      .select('*')
      .single()
    if (error) throw error
    setLocations((prev) =>
      [...prev, data as OperationalLocation].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )
    return data as OperationalLocation
  }

  const updateLocation = async (
    id: string,
    patch: Partial<OperationalLocationInput>,
  ): Promise<OperationalLocation> => {
    const previous = locations
    setLocations((prev) =>
      prev
        .map((l) => (l.id === id ? ({ ...l, ...patch } as OperationalLocation) : l))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    const { data, error } = await supabase
      .from('operational_locations')
      .update(patch as any)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      setLocations(previous)
      throw error
    }
    setLocations((prev) =>
      prev
        .map((l) => (l.id === id ? (data as OperationalLocation) : l))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    return data as OperationalLocation
  }

  const toggleArchive = async (id: string, currentlyActive: boolean) =>
    updateLocation(id, { is_active: !currentlyActive })

  const deleteLocation = async (id: string): Promise<void> => {
    const previous = locations
    setLocations((prev) => prev.filter((l) => l.id !== id))
    const { error } = await supabase
      .from('operational_locations')
      .delete()
      .eq('id', id)
    if (error) {
      setLocations(previous)
      throw error
    }
  }

  return {
    locations,
    loading,
    fetchLocations,
    createLocation,
    updateLocation,
    toggleArchive,
    deleteLocation,
  }
}
