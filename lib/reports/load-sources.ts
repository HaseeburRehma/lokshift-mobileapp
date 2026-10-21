/**
 * Loads everything the report builders need for a date range — entries,
 * absences, special payments, approved per-diem claims and employees.
 * Shared by the Monatsnachweis, Gesamtauswertung and Mehrmonatsreport.
 */

import { localDateKey } from '@/lib/time/shift-hours'
import type {
  ReportAbsence,
  ReportEntry,
  ReportPerDiemClaim,
  ReportSpecialPayment,
} from './monthly-report'

export interface ReportEmployee {
  id: string
  name: string
  role: string
  isActive: boolean
  weeklyTargetHours: number | null
}

export interface ReportSources {
  entries: ReportEntry[]
  absences: ReportAbsence[]
  specialPayments: ReportSpecialPayment[]
  perDiemClaims: ReportPerDiemClaim[]
  employees: ReportEmployee[]
}

/** First and last calendar day (YYYY-MM-DD) of a month range. */
export function monthRange(from: string, to: string = from): { start: string; end: string } {
  const [ty, tm] = to.split('-').map(Number)
  const last = new Date(ty, tm, 0).getDate()
  return { start: `${from}-01`, end: `${to}-${String(last).padStart(2, '0')}` }
}

export async function loadReportSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  opts: { organizationId: string; fromMonth: string; toMonth?: string; employeeIds?: string[] },
): Promise<ReportSources> {
  const { start, end } = monthRange(opts.fromMonth, opts.toMonth ?? opts.fromMonth)
  const rangeStart = new Date(`${start}T00:00:00`).toISOString()
  const rangeEnd = new Date(`${end}T23:59:59`).toISOString()
  const ids = opts.employeeIds?.length ? opts.employeeIds : null

  // PostgREST caps every response (Supabase default 1000 rows) — page
  // through all result sets so totals are never silently truncated.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPages = async (build: () => any): Promise<{ data: Array<Record<string, any>>; error: any }> => {
    const data: Array<Record<string, any>> = []
    for (let from = 0; from < 100000; from += 1000) {
      const { data: page, error } = await build().range(from, from + 999)
      if (error) return { data, error }
      data.push(...((page ?? []) as Array<Record<string, any>>))
      if (!page || page.length < 1000) break
    }
    return { data, error: null }
  }

  const entriesQ = () => {
    let q = supabase
      .from('time_entries')
      .select(
        'id, employee_id, entered_by, date, start_time, end_time, break_minutes, net_hours, meal_allowance, overnight_stay, is_gastfahrt, is_planned, is_verified, submitted_at, corrected_at, notes, customer:customers(name), start_location:operational_locations!start_location_id(name, short_code), destination_location:operational_locations!destination_location_id(name, short_code)',
      )
      .eq('organization_id', opts.organizationId)
      .gte('date', start)
      .lte('date', end)
      .order('start_time')
      .order('id')
    if (ids) q = q.in('employee_id', ids)
    return q
  }

  const absQ = () => {
    let q = supabase
      .from('calendar_events')
      .select('id, creator_id, event_type, start_time, end_time, request_status, title')
      .eq('organization_id', opts.organizationId)
      .in('event_type', ['holiday', 'sick_leave'])
      .lte('start_time', rangeEnd)
      .gte('end_time', rangeStart)
      .order('id')
    if (ids) q = q.in('creator_id', ids)
    return q
  }

  const legacyAbsQ = () => {
    let q = supabase
      .from('absences')
      .select('id, user_id, type, start_date, end_date, status')
      .eq('organization_id', opts.organizationId)
      .lte('start_date', end)
      .gte('end_date', start)
      .order('id')
    if (ids) q = q.in('user_id', ids)
    return q
  }

  // Only payments that touch the period: one-off in a month of the range,
  // or monthly/pro-rata periods overlapping it.
  const payQ = () => {
    let q = supabase
      .from('holiday_bonuses')
      .select('id, employee_id, title, amount, distribution, billing_month, period_start, period_end, notes, bonus_type')
      .eq('organization_id', opts.organizationId)
      .or(`and(billing_month.gte.${start},billing_month.lte.${end}),and(period_start.lte.${end},period_end.gte.${start})`)
      .order('id')
    if (ids) q = q.in('employee_id', ids)
    return q
  }

  // Approved claims overlapping the period (multi-day claims use
  // start_date/end_date, older single-day ones only `date`).
  const perDiemQ = () => {
    let q = supabase
      .from('per_diems')
      .select('id, employee_id, date, start_date, end_date, amount, num_days, task, status')
      .eq('organization_id', opts.organizationId)
      .eq('status', 'approved')
      .or(`and(start_date.lte.${end},end_date.gte.${start}),and(date.gte.${start},date.lte.${end})`)
      .order('id')
    if (ids) q = q.in('employee_id', ids)
    return q
  }

  const empQ = () => {
    let q = supabase
      .from('profiles')
      .select('id, full_name, role, is_active, target_hours')
      .eq('organization_id', opts.organizationId)
      .order('full_name')
      .order('id')
    if (ids) q = q.in('id', ids)
    return q
  }

  const [entriesRes, absRes, legacyRes, payRes, perDiemRes, empRes] = await Promise.all([
    allPages(entriesQ), allPages(absQ), allPages(legacyAbsQ), allPages(payQ), allPages(perDiemQ), allPages(empQ),
  ])

  // The legacy `absences` table may not exist in every installation.
  if (legacyRes.error) console.warn('[load-sources] legacy absences skipped:', legacyRes.error.message)
  const firstError = [entriesRes, absRes, payRes, perDiemRes, empRes].find((r) => r.error)?.error
  if (firstError) throw firstError

  const absences: ReportAbsence[] = []
  for (const a of (absRes.data ?? []) as Array<Record<string, any>>) {
    if ((a.request_status ?? 'approved') !== 'approved') continue
    absences.push({
      employee_id: a.creator_id,
      start_date: localDateKey(new Date(a.start_time)),
      end_date: localDateKey(new Date(new Date(a.end_time).getTime() - 60_000)),
      kind: a.event_type === 'sick_leave' ? 'sick' : 'vacation',
    })
  }
  for (const a of (legacyRes.data ?? []) as Array<Record<string, any>>) {
    if (a.status !== 'approved') continue
    absences.push({
      employee_id: a.user_id,
      start_date: a.start_date,
      end_date: a.end_date,
      kind: a.type === 'sick' ? 'sick' : a.type === 'vacation' ? 'vacation' : 'other',
    })
  }

  const specialPayments: ReportSpecialPayment[] = ((payRes.data ?? []) as Array<Record<string, any>>).map((p) => ({
    id: p.id,
    employee_id: p.employee_id,
    title: p.title || 'Sonderzahlung',
    amount: Number(p.amount) || 0,
    distribution: (p.distribution ?? 'once') as ReportSpecialPayment['distribution'],
    billing_month: p.billing_month,
    period_start: p.period_start,
    period_end: p.period_end,
    notes: p.notes,
  }))

  const perDiemClaims: ReportPerDiemClaim[] = ((perDiemRes.data ?? []) as Array<Record<string, any>>)
    .map((c) => ({
      id: c.id,
      employee_id: c.employee_id,
      start_date: c.start_date ?? c.date,
      end_date: c.end_date ?? c.start_date ?? c.date,
      amount: Number(c.amount) || 0,
      num_days: c.num_days,
      task: c.task,
    }))
    .filter((c) => !!c.start_date && c.end_date >= start && c.start_date <= end)

  const employees: ReportEmployee[] = ((empRes.data ?? []) as Array<Record<string, any>>).map((p) => ({
    id: p.id,
    name: p.full_name || '—',
    role: String(p.role ?? 'employee').toLowerCase(),
    isActive: p.is_active !== false,
    weeklyTargetHours: p.target_hours == null ? null : Number(p.target_hours),
  }))

  return {
    entries: (entriesRes.data ?? []) as unknown as ReportEntry[],
    absences,
    specialPayments,
    perDiemClaims,
    employees,
  }
}
