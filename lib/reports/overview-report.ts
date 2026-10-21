/**
 * Gesamtauswertung (all drivers, one month) and Mehrmonatsreport (one
 * driver, several months) — identical copy in the webapp and the mobile
 * app. Both are assembled from `buildMonthlyReport`, so every value equals
 * the corresponding monthly statement (Kundenfeedback Punkt 18).
 */

import {
  buildMonthlyReport,
  type ReportAbsence,
  type ReportEntry,
  type ReportPerDiemClaim,
  type ReportSpecialPayment,
} from './monthly-report'
import { DEFAULT_SURCHARGE_RULES, type SurchargeRules } from '@/lib/time/zuschlag'
import type { SpesenRates } from '@/lib/spesen'
import { monthLabel, type Locale } from '@/lib/time/format'

export interface OverviewEmployee {
  id: string
  name: string
  weeklyTargetHours?: number | null
}

export interface OverviewRow {
  key: string
  label: string
  employeeId: string
  month: string
  targetHours: number | null
  workHours: number
  gastfahrtHours: number
  actualHours: number
  differenceHours: number | null
  vacationDays: number
  sickDays: number
  workingDays: number
  openEntries: number
  issueCount: number
  spesenTotal: number
  specialPaymentsTotal: number
}

export interface OverviewTotals {
  targetHours: number | null
  workHours: number
  gastfahrtHours: number
  actualHours: number
  differenceHours: number | null
  vacationDays: number
  sickDays: number
  workingDays: number
  openEntries: number
  issueCount: number
  spesenTotal: number
  specialPaymentsTotal: number
}

interface SharedInput {
  entries: ReportEntry[]
  absences?: ReportAbsence[]
  specialPayments?: ReportSpecialPayment[]
  perDiemClaims?: ReportPerDiemClaim[]
  rules?: SurchargeRules
  spesenRates?: SpesenRates
  locale?: Locale
  now?: Date
}

const r2 = (n: number) => Math.round(n * 100) / 100

function rowFor(employee: OverviewEmployee, month: string, label: string, input: SharedInput): OverviewRow {
  const report = buildMonthlyReport({
    employee: { id: employee.id, name: employee.name },
    month,
    entries: input.entries,
    absences: input.absences,
    specialPayments: input.specialPayments,
    perDiemClaims: input.perDiemClaims,
    weeklyTargetHours: employee.weeklyTargetHours,
    rules: input.rules,
    spesenRates: input.spesenRates,
    locale: input.locale,
    now: input.now,
  })
  const t = report.totals
  return {
    key: `${employee.id}:${month}`,
    label,
    employeeId: employee.id,
    month,
    targetHours: t.targetHours,
    workHours: t.workHours,
    gastfahrtHours: t.gastfahrtHours,
    actualHours: t.actualHours,
    differenceHours: t.differenceHours,
    vacationDays: t.vacationDays,
    sickDays: t.sickDays,
    workingDays: t.workingDays,
    openEntries: t.openEntries,
    issueCount: t.issueCount,
    spesenTotal: t.spesenTotal,
    specialPaymentsTotal: t.specialPaymentsTotal,
  }
}

function totalsOf(rows: OverviewRow[]): OverviewTotals {
  const sum = (f: (r: OverviewRow) => number) => r2(rows.reduce((s, r) => s + f(r), 0))
  const hasTarget = rows.some((r) => r.targetHours != null)
  const target = hasTarget ? sum((r) => r.targetHours ?? 0) : null
  const actual = sum((r) => r.actualHours)
  return {
    targetHours: target,
    workHours: sum((r) => r.workHours),
    gastfahrtHours: sum((r) => r.gastfahrtHours),
    actualHours: actual,
    differenceHours: target == null ? null : r2(actual - target),
    vacationDays: sum((r) => r.vacationDays),
    sickDays: sum((r) => r.sickDays),
    workingDays: sum((r) => r.workingDays),
    openEntries: sum((r) => r.openEntries),
    issueCount: sum((r) => r.issueCount),
    spesenTotal: sum((r) => r.spesenTotal),
    specialPaymentsTotal: sum((r) => r.specialPaymentsTotal),
  }
}

export interface MonthOverview {
  month: string
  monthLabel: string
  createdAt: string
  /** Whether Ist includes Gastfahrt (legend text follows the setting). */
  gastfahrtCountsAsWork: boolean
  rows: OverviewRow[]
  totals: OverviewTotals
}

/** "April / Alle Lokführer" — one row per employee plus totals. */
export function buildMonthOverview(
  input: SharedInput & { month: string; employees: OverviewEmployee[] },
): MonthOverview {
  const locale = input.locale ?? 'de'
  const rows = [...input.employees]
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((e) => rowFor(e, input.month, e.name, input))
  return {
    month: input.month,
    monthLabel: monthLabel(input.month, locale),
    createdAt: (input.now ?? new Date()).toISOString(),
    gastfahrtCountsAsWork: (input.rules ?? DEFAULT_SURCHARGE_RULES).gastfahrtCountsAsWork,
    rows,
    totals: totalsOf(rows),
  }
}

export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const out: string[] = []
  let y = fy
  let m = fm
  for (let i = 0; i < 60 && (y < ty || (y === ty && m <= tm)); i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

export interface MultiMonthReport {
  employee: OverviewEmployee
  from: string
  to: string
  periodLabel: string
  createdAt: string
  gastfahrtCountsAsWork: boolean
  rows: OverviewRow[]
  totals: OverviewTotals
}

/** "Mitarbeiter A / Januar bis Juni" — one row per month plus period totals. */
export function buildMultiMonthReport(
  input: SharedInput & { employee: OverviewEmployee; from: string; to: string },
): MultiMonthReport {
  const locale = input.locale ?? 'de'
  const months = monthsBetween(input.from, input.to)
  const rows = months.map((m) => rowFor(input.employee, m, monthLabel(m, locale), input))
  return {
    employee: input.employee,
    from: input.from,
    to: input.to,
    periodLabel: `${monthLabel(input.from, locale)} – ${monthLabel(input.to, locale)}`,
    createdAt: (input.now ?? new Date()).toISOString(),
    gastfahrtCountsAsWork: (input.rules ?? DEFAULT_SURCHARGE_RULES).gastfahrtCountsAsWork,
    rows,
    totals: totalsOf(rows),
  }
}
