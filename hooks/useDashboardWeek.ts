/**
 * Week-scoped plans hook for the unified shift dashboard.
 *
 * Wilson SaaS-style dashboard wants employees × days for a single week.
 * The generic usePlans hook caps at 200 latest plans across the whole
 * org which is fine for the list view but leaks the wrong rows into a
 * grid (you'd see plans from prior months at the top of the page and
 * miss assigned plans for next week).
 *
 * This hook scopes the fetch to the visible week, refetches when the
 * week changes, and subscribes to realtime so two admins editing the
 * dashboard simultaneously stay in sync.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { startOfWeek, endOfWeek, format } from 'date-fns'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { uniqueChannelName } from '@/lib/supabase/channel'
import type { Plan } from '@/lib/types'

export interface WeekCell {
  employeeId: string
  /** YYYY-MM-DD */
  date: string
  plans: Plan[]
}

export function useDashboardWeek(weekAnchor: Date) {
  const supabase = getSupabase()
  const { profile, isAdmin, isDispatcher } = useUser()
  const isManagerial = isAdmin || isDispatcher
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 })
    const end = endOfWeek(weekAnchor, { weekStartsOn: 1 })
    return {
      startISO: `${format(start, 'yyyy-MM-dd')}T00:00:00`,
      endISO: `${format(end, 'yyyy-MM-dd')}T23:59:59`,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    }
  }, [weekAnchor])

  const fetchWeek = useCallback(async () => {
    if (!profile?.organization_id || !isManagerial) {
      setPlans([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('plans')
      .select(
        '*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name), start_location:operational_locations!start_location_id(id, name, short_code), destination_location:operational_locations!destination_location_id(id, name, short_code)',
      )
      .eq('organization_id', profile.organization_id)
      .gte('start_time', range.startISO)
      .lte('start_time', range.endISO)
      .order('start_time', { ascending: true })

    if (error) {
      console.warn('[useDashboardWeek] fetch failed:', error.message)
      setPlans([])
    } else {
      setPlans((data ?? []) as Plan[])
    }
    setLoading(false)
  }, [supabase, profile?.organization_id, isManagerial, range.startISO, range.endISO])

  useEffect(() => {
    fetchWeek()
  }, [fetchWeek])

  // Realtime — refetch the week on any plan change inside the org so
  // two admins working in the dashboard at the same time see each
  // other's moves immediately.
  useEffect(() => {
    if (!profile?.organization_id || !isManagerial) return
    const channel = supabase
      .channel(uniqueChannelName(`dashboard-plans-${profile.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plans',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => {
          fetchWeek()
        },
      )
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {
        // best-effort
      }
    }
  }, [supabase, profile?.organization_id, isManagerial, fetchWeek])

  // Build a quick map for cell lookup: `${employeeId}|${date}` → plans[]
  const byCell = useMemo(() => {
    const map = new Map<string, Plan[]>()
    for (const p of plans) {
      const date = (p.start_time || '').slice(0, 10)
      const key = `${p.employee_id}|${date}`
      const arr = map.get(key) ?? []
      arr.push(p)
      map.set(key, arr)
    }
    return map
  }, [plans])

  /** Mutation helper — used by reassign and move-date actions. */
  const updatePlanField = async (
    planId: string,
    patch: { employee_id?: string; start_time?: string; end_time?: string },
  ) => {
    const { error } = await supabase
      .from('plans')
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq('id', planId)
    if (error) throw error
    // realtime listener will refetch
  }

  const deletePlan = async (planId: string) => {
    const { error } = await supabase.from('plans').delete().eq('id', planId)
    if (error) throw error
  }

  return {
    plans,
    byCell,
    loading,
    range,
    refetch: fetchWeek,
    updatePlanField,
    deletePlan,
  }
}
