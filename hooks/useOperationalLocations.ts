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
import { searchLocations } from '@/lib/operational-locations/parse'

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

export interface LocationListOptions {
  /** Server search (name ↔ code); empty = alphabetical pages. */
  query?: string
  page?: number
  pageSize?: number
  includeInactive?: boolean
  /** Load only this one location (edit screen). */
  id?: string
  /** false = load nothing (create screen). */
  autoLoad?: boolean
}

/**
 * Betriebsstellen with server-side paging and search: the RIL100 import
 * holds ~24 000 points, so no screen downloads the whole list.
 */
export function useOperationalLocations(opts: LocationListOptions = {}) {
  const supabase = getSupabase()
  const { profile } = useUser()
  const [locations, setLocations] = useState<OperationalLocation[]>([])
  const [total, setTotal] = useState(0)
  const autoLoad = opts.autoLoad ?? true
  const [loading, setLoading] = useState(autoLoad)
  const query = (opts.query ?? '').trim()
  const page = opts.page ?? 0
  const pageSize = opts.pageSize ?? 30
  const includeInactive = opts.includeInactive ?? true
  const onlyId = opts.id

  const fetchLocations = useCallback(
    async (silent = false) => {
      if (!autoLoad) { setLoading(false); return }
      if (!profile?.organization_id) { setLoading(false); return }
      if (!silent) setLoading(true)
      const orgId = profile.organization_id
      try {
        if (onlyId) {
          const { data, error } = await supabase.from('operational_locations').select('*').eq('id', onlyId).maybeSingle()
          if (error) throw error
          setLocations(data ? [data as OperationalLocation] : [])
          setTotal(data ? 1 : 0)
        } else if (query) {
          const { data, error } = await supabase.rpc('search_operational_locations', {
            p_query: query,
            p_limit: 100,
            p_include_inactive: includeInactive,
          })
          if (!error) {
            setLocations((data ?? []) as OperationalLocation[])
            setTotal((data ?? []).length)
          } else {
            // Before the migration: plain ilike + the shared ranking.
            const p = query.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
            let fb = supabase.from('operational_locations').select('*').eq('organization_id', orgId)
              .or(`name.ilike.*${p}*,short_code.ilike.${p}*`)
            if (!includeInactive) fb = fb.eq('is_active', true)
            const res = await fb.order('name').limit(300)
            if (res.error) throw res.error
            const ranked = searchLocations((res.data ?? []) as OperationalLocation[], query, 100)
            setLocations(ranked)
            setTotal(ranked.length)
          }
        } else {
          let q = supabase
            .from('operational_locations')
            .select('*', { count: 'exact' })
            .eq('organization_id', orgId)
          if (!includeInactive) q = q.eq('is_active', true)
          const { data, error, count } = await q
            .order('is_active', { ascending: false })
            .order('name', { ascending: true })
            .order('id', { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1)
          if (error) throw error
          setLocations((data ?? []) as OperationalLocation[])
          setTotal(count ?? 0)
        }
      } catch (e: any) {
        // Keep the previous list rather than replacing it with a partial one.
        console.warn('[useOperationalLocations] fetch failed', e?.message ?? e)
      } finally {
        setLoading(false)
      }
    },
    [supabase, profile?.organization_id, autoLoad, onlyId, query, page, pageSize, includeInactive],
  )

  useEffect(() => {
    fetchLocations()
    if (!profile?.organization_id || !autoLoad) return
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
  }, [supabase, profile?.organization_id, fetchLocations, autoLoad])

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
    invalidateLocationCache(profile.organization_id)
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
    invalidateLocationCache()
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
    total,
    loading,
    fetchLocations,
    createLocation,
    updateLocation,
    toggleArchive,
    deleteLocation,
  }
}
