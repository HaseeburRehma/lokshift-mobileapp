/**
 * Personal time-account hook — pulls all `time_entries` for the current
 * user, groups them by month and computes per-month worked/target/balance.
 *
 * Managerial users that want the whole-org overview use
 * useOrganizationTimeAccounts instead.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

export interface MonthlyTimeData {
  key: string             // 'YYYY-MM'
  label: string           // 'May 2026'
  actualHours: number
  targetHours: number     // = profile.target_hours / 7 * working-days-in-month, approximation
  difference: number
  workingDays: number     // count of unique dates with net_hours > 0
}

export function useTimeAccount(employeeId?: string) {
  const supabase = getSupabase()
  const { profile, session } = useUser()
  const [monthlyData, setMonthlyData] = useState<MonthlyTimeData[]>([])
  const [loading, setLoading] = useState(true)

  const targetId = employeeId ?? session?.user?.id
  const weeklyTarget = profile?.target_hours ?? 40

  const fetchData = useCallback(async () => {
    if (!profile?.organization_id || !targetId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('time_entries')
      .select('date, net_hours')
      .eq('organization_id', profile.organization_id)
      .eq('employee_id', targetId)
      .order('date', { ascending: false })

    if (error) {
      console.warn('[useTimeAccount] fetch failed:', error.message)
      setMonthlyData([])
      setLoading(false)
      return
    }

    // Group by YYYY-MM with both hours sum + unique-date set so we can
    // surface workingDays in the overview screen.
    const aggregator = new Map<string, { hours: number; dates: Set<string> }>()
    for (const row of (data ?? [])) {
      const date = row.date as string
      const key = date.slice(0, 7)
      if (!aggregator.has(key)) aggregator.set(key, { hours: 0, dates: new Set() })
      const agg = aggregator.get(key)!
      const h = Number(row.net_hours) || 0
      agg.hours += h
      if (h > 0) agg.dates.add(date)
    }

    // Approximate target = weekly target × ~4.33 weeks per month. Good
    // enough for a dashboard surfacing; the webapp does the same.
    const targetPerMonth = (weeklyTarget * 52) / 12

    const months: MonthlyTimeData[] = Array.from(aggregator.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, agg]) => ({
        key,
        label: format(new Date(`${key}-01`), 'MMMM yyyy'),
        actualHours: Number(agg.hours.toFixed(2)),
        targetHours: Number(targetPerMonth.toFixed(2)),
        difference: Number((agg.hours - targetPerMonth).toFixed(2)),
        workingDays: agg.dates.size,
      }))

    setMonthlyData(months)
    setLoading(false)
  }, [supabase, profile?.organization_id, targetId, weeklyTarget])

  useEffect(() => { fetchData() }, [fetchData])

  const totalBalance = useMemo(
    () => monthlyData.reduce((s, m) => s + m.difference, 0),
    [monthlyData],
  )

  return { monthlyData, totalBalance, loading, refetch: fetchData }
}
