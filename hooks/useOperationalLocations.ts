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
      if (!profile?.organization_id) return
      if (!silent) setLoading(true)

      let query = supabase
        .from('operational_locations')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name', { ascending: true })

      if (!includeArchived) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) {
        console.warn('[useOperationalLocations] fetch failed', error.message)
      } else {
        setLocations((data ?? []) as OperationalLocation[])
      }
      setLoading(false)
    },
    [supabase, profile?.organization_id, includeArchived],
  )

  useEffect(() => {
    fetchLocations()
    if (!profile?.organization_id) return

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
        () => fetchLocations(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
