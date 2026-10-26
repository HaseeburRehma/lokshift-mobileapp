/**
 * Monatsnachweis (monthly timesheet) data model — identical copy in the
 * webapp and the mobile app.
 *
 * Every view of a month (screen, PDF, Excel, all-driver overview,
 * multi-month report) is built from `buildMonthlyReport`, so the numbers
 * are guaranteed to match everywhere (Kundenfeedback Punkte 5 und 18).
 *
 * Conventions (shown in the report legend):
 *   - A shift belongs to the month and day of its start.
 *   - Arbeitszeit = net hours of regular shifts; Gastfahrt hours are shown
 *     separately and never counted twice.
 *   - Ist = Arbeitszeit (+ Gastfahrt when the organisation counts it as
 *     working time).
 *   - Soll = weekly target ÷ 5 × weekdays (Mon–Fri, no public holiday)
 *     minus approved vacation/sick weekdays.
 *   - Spesen are counted at most once per calendar day.
 *   - Planned (future) entries are not part of the statement.
 */

import { calculateSurcharges, publicHolidayName, type SurchargeRules, DEFAULT_SURCHARGE_RULES } from '@/lib/time/zuschlag'
import { DEFAULT_SPESEN_RATES, spesenKind, type SpesenRates } from '@/lib/spesen'
import { formatTimeOfDay, monthLabel, weekdayName, type Locale } from '@/lib/time/format'
import { endDayOffset, entryNetHours, shiftIssues, type ShiftIssue } from '@/lib/time/shift-hours'
import { weekdayOfDateKey } from '@/lib/time/berlin'

export interface ReportLocation {
  name: string
  short_code?: string | null
}

export interface ReportEntry {
  id: string
  employee_id: string
  date: string
  start_time: string
  end_time: string | null
  break_minutes: number | null
  net_hours: number | null
  meal_allowance?: number | null
  overnight_stay?: boolean | null
  is_gastfahrt?: boolean | null
  is_planned?: boolean | null
  is_verified?: boolean | null
  submitted_at?: string | null
  corrected_at?: string | null
  entered_by?: string | null
  notes?: string | null
  customer?: { name: string } | null
  start_location?: ReportLocation | null
  destination_location?: ReportLocation | null
}

export type AbsenceKind = 'vacation' | 'sick' | 'other'

export interface ReportAbsence {
  employee_id: string
  start_date: string
  end_date: string
  kind: AbsenceKind
  label?: string | null
}

export type PaymentDistribution = 'once' | 'monthly' | 'prorata'

export interface ReportSpecialPayment {
  id: string
  employee_id: string
  title: string
  amount: number
  distribution: PaymentDistribution
  billing_month?: string | null
  period_start?: string | null
  period_end?: string | null
  notes?: string | null
}

export interface ReportPerDiemClaim {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  amount: number
  num_days?: number | null
  task?: string | null
}

export type EntryStatus = 'running' | 'draft' | 'submitted' | 'approved'

export interface MonthlyReportRow {
  entryId: string
  date: string
  start: string
  end: string
  endDayOffset: number
  breakMinutes: number
  netHours: number
  workHours: number
  gastfahrtHours: number
  spesen: number
  overnight: boolean
  night25: number
  night40: number
  sunday: number
  holiday: number
  status: EntryStatus
  corrected: boolean
  enteredOnBehalf: boolean
  issues: ShiftIssue[]
  customer: string | null
  route: string | null
  notes: string | null
}

export type DayState = 'work' | 'incomplete' | 'absence' | 'free'

export interface MonthlyReportDay {
  date: string
  weekday: string
  weekdayShort: string
  isSunday: boolean
  isWeekend: boolean
  holidayName: string | null
  absence: { kind: AbsenceKind; label: string } | null
  rows: MonthlyReportRow[]
  /** Spesen counted for this day (max of the day's entries). */
  daySpesen: number
  state: DayState
}

export interface SpesenLine {
  kind: 'partial' | 'full' | 'other'
  label: string
  rate: number | null
  count: number
  amount: number
}

export interface SpecialPaymentLine {
  id: string
  title: string
  periodLabel: string
  amount: number
  note: string | null
}

export interface MonthlyReportTotals {
  workingDays: number
  weekdays: number
  dailyTargetHours: number | null
  absenceWeekdays: number
  targetHours: number | null
  workHours: number
  gastfahrtHours: number
  actualHours: number
  differenceHours: number | null
  night25: number
  night40: number
  sunday: number
  holiday: number
  overnightCount: number
  spesen: SpesenLine[]
  spesenFromEntries: number
  perDiemClaims: { count: number; amount: number }
  spesenTotal: number
  specialPayments: SpecialPaymentLine[]
  specialPaymentsTotal: number
  vacationDays: number
  sickDays: number
  otherAbsenceDays: number
  openEntries: number
  runningEntries: number
  issueCount: number
}

