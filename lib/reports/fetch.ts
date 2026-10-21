/**
 * Loads the sources once and builds the shared report models on the
 * device — Monatsnachweis (one or many employees), Gesamtauswertung and
 * Mehrmonatsreport. Same builders as the webapp, so PDFs/Excel files from
 * the app and the webapp show identical values (Kundenfeedback 5 + 18).
 */

import { getSupabase } from '@/lib/supabase/client'
import type { SpesenRates } from '@/lib/spesen'
import type { SurchargeRules } from '@/lib/time/zuschlag'
import type { Locale } from '@/lib/time/format'
import { loadReportSources } from './load-sources'
import { buildMonthlyReport, type MonthlyReport } from './monthly-report'
import { buildMonthOverview, buildMultiMonthReport, type MonthOverview, type MultiMonthReport } from './overview-report'

/** Roles that count as "Lokführer" in the all-drivers overview (same as webapp). */
export const DRIVER_ROLES = ['employee', 'technician']

export interface ReportRules {
  surchargeRules: SurchargeRules
  spesenRates: SpesenRates
  locale: Locale
}

/** One Monatsnachweis per (employee, month) pair, in the given order. */
export async function fetchMonthlyReports(
  organizationId: string,
  pairs: { employeeId: string; month: string; name?: string }[],
  rules: ReportRules,
): Promise<MonthlyReport[]> {
  if (pairs.length === 0) return []
  const months = pairs.map((p) => p.month).sort()
  const ids = Array.from(new Set(pairs.map((p) => p.employeeId)))
  const s = await loadReportSources(getSupabase(), {
    organizationId,
    fromMonth: months[0],
    toMonth: months[months.length - 1],
    employeeIds: ids,
  })
  return pairs.map((p) => {
    const emp = s.employees.find((e) => e.id === p.employeeId)
    return buildMonthlyReport({
      employee: { id: p.employeeId, name: emp?.name ?? p.name ?? '—' },
      month: p.month,
      entries: s.entries,
      absences: s.absences,
      specialPayments: s.specialPayments,
      perDiemClaims: s.perDiemClaims,
      weeklyTargetHours: emp?.weeklyTargetHours ?? null,
      rules: rules.surchargeRules,
      spesenRates: rules.spesenRates,
      locale: rules.locale,
    })
  })
}

/** "Monat X / alle Lokführer" — active drivers, optionally everyone. */
export async function fetchMonthOverview(
  organizationId: string,
  month: string,
  rules: ReportRules,
  includeAllRoles = false,
): Promise<MonthOverview> {
  const s = await loadReportSources(getSupabase(), { organizationId, fromMonth: month })
  const employees = s.employees
    .filter((e) => e.isActive && (includeAllRoles || DRIVER_ROLES.includes(e.role)))
    .map((e) => ({ id: e.id, name: e.name, weeklyTargetHours: e.weeklyTargetHours }))
  return buildMonthOverview({
    month,
    employees,
    entries: s.entries,
    absences: s.absences,
    specialPayments: s.specialPayments,
    perDiemClaims: s.perDiemClaims,
    rules: rules.surchargeRules,
    spesenRates: rules.spesenRates,
    locale: rules.locale,
  })
}

/** "Mitarbeiter A / Januar bis Juni" — one row per month. */
export async function fetchMultiMonthReport(
  organizationId: string,
  employeeId: string,
  fromMonth: string,
  toMonth: string,
  rules: ReportRules,
): Promise<MultiMonthReport | null> {
  const from = fromMonth <= toMonth ? fromMonth : toMonth
  const to = fromMonth <= toMonth ? toMonth : fromMonth
  const s = await loadReportSources(getSupabase(), { organizationId, fromMonth: from, toMonth: to, employeeIds: [employeeId] })
  const emp = s.employees.find((e) => e.id === employeeId)
  if (!emp) return null
  return buildMultiMonthReport({
    employee: { id: emp.id, name: emp.name, weeklyTargetHours: emp.weeklyTargetHours },
    from,
    to,
    entries: s.entries,
    absences: s.absences,
    specialPayments: s.specialPayments,
    perDiemClaims: s.perDiemClaims,
    rules: rules.surchargeRules,
    spesenRates: rules.spesenRates,
    locale: rules.locale,
  })
}

/** File-name friendly name: "Max Müller" → "Max-Mueller". */
export function fileSlug(name: string): string {
  return (
    name
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'Mitarbeiter'
  )
}
