/**
 * Pulls just enough rows to compute the dashboard KPIs the webapp shows.
 * Three independent queries — none of them lock the others, so a slow
 * one doesn't block the rest of the screen.
 */

import { useCallback, useEffect, useState } from 'react'
import { startOfWeek, endOfWeek, startOfDay, endOfDay } from 'date-fns'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import type { Plan, TimeEntry } from '@/lib/types'

export interface ActiveShift {
  id: string
  employee_id: string
  start_time: string
  employee?: { id: string; full_name: string | null }
  customer?: { id: string; name: string } | null
}

export interface DashboardStats {
  activeEmployees: number
  openPlans: number
  totalHoursThisWeek: number
  todaysShiftCount: number
  weeklyHoursMine: number
  upcomingShifts: Plan[]
  recentEntries: TimeEntry[]
  activeShifts: ActiveShift[]
  todayPlan: Plan | null
}

const emptyStats: DashboardStats = {
  activeEmployees: 0,
  openPlans: 0,
  totalHoursThisWeek: 0,
  todaysShiftCount: 0,
  weeklyHoursMine: 0,
  upcomingShifts: [],
  recentEntries: [],
  activeShifts: [],
  todayPlan: null,
}

export function useDashboardStats() {
  const supabase = getSupabase()
  const { profile, isAdmin, isDispatcher, isEmployee, session } = useUser()
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!profile?.organization_id || !session?.user?.id) return
    setLoading(true)

    const now = new Date()
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 }).toISOString()
    const dayStart = startOfDay(now).toISOString()
    const dayEnd = endOfDay(now).toISOString()
    const myId = session.user.id

    try {
      const isManagerial = isAdmin || isDispatcher

      // ── Managerial counts ─────────────────────────────────────────────
      let activeEmployees = 0
      let openPlans = 0
      let totalHoursThisWeek = 0
      let todaysShiftCount = 0
      let upcomingShifts: Plan[] = []
      let recentEntries: TimeEntry[] = []

      let activeShifts: ActiveShift[] = []
      if (isManagerial) {
        const [
          { count: activeCount },
          { count: openCount },
          { data: weekEntries },
          { data: shiftsToday },
          { data: upcoming },
          { data: recent },
          { data: clockedIn },
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', profile.organization_id)
            .eq('is_active', true)
            .eq('role', 'employee'),
          supabase
            .from('plans')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', profile.organization_id)
            .in('status', ['draft', 'assigned']),
          supabase
            .from('time_entries')
            .select('net_hours')
            .eq('organization_id', profile.organization_id)
            .gte('start_time', weekStart)
            .lte('start_time', weekEnd),
          supabase
            .from('plans')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', profile.organization_id)
            .gte('start_time', dayStart)
            .lte('start_time', dayEnd),
          supabase
            .from('plans')
            .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
            .eq('organization_id', profile.organization_id)
            .gte('start_time', now.toISOString())
            .order('start_time', { ascending: true })
            .limit(5),
          supabase
            .from('time_entries')
            .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
            .eq('organization_id', profile.organization_id)
            .order('date', { ascending: false })
            .limit(5),
          // Currently-clocked-in shifts: time_entries with no end_time.
          supabase
            .from('time_entries')
            .select('id, employee_id, start_time, employee:profiles!employee_id(id, full_name), customer:customers(id, name)')
            .eq('organization_id', profile.organization_id)
            .is('end_time', null)
            .order('start_time', { ascending: false })
            .limit(6),
        ])

        activeEmployees = activeCount ?? 0
        openPlans = openCount ?? 0
        totalHoursThisWeek = (weekEntries ?? []).reduce(
          (sum: number, e: any) => sum + (Number(e.net_hours) || 0),
          0,
        )
        todaysShiftCount = (shiftsToday as any)?.length ?? 0
        upcomingShifts = (upcoming ?? []) as Plan[]
        recentEntries = (recent ?? []) as TimeEntry[]
        activeShifts = ((clockedIn ?? []) as any) as ActiveShift[]
      }

      // ── Employee personal stats ──────────────────────────────────────
      let weeklyHoursMine = 0
      let todayPlan: Plan | null = null
      let myUpcoming: Plan[] = []
      let myRecent: TimeEntry[] = []

      if (isEmployee || !isManagerial) {
        const [
          { data: myWeek },
          { data: myToday },
          { data: myUp },
          { data: myRec },
        ] = await Promise.all([
          supabase
            .from('time_entries')
            .select('net_hours')
            .eq('employee_id', myId)
            .gte('start_time', weekStart)
            .lte('start_time', weekEnd),
          supabase
            .from('plans')
            .select('*, customer:customers(id, name)')
            .eq('employee_id', myId)
            .gte('start_time', dayStart)
            .lte('start_time', dayEnd)
            .order('start_time', { ascending: true })
            .limit(1),
          supabase
            .from('plans')
            .select('*, customer:customers(id, name)')
            .eq('employee_id', myId)
            .gte('start_time', now.toISOString())
            .order('start_time', { ascending: true })
            .limit(5),
          supabase
            .from('time_entries')
            .select('*, customer:customers(id, name)')
            .eq('employee_id', myId)
            .order('date', { ascending: false })
            .limit(5),
        ])

        weeklyHoursMine = (myWeek ?? []).reduce(
          (sum: number, e: any) => sum + (Number(e.net_hours) || 0),
          0,
        )
        todayPlan = ((myToday ?? [])[0] as Plan) ?? null
        myUpcoming = (myUp ?? []) as Plan[]
        myRecent = (myRec ?? []) as TimeEntry[]
      }

      setStats({
        activeEmployees,
        openPlans,
        totalHoursThisWeek,
        todaysShiftCount,
        weeklyHoursMine,
        upcomingShifts: isManagerial ? upcomingShifts : myUpcoming,
        recentEntries: isManagerial ? recentEntries : myRecent,
        activeShifts,
        todayPlan,
      })
    } catch (err) {
      console.warn('[Dashboard] fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase, profile?.organization_id, session?.user?.id, isAdmin, isDispatcher, isEmployee])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, refetch: fetchStats }
}