export interface MonthlyReport {
  employee: { id: string; name: string }
  month: string
  monthLabel: string
  createdAt: string
  locale: Locale
  rules: SurchargeRules
  days: MonthlyReportDay[]
  totals: MonthlyReportTotals
  approval: {
    state: 'approved' | 'partial' | 'open' | 'empty'
    approved: number
    total: number
    label: string
  }
  hasCorrections: boolean
  warnings: string[]
}

export interface MonthlyReportInput {
  employee: { id: string; name: string }
  /** YYYY-MM */
  month: string
  entries: ReportEntry[]
  absences?: ReportAbsence[]
  specialPayments?: ReportSpecialPayment[]
  perDiemClaims?: ReportPerDiemClaim[]
  /** profiles.target_hours (per week). */
  weeklyTargetHours?: number | null
  rules?: SurchargeRules
  spesenRates?: SpesenRates
  locale?: Locale
  now?: Date
}

const r2 = (n: number) => Math.round(n * 100) / 100

function daysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  const count = new Date(y, m, 0).getDate()
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}

function monthIndex(dateOrMonth: string): number {
  const [y, m] = dateOrMonth.split('-').map(Number)
  return y * 12 + (m - 1)
}

function overlapsDay(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}

function entryStatus(e: ReportEntry): EntryStatus {
  if (!e.end_time) return 'running'
  if (e.is_verified) return 'approved'
  if (e.submitted_at) return 'submitted'
  return 'draft'
}

function absenceLabel(kind: AbsenceKind, locale: Locale, label?: string | null): string {
  if (label) return label
  if (kind === 'vacation') return locale === 'de' ? 'Urlaub' : 'Vacation'
  if (kind === 'sick') return locale === 'de' ? 'Krank' : 'Sick'
  return locale === 'de' ? 'Abwesend' : 'Absent'
}

function routeLabel(e: ReportEntry): string | null {
  const a = e.start_location?.short_code || e.start_location?.name
  const b = e.destination_location?.short_code || e.destination_location?.name
  if (a && b) return `${a} → ${b}`
  return a || b || null
}

