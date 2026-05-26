/**
 * Monthly aggregation for time entries — ported from the webapp's
 * `lib/times/calculations.ts`. Computes per-month working days, scheduled
 * hours (from confirmed/assigned plans), actual hours (sum of entry
 * net_hours), and the balance (overtime / deficit).
 *
 * Pure module — no I/O.
 */

import type { TimeEntry, Plan, MonthlyTimeData } from '../types'

/** Working days (Mon–Fri) in a given calendar month (1-12). */
export function countWorkingDays(year: number, month: number): number {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0)
  let count = 0
  const current = new Date(start)
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

/** Sum of scheduled hours from plans falling inside the given month. */
export function scheduledHoursForMonth(
  plans: Plan[],
  year: number,
  month: number,
): number {
  return plans
    .filter((p) => {
      const d = new Date(p.start_time)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    .reduce((sum, p) => {
      const startMs = new Date(p.start_time).getTime()
      const endMs = new Date(p.end_time).getTime()
      const hours = Math.max(0, (endMs - startMs) / 3_600_000)
      return sum + hours
    }, 0)
}

/**
 * Group time entries by month, attaching working-day counts, scheduled
 * hours (from plans), actual hours (entry net_hours), and the difference.
 *
 * If a month has no scheduled plans, falls back to `targetHoursOverride`
 * if provided, otherwise to working_days × 8h.
 */
export function groupByMonth(
  entries: TimeEntry[],
  plans: Plan[],
  targetHoursOverride?: number,
): MonthlyTimeData[] {
  const months: Record<string, MonthlyTimeData> = {}

  for (const entry of entries) {
    const d = new Date(entry.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    if (!months[key]) {
      const year = d.getFullYear()
      const month = d.getMonth() + 1
      const workingDays = countWorkingDays(year, month)
      const scheduled = scheduledHoursForMonth(plans, year, month)
      months[key] = {
        key,
        year,
        month,
        workingDays,
        scheduledHours: scheduled || targetHoursOverride || workingDays * 8,
        actualHours: 0,
        difference: 0,
        entries: [],
      }
    }

    months[key].actualHours += Number(entry.net_hours) || 0
    months[key].entries.push(entry)
  }

  return Object.values(months)
    .map((m) => ({ ...m, difference: m.actualHours - m.scheduledHours }))
    .sort((a, b) => b.key.localeCompare(a.key))
}
