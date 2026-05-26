/**
 * Time-entry data hook.
 *
 * Scope rules:
 *   - employee: own entries only (Supabase RLS double-checks).
 *   - admin/dispatcher: every entry in the org.
 *
 * The mutation helpers (create / update / delete) optimistically update
 * the local cache so the UI feels instant; failures roll back.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { readCache, writeCache } from '@/lib/cache'
import type { TimeEntry } from '@/lib/types'

export function useTimeEntries() {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  const isManagerial = isAdmin || isDispatcher
  const myId = session?.user?.id
  const cacheKey =
    profile?.organization_id && myId
      ? `time-entries:${profile.organization_id}:${isManagerial ? 'all' : myId}`
      : null

  const fetchEntries = useCallback(async () => {
    if (!profile?.organization_id || !myId) return
    setLoading(true)
    let query = supabase
      .from('time_entries')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
      .eq('organization_id', profile.organization_id)
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(200)

    if (!isManagerial) query = query.eq('employee_id', myId)

    const { data, error } = await query
    if (error) {
      // Network failure: keep whatever's already in state (cache hydrate
      // already populated it on mount). Don't blow it away.
      console.warn('[useTimeEntries] fetch failed', error.message)
    } else {
      const rows = (data ?? []) as TimeEntry[]
      setEntries(rows)
      if (cacheKey) writeCache(cacheKey, rows)
    }
    setLoading(false)
  }, [supabase, profile?.organization_id, myId, isManagerial, cacheKey])

  // Cache-first hydrate. Instant render on cold start, even offline.
  useEffect(() => {
    if (!cacheKey) return
    readCache<TimeEntry[]>(cacheKey).then((cached) => {
      if (cached && cached.length) setEntries(cached)
    })
  }, [cacheKey])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // Group by date for the section list.
  const grouped = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const e of entries) {
      const key = e.date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
  }, [entries])

  const createEntry = async (payload: Partial<TimeEntry>) => {
    if (!profile?.organization_id || !myId) throw new Error('No session')
    const body = {
      organization_id: profile.organization_id,
      employee_id: myId,
      is_verified: false,
      is_planned: false,
      overnight_stay: false,
      ...payload,
    }
    const { data, error } = await supabase
      .from('time_entries')
      .insert(body as any)
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
      .single()
    if (error) throw error
    setEntries((prev) => [data as TimeEntry, ...prev])
    return data as TimeEntry
  }

  const updateEntry = async (id: string, patch: Partial<TimeEntry>) => {
    const { data, error } = await supabase
      .from('time_entries')
      .update(patch as any)
      .eq('id', id)
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
      .single()
    if (error) throw error
    setEntries((prev) => prev.map((e) => (e.id === id ? (data as TimeEntry) : e)))
    return data as TimeEntry
  }

  const deleteEntry = async (id: string) => {
    const previous = entries
    setEntries((prev) => prev.filter((e) => e.id !== id))
    const { error } = await supabase.from('time_entries').delete().eq('id', id)
    if (error) {
      // rollback
      setEntries(previous)
      throw error
    }
  }

  return { entries, grouped, loading, fetchEntries, createEntry, updateEntry, deleteEntry }
}