/** Amount of a special payment that falls into `month`, or null. */
export function specialPaymentForMonth(
  p: ReportSpecialPayment,
  month: string,
): { amount: number; periodLabel: string } | null {
  const fmt = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`
  if (p.distribution === 'once') {
    if (!p.billing_month || p.billing_month.slice(0, 7) !== month) return null
    return { amount: r2(Number(p.amount) || 0), periodLabel: fmt(p.billing_month) }
  }
  if (!p.period_start || !p.period_end) return null
  const from = monthIndex(p.period_start)
  const to = monthIndex(p.period_end)
  const cur = monthIndex(month)
  if (cur < from || cur > to) return null
  const months = to - from + 1
  const range = `${fmt(p.period_start)} – ${fmt(p.period_end)}`
  if (p.distribution === 'monthly') {
    return { amount: r2(Number(p.amount) || 0), periodLabel: `${range}, monatlich` }
  }
  // Pro-rata: split evenly; the last month absorbs rounding so the sum is exact.
  const base = Math.floor(((Number(p.amount) || 0) / months) * 100) / 100
  const isLast = cur === to
  const amount = isLast ? r2((Number(p.amount) || 0) - base * (months - 1)) : base
  return { amount, periodLabel: `${range}, anteilig ${cur - from + 1}/${months}` }
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const locale = input.locale ?? 'de'
  const rules = input.rules ?? DEFAULT_SURCHARGE_RULES
  const rates = input.spesenRates ?? DEFAULT_SPESEN_RATES
  const empId = input.employee.id
  const dates = daysOfMonth(input.month)
  const warnings: string[] = []

  const entries = input.entries
    .filter((e) => e.employee_id === empId && !e.is_planned && e.date?.slice(0, 7) === input.month)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const absences = (input.absences ?? []).filter((a) => a.employee_id === empId)
  const claims = (input.perDiemClaims ?? []).filter((c) => c.employee_id === empId)

  const days: MonthlyReportDay[] = dates.map((date) => {
    const weekdayIdx = weekdayOfDateKey(date)
    const absence = absences.find((a) => overlapsDay(date, a.start_date, a.end_date)) ?? null

    const rows: MonthlyReportRow[] = entries
      .filter((e) => e.date === date)
      .map((e) => {
        const net = entryNetHours(e)
        const isGast = !!e.is_gastfahrt
        const z = calculateSurcharges(e.start_time, e.end_time, { isGastfahrt: isGast, netHours: net, rules })
        return {
          entryId: e.id,
          date,
          start: formatTimeOfDay(e.start_time),
          end: formatTimeOfDay(e.end_time),
          endDayOffset: endDayOffset(e.start_time, e.end_time),
          breakMinutes: Number(e.break_minutes) || 0,
          netHours: net,
          workHours: isGast ? 0 : net,
          gastfahrtHours: isGast ? net : 0,
          spesen: r2(Number(e.meal_allowance) || 0),
          overnight: !!e.overnight_stay,
          night25: z.night25,
          night40: z.night40,
          sunday: z.sunday,
          holiday: z.holiday,
          status: entryStatus(e),
          corrected: !!e.corrected_at,
          enteredOnBehalf: !!e.entered_by && e.entered_by !== e.employee_id,
          issues: shiftIssues(e),
          customer: e.customer?.name ?? null,
          route: routeLabel(e),
          notes: e.notes ?? null,
        }
      })

    const daySpesen = rows.reduce((max, r) => Math.max(max, r.spesen), 0)
    const state: DayState = rows.some((r) => r.issues.length > 0 || r.status === 'running')
      ? 'incomplete'
      : rows.length > 0
        ? 'work'
        : absence
          ? 'absence'
          : 'free'

    return {
      date,
      weekday: weekdayName(date, locale),
      weekdayShort: weekdayName(date, locale, true),
      isSunday: weekdayIdx === 0,
      isWeekend: weekdayIdx === 0 || weekdayIdx === 6,
      holidayName: publicHolidayName(date, rules),
      absence: absence ? { kind: absence.kind, label: absenceLabel(absence.kind, locale, absence.label) } : null,
      rows,
      daySpesen,
      state,
    }
  })

  const allRows = days.flatMap((d) => d.rows)
  const sum = (f: (r: MonthlyReportRow) => number) => r2(allRows.reduce((s, r) => s + f(r), 0))

  // Weekdays (Mon–Fri) without a premium-relevant or any public holiday.
  const isTargetDay = (d: MonthlyReportDay) => !d.isWeekend && !d.holidayName
  const weekdays = days.filter(isTargetDay).length
  const absenceWeekdays = days.filter((d) => isTargetDay(d) && d.absence).length
  const weekly = Number(input.weeklyTargetHours)
  const dailyTarget = Number.isFinite(weekly) && weekly > 0 ? r2(weekly / 5) : null
  const targetHours = dailyTarget == null ? null : r2(dailyTarget * Math.max(0, weekdays - absenceWeekdays))

  const workHours = sum((r) => r.workHours)
  const gastfahrtHours = sum((r) => r.gastfahrtHours)
  const actualHours = r2(workHours + (rules.gastfahrtCountsAsWork ? gastfahrtHours : 0))

  // Spesen: once per day, grouped by rate.
  const spesenMap = new Map<string, SpesenLine>()
  for (const d of days) {
    if (d.daySpesen <= 0) continue
    const kind = spesenKind(d.daySpesen, rates)
    const k = kind === 'none' ? 'other' : kind
    const key = k === 'other' ? `other:${d.daySpesen}` : k
    const line = spesenMap.get(key) ?? {
      kind: k,
      label:
        k === 'full'
          ? locale === 'de' ? `Vollsatz ${rates.full} € (Übernachtung)` : `Full rate ${rates.full} € (overnight)`
          : k === 'partial'
            ? locale === 'de' ? `Teilsatz ${rates.partial} € (über 8 Std.)` : `Partial rate ${rates.partial} € (over 8 h)`
            : locale === 'de' ? `Sonstiger Satz ${d.daySpesen} €` : `Other rate ${d.daySpesen} €`,
      rate: k === 'full' ? rates.full : k === 'partial' ? rates.partial : d.daySpesen,
      count: 0,
      amount: 0,
    }
    line.count += 1
    line.amount = r2(line.amount + d.daySpesen)
    spesenMap.set(key, line)
    const multi = d.rows.filter((r) => r.spesen > 0).length
    if (multi > 1) {
      warnings.push(
        locale === 'de'
          ? `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}.: mehrere Schichten mit Spesen – nur einmal gezählt.`
          : `${d.date}: several shifts with per diem – counted once.`,
      )
    }
  }
  const order = { partial: 0, full: 1, other: 2 }
  const spesen = [...spesenMap.values()].sort((a, b) => order[a.kind] - order[b.kind])
  const spesenFromEntries = r2(spesen.reduce((s, l) => s + l.amount, 0))

  // Approved per-diem claims (Spesenanträge), pro-rated to this month.
  let claimAmount = 0
  let claimCount = 0
  for (const c of claims) {
    const start = c.start_date
    const end = c.end_date || c.start_date
    const inMonth = dates.filter((d) => overlapsDay(d, start, end))
    if (inMonth.length === 0) continue
    const claimDays = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1)
    // Without num_days the claim covers its own date range (not the month).
    const totalDays = Math.max(1, Number(c.num_days) || claimDays)
    const perDay = (Number(c.amount) || 0) / Math.max(totalDays, claimDays)
    claimAmount += perDay * inMonth.length
    claimCount += 1
    for (const d of inMonth) {
      const day = days.find((x) => x.date === d)
      if (day && day.daySpesen > 0) {
        warnings.push(
          locale === 'de'
            ? `${d.slice(8, 10)}.${d.slice(5, 7)}.: Spesenantrag und Schicht-Spesen am selben Tag – bitte prüfen.`
            : `${d}: per-diem claim and shift per diem on the same day – please check.`,
        )
      }
    }
  }
  claimAmount = r2(claimAmount)

  const specialPayments: SpecialPaymentLine[] = []
  for (const p of (input.specialPayments ?? []).filter((x) => x.employee_id === empId)) {
    const share = specialPaymentForMonth(p, input.month)
    if (!share) continue
    specialPayments.push({ id: p.id, title: p.title, periodLabel: share.periodLabel, amount: share.amount, note: p.notes ?? null })
  }
  const specialPaymentsTotal = r2(specialPayments.reduce((s, p) => s + p.amount, 0))

  // Urlaubs-/Krankheitstage = Arbeitstage (Mo–Fr ohne Feiertag) with an
  // approved absence — same basis as the Soll reduction and the legend.
  const countAbsence = (kind: AbsenceKind) => days.filter((d) => isTargetDay(d) && d.absence?.kind === kind).length
  const finished = allRows.filter((r) => r.status !== 'running')
  const approved = finished.filter((r) => r.status === 'approved').length
  const openEntries = allRows.filter((r) => r.status !== 'approved').length
  const runningEntries = allRows.filter((r) => r.status === 'running').length

  const approvalState: MonthlyReport['approval']['state'] =
    allRows.length === 0 ? 'empty' : approved === allRows.length ? 'approved' : approved === 0 ? 'open' : 'partial'
  const approvalLabel =
    locale === 'de'
      ? approvalState === 'empty'
        ? 'Keine Einträge'
        : approvalState === 'approved'
          ? 'Vollständig freigegeben'
          : `${approved} von ${allRows.length} Einträgen freigegeben`
      : approvalState === 'empty'
        ? 'No entries'
        : approvalState === 'approved'
          ? 'Fully approved'
          : `${approved} of ${allRows.length} entries approved`

  const totals: MonthlyReportTotals = {
    workingDays: days.filter((d) => d.rows.some((r) => r.netHours > 0)).length,
    weekdays,
    dailyTargetHours: dailyTarget,
    absenceWeekdays,
    targetHours,
    workHours,
    gastfahrtHours,
    actualHours,
    differenceHours: targetHours == null ? null : r2(actualHours - targetHours),
    night25: sum((r) => r.night25),
    night40: sum((r) => r.night40),
    sunday: sum((r) => r.sunday),
    holiday: sum((r) => r.holiday),
    overnightCount: days.filter((d) => d.rows.some((r) => r.overnight)).length,
    spesen,
    spesenFromEntries,
    perDiemClaims: { count: claimCount, amount: claimAmount },
    spesenTotal: r2(spesenFromEntries + claimAmount),
    specialPayments,
    specialPaymentsTotal,
    vacationDays: countAbsence('vacation'),
    sickDays: countAbsence('sick'),
    otherAbsenceDays: countAbsence('other'),
    openEntries,
    runningEntries,
    issueCount: allRows.filter((r) => r.issues.length > 0).length,
  }

  return {
    employee: input.employee,
    month: input.month,
    monthLabel: monthLabel(input.month, locale),
    createdAt: (input.now ?? new Date()).toISOString(),
    locale,
    rules,
    days,
    totals,
    approval: { state: approvalState, approved, total: allRows.length, label: approvalLabel },
    hasCorrections: allRows.some((r) => r.corrected),
    warnings: [...new Set(warnings)],
  }
}

