/**
 * Admin / dispatcher hook for the verification queue. Lists every
 * un-verified `time_entries` row in the org with the joined employee +
 * customer, and exposes batch + single verify helpers. Realtime
 * subscription keeps the queue fresh while admins are reviewing.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { TimeEntry } from '@/lib/types'

export function useUnverifiedEntries() {
  const supabase = getSupabase()
  const { profile, session } = useUser()
  const orgId = profile?.organization_id ?? null
  const myId = session?.user?.id ?? null
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(
    async (silent = false) => {
      if (!orgId) return
      if (!silent) setLoading(true)
      const { data, error } = await supabase
        .from('time_entries')
        .select(
          '*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)',
        )
        .eq('organization_id', orgId)
        .eq('is_verified', false)
        .not('end_time', 'is', null)
        .order('date', { ascending: false })
        .limit(200)
      if (error) {
        console.warn('[useUnverifiedEntries] fetch failed', error.message)
      } else {
        setEntries((data ?? []) as TimeEntry[])
      }
      setLoading(false)
    },
    [supabase, orgId],
  )

  useEffect(() => {
    if (!orgId) return
    fetchEntries()
    const channel = supabase
      .channel(uniqueChannelName(`unverified-entries:${orgId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries',
          filter: `organization_id=eq.${orgId}`,
        },
        () => fetchEntries(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, fetchEntries])

  const verifyMany = useCallback(
    async (ids: string[]): Promise<number> => {
      if (!myId || ids.length === 0) return 0
      const previous = entries
      // Optimistic: remove the verified ones from the queue.
      setEntries((prev) => prev.filter((e) => !ids.includes(e.id)))
      const { error } = await supabase
        .from('time_entries')
        .update({
          is_verified: true,
          verified_by: myId,
          updated_at: new Date().toISOString(),
        } as any)
        .in('id', ids)
      if (error) {
        setEntries(previous)
        throw error
      }
      return ids.length
    },
    [supabase, myId, entries],
  )

  const unverify = useCallback(
    async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('time_entries')
        .update({
          is_verified: false,
          verified_by: null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
      if (error) throw error
      // The realtime channel will refetch on success; no local mutation needed.
    },
    [supabase],
  )

  return { entries, loading, fetchEntries, verifyMany, unverify }
}
