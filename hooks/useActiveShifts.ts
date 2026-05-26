/**
 * Active-shifts hook for the live operations dashboard. Lists every
 * `time_entries` row in the org with `end_time IS NULL`, joined to the
 * employee profile (for the map pin + initials), the linked plan, and
 * the plan's customer (for the popup label and the upcoming-shift
 * markers).
 *
 * Realtime subscription on the org's time_entries so the dashboard
 * reacts to every clock-in / clock-out without a manual refresh.
 *
 * Also returns confirmed plans scheduled for today (the "upcoming" map
 * layer) since the source data is on the same table set and re-fetching
 * separately in the screen is wasteful.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { Plan, TimeEntry, Profile, Customer } from '@/lib/types'

export interface ActiveShift extends TimeEntry {
  employee: Pick<
    Profile,
    'id' | 'full_name' | 'avatar_url' | 'role' | 'last_lat' | 'last_lng'
  >
  plan?: {
    id: string
    location?: string | null
    route?: string | null
    customer?: Pick<Customer, 'id' | 'name' | 'latitude' | 'longitude'> | null
  }
}

export interface UpcomingShift extends Plan {
  customer?: Pick<Customer, 'id' | 'name' | 'latitude' | 'longitude'> | null
  employee?: { id: string; full_name: string | null; avatar_url: string | null }
}

export function useActiveShifts() {
  const supabase = getSupabase()
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingShift[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(
    async (silent = false) => {
      if (!orgId) return
      if (!silent) setLoading(true)

      const todayStart = `${new Date().toISOString().split('T')[0]}T00:00:00`
      const todayEnd = `${new Date().toISOString().split('T')[0]}T23:59:59`

      const [{ data: shifts, error: shiftsErr }, { data: plans }] = await Promise.all([
        supabase
          .from('time_entries')
          .select(
            `*,
            employee:profiles!employee_id(id, full_name, avatar_url, role, last_lat, last_lng),
            plan:plans(id, location, route, customer:customers(id, name, latitude, longitude))`,
          )
          .eq('organization_id', orgId)
          .is('end_time', null)
          .order('start_time', { ascending: true }),
        supabase
          .from('plans')
          .select(
            `*,
            customer:customers(id, name, latitude, longitude),
            employee:profiles!employee_id(id, full_name, avatar_url)`,
          )
          .eq('organization_id', orgId)
          .eq('status', 'confirmed')
          .gte('start_time', todayStart)
          .lte('start_time', todayEnd),
      ])

      if (shiftsErr) {
        console.warn('[useActiveShifts] fetch failed', shiftsErr.message)
      } else {
        setActiveShifts((shifts ?? []) as ActiveShift[])
      }
      setUpcoming((plans ?? []) as UpcomingShift[])
      setLoading(false)
    },
    [supabase, orgId],
  )

  useEffect(() => {
    if (!orgId) return
    refresh()
    const channel = supabase
      .channel(uniqueChannelName(`active-shifts:${orgId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries',
          filter: `organization_id=eq.${orgId}`,
        },
        () => refresh(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, refresh])

  // Compact totals matching the web's KPI cards.
  const stats = useMemo(() => {
    const total = activeShifts.length
    const onBreak = activeShifts.filter((s) => s.is_on_break).length
    return { total, onMission: total - onBreak, onBreak }
  }, [activeShifts])

  return { activeShifts, upcoming, stats, loading, refresh }
}
