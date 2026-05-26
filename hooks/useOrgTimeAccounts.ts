/**
 * Org-wide time-account overview — one row per active employee with their
 * year-to-date worked vs target hours.
 *
 * Pulls every time entry for the org in one query then computes per-
 * employee totals client-side. With the 100–200 user phase-1 cap from
 * the spec this is fine; if usage grows we'd want a server-side
 * aggregate view.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

export interface OrgTimeAccount {
  employee_id: string
  full_name: string
  target_hours: number
  actual_hours: number
  balance: number
}

export function useOrganizationTimeAccounts() {
  const supabase = getSupabase()
  const { profile, isAdmin, isDispatcher } = useUser()
  const [accounts, setAccounts] = useState<OrgTimeAccount[]>([])
  const [loading, setLoading] = useState(true)

  const enabled = (isAdmin || isDispatcher) && !!profile?.organization_id

  const fetchAccounts = useCallback(async () => {
    if (!enabled) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)

    const yearStart = `${new Date().getFullYear()}-01-01`
    const [{ data: employees }, { data: entries }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, target_hours')
        .eq('organization_id', profile!.organization_id)
        .eq('role', 'employee')
        .eq('is_active', true),
      supabase
        .from('time_entries')
        .select('employee_id, net_hours, date')
        .eq('organization_id', profile!.organization_id)
        .gte('date', yearStart),
    ])

    const sumByEmployee = new Map<string, number>()
    for (const e of (entries ?? [])) {
      sumByEmployee.set(
        e.employee_id as string,
        (sumByEmployee.get(e.employee_id as string) ?? 0) + (Number(e.net_hours) || 0),
      )
    }

    const rows: OrgTimeAccount[] = (employees ?? []).map((emp: any) => {
      const actual = sumByEmployee.get(emp.id) ?? 0
      // Year-to-date target: weekly target × weeks elapsed this year.
      const now = new Date()
      const start = new Date(`${now.getFullYear()}-01-01`)
      const weeksElapsed = Math.max(1, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)))
      const target = (Number(emp.target_hours) || 40) * weeksElapsed
      return {
        employee_id: emp.id,
        full_name: emp.full_name ?? '—',
        target_hours: Number(target.toFixed(2)),
        actual_hours: Number(actual.toFixed(2)),
        balance: Number((actual - target).toFixed(2)),
      }
    })

    rows.sort((a, b) => a.balance - b.balance) // worst-off first
    setAccounts(rows)
    setLoading(false)
  }, [supabase, enabled, profile])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  return { accounts, loading, refetch: fetchAccounts }
}
