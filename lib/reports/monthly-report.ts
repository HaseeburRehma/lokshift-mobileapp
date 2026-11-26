/**
 * Monatsnachweis (monthly timesheet) data model — identical copy in the
 * webapp and the mobile app.
 *
 * Every view of a month (screen, PDF, Excel, all-driver overview,
 * multi-month report) is built from `buildMonthlyReport`, so the numbers
 * are guaranteed to match everywhere (Kundenfeedback Punkte 5 und 18).
 *
 * Conventions (shown in the report legend):
 *   - A shift belongs to the month and day of its start (with all of its
 *     surcharges and Spesen); surcharges still follow the real date and
 *     clock time of every minute (billing spec sections 3 and 6).
 *   - Arbeitszeit = net hours of regular shifts; Gastfahrt hours are shown
 *     separately, never count as working time and are paid at their own
 *     hourly wage (billing spec section 5).
 *   - Ist = Arbeitszeit.
 *   - With an hourly wage on file, surcharges are also shown in euros:
 *     minutes × wage × rate, on the regular gross wage (no cascading).
 *   - Soll = weekly target ÷ 5 × weekdays (Mon–Fri, no public holiday)
 *     minus approved vacation/sick weekdays.
 *   - Spesen: exactly one value per shift (0 / 14 / 28 €, billing spec §4).
 *   - Planned (future) entries are not part of the statement.
 *   - A planned shift whose end has passed without any time entry is shown
 *     as "Geplant – keine Zeit erfasst" and counted as missing (QA P1-1).
 */

import {
  bucketLabel,
  bucketPct,
  calculateSurcharges,
  DEFAULT_SURCHARGE_RULES,
  EMPTY_MINUTES,
  minutesToHours,
  publicHolidayName,
  rulesForState,
  SURCHARGE_BUCKETS,
  surchargeAmount,
  weightedSurchargeHours,
  type SurchargeBucket,
  type SurchargeMinutes,
  type BreakPeriod,
  type SurchargeRules,
} from '@/lib/time/zuschlag'
import { DEFAULT_SPESEN_RATES, spesenKind, type SpesenRates } from '@/lib/spesen'
import { formatEuro, formatTimeOfDay, monthLabel, weekdayName, type Locale } from '@/lib/time/format'
import { endDayOffset, entryNetHours, shiftIssues, type ShiftIssue } from '@/lib/time/shift-hours'
import { berlinDateKey, weekdayOfDateKey } from '@/lib/time/berlin'

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
  /** Real break times (clock / "Pause ab"); surcharges skip these minutes. */
  break_periods?: BreakPeriod[] | null
  net_hours: number | null
  meal_allowance?: number | null
  overnight_stay?: boolean | null
  is_gastfahrt?: boolean | null
  is_planned?: boolean | null
  is_verified?: boolean | null
  submitted_at?: string | null
  corrected_at?: string | null
  entered_by?: string | null
  plan_id?: string | null
  notes?: string | null
  customer?: { name: string } | null
  start_location?: ReportLocation | null
  destination_location?: ReportLocation | null
}

export type AbsenceKind = 'vacation' | 'sick' | 'other'

/** A planned shift (plans table) — used to find shifts without a time entry. */
export interface ReportPlan {
  id: string
  employee_id: string | null
  start_time: string
  end_time: string
  status?: string | null
  shift_name?: string | null
  route?: string | null
  is_gastfahrt?: boolean | null
  customer?: { name: string } | null
  start_location?: ReportLocation | null
  destination_location?: ReportLocation | null
}

/** Planned shift whose end has passed without any time entry. */
export interface MissingShift {
  planId: string
  date: string
  start: string
  end: string
  endDayOffset: number
  label: string | null
  customer: string | null
  route: string | null
  isGastfahrt: boolean
}

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
  christmas: number
  newYearsEve: number
  /** Exact surcharge minutes of this shift. */
  surchargeMinutes: SurchargeMinutes
  status: EntryStatus
  corrected: boolean
  enteredOnBehalf: boolean
  issues: ShiftIssue[]
  customer: string | null
  route: string | null
  notes: string | null
}

export type DayState = 'work' | 'incomplete' | 'missing' | 'absence' | 'free'

export interface MonthlyReportDay {
  date: string
  weekday: string
  weekdayShort: string
  isSunday: boolean
  isWeekend: boolean
  holidayName: string | null
  absence: { kind: AbsenceKind; label: string } | null
  rows: MonthlyReportRow[]
  /** Planned shifts of this day that were never recorded. */
  missing: MissingShift[]
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

/** One surcharge line of the statement (hours always, euros with a wage). */
export interface SurchargeLine {
  bucket: SurchargeBucket
  label: string
  pct: number
  minutes: number
  hours: number
  /** minutes × hourly wage × rate; null without a wage on file. */
  amount: number | null
}

/**
 * One pay rate of the employee (employee_pay_rates), valid from a date
 * until the next rate. A shift is paid with the rate of its start day.
 */
export interface ReportPayRate {
  /** YYYY-MM-DD */
  validFrom: string
  hourlyWage: number | null
  guestHourlyWage: number | null
}

/** Rate valid on `date` (latest validFrom ≤ date), else null. */
export function payRateOn(rates: ReportPayRate[] | null | undefined, date: string): ReportPayRate | null {
  let best: ReportPayRate | null = null
  for (const r of rates ?? []) if (r.validFrom <= date && (!best || r.validFrom > best.validFrom)) best = r
  return best
}

const positive = (n: unknown): number | null => {
  const v = Number(n)
  return n != null && Number.isFinite(v) && v > 0 ? v : null
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
  christmas: number
  newYearsEve: number
  surchargeMinutes: SurchargeMinutes
  surchargeLines: SurchargeLine[]
  /** Σ hours × rate — times the hourly wage = surcharge euros. */
  weightedSurchargeHours: number
  /** Hourly wage(s) of the month: one value, or null when none/several. */
  hourlyWage: number | null
  guestHourlyWage: number | null
  /** All different wages used this month with their first day. */
  wagesUsed: { from: string; hourlyWage: number | null; guestHourlyWage: number | null }[]
  /** Arbeitszeit × hourly wage (null without a wage). */
  baseAmount: number | null
  /** Sum of the surcharge euros (null without a wage). */
  surchargeTotal: number | null
  /** Gastfahrt hours × Gastfahrt wage (null without that wage). */
  gastfahrtAmount: number | null
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
  /** Planned shifts whose end has passed without a time entry. */
  missingShifts: number
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
  /** Planned shifts — those without a time entry are shown as missing. */
  plans?: ReportPlan[]
  /** profiles.target_hours (per week). */
  weeklyTargetHours?: number | null
  /** profiles.federal_state — public holidays of this Bundesland. */
  federalState?: string | null
  /** Pay rates (only loaded for admins and the employee). */
  pay?: ReportPayRate[] | null
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

/**
 * Planned shifts of one employee that ended before `now` and have no time
 * entry: neither linked by plan_id nor overlapping the planned time.
 */
export function findMissingShifts(plans: ReportPlan[], entries: ReportEntry[], employeeId: string, now: Date): ReportPlan[] {
  const own = entries.filter((e) => e.employee_id === employeeId && !e.is_planned)
  const linked = new Set(own.map((e) => e.plan_id).filter(Boolean))
  const nowMs = now.getTime()
  return plans.filter((p) => {
    if (p.employee_id !== employeeId) return false
    if (p.status === 'cancelled' || p.status === 'rejected') return false
    const ps = new Date(p.start_time).getTime()
    const pe = new Date(p.end_time).getTime()
    if (!Number.isFinite(ps) || !Number.isFinite(pe) || pe > nowMs) return false
    if (linked.has(p.id)) return false
    return !own.some((e) => {
      const es = new Date(e.start_time).getTime()
      const ee = e.end_time ? new Date(e.end_time).getTime() : nowMs
      return es < pe && ee > ps
    })
  })
}

function routeLabel(e: ReportEntry | ReportPlan): string | null {
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

/** "16,50 €" or "16,50 € ab 01.11., 17,00 € ab 15.11." (several wages in one month). */
export function wageSummary(t: MonthlyReportTotals, locale: Locale = 'de', kind: 'regular' | 'guest' = 'regular'): string | null {
  const single = kind === 'regular' ? t.hourlyWage : t.guestHourlyWage
  if (single != null) return formatEuro(single, locale)
  const list = t.wagesUsed
    .map((w) => ({ from: w.from, v: kind === 'regular' ? w.hourlyWage : w.guestHourlyWage }))
    .filter((w) => w.v != null)
  if (list.length === 0) return null
  return list.map((w) => `${formatEuro(w.v as number, locale)} ${locale === 'de' ? 'ab' : 'from'} ${w.from.slice(8, 10)}.${w.from.slice(5, 7)}.`).join(', ')
}

export function buildMonthlyReport(input: MonthlyReportInput): MonthlyReport {
  const locale = input.locale ?? 'de'
  const rules = rulesForState(input.rules ?? DEFAULT_SURCHARGE_RULES, input.federalState)
  const rates = input.spesenRates ?? DEFAULT_SPESEN_RATES
  const empId = input.employee.id
  const dates = daysOfMonth(input.month)
  const warnings: string[] = []

  const entries = input.entries
    .filter((e) => e.employee_id === empId && !e.is_planned && e.date?.slice(0, 7) === input.month)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const absences = (input.absences ?? []).filter((a) => a.employee_id === empId)
  const claims = (input.perDiemClaims ?? []).filter((c) => c.employee_id === empId)
  const missingPlans = findMissingShifts(input.plans ?? [], input.entries, empId, input.now ?? new Date())
    .filter((p) => berlinDateKey(p.start_time).slice(0, 7) === input.month)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  const days: MonthlyReportDay[] = dates.map((date) => {
    const weekdayIdx = weekdayOfDateKey(date)
    const absence = absences.find((a) => overlapsDay(date, a.start_date, a.end_date)) ?? null

    const rows: MonthlyReportRow[] = entries
      .filter((e) => e.date === date)
      .map((e) => {
        const net = entryNetHours(e)
        const isGast = !!e.is_gastfahrt
        const z = calculateSurcharges(e.start_time, e.end_time, { isGastfahrt: isGast, netHours: net, breakPeriods: e.break_periods, rules })
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
          christmas: z.christmas,
          newYearsEve: z.newYearsEve,
          surchargeMinutes: z.minutes,
          status: entryStatus(e),
          corrected: !!e.corrected_at,
          enteredOnBehalf: !!e.entered_by && e.entered_by !== e.employee_id,
          issues: shiftIssues(e),
          customer: e.customer?.name ?? null,
          route: routeLabel(e),
          notes: e.notes ?? null,
        }
      })

    const missing: MissingShift[] = missingPlans
      .filter((p) => berlinDateKey(p.start_time) === date)
      .map((p) => ({
        planId: p.id,
        date,
        start: formatTimeOfDay(p.start_time),
        end: formatTimeOfDay(p.end_time),
        endDayOffset: endDayOffset(p.start_time, p.end_time),
        label: p.shift_name || p.route || null,
        customer: p.customer?.name ?? null,
        route: routeLabel(p),
        isGastfahrt: !!p.is_gastfahrt,
      }))

    // Spesen are per shift (spec §4); the day shows the sum of its shifts.
    const daySpesen = r2(rows.reduce((sum, r) => sum + r.spesen, 0))
    const state: DayState = rows.some((r) => r.issues.length > 0 || r.status === 'running') || (rows.length > 0 && missing.length > 0)
      ? 'incomplete'
      : rows.length > 0
        ? 'work'
        : missing.length > 0
          ? 'missing'
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
      missing,
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

  // Whole minutes first (net hours are minute-exact), hours once at the end.
  const workMinutes = allRows.reduce((s, r) => s + Math.round(r.workHours * 60), 0)
  const gastMinutes = allRows.reduce((s, r) => s + Math.round(r.gastfahrtHours * 60), 0)
  const workHours = minutesToHours(workMinutes)
  const gastfahrtHours = minutesToHours(gastMinutes)
  const actualHours = r2(workHours + (rules.gastfahrtCountsAsWork ? gastfahrtHours : 0))

  // Surcharges: exact minutes summed first, hours and euros derived once.
  const surchargeMinutes: SurchargeMinutes = { ...EMPTY_MINUTES }
  for (const r of allRows) for (const k of SURCHARGE_BUCKETS) surchargeMinutes[k] += r.surchargeMinutes[k]
  // Euros: every shift with the wage valid on its start day; cents are
  // rounded once per line at the end. Without a wage for every shift with
  // hours the amount stays null (never a silently partial sum).
  const rawAmount: Record<SurchargeBucket, number> = { night25: 0, night40: 0, sunday: 0, holiday: 0, christmas: 0, newYearsEve: 0 }
  let rawBase = 0
  let rawGast = 0
  let missingWage = false
  let missingGuestWage = false
  const wagesUsed: MonthlyReportTotals['wagesUsed'] = []
  for (const r of allRows) {
    const rate = payRateOn(input.pay, r.date)
    const wage = positive(rate?.hourlyWage)
    const gWage = positive(rate?.guestHourlyWage)
    if (r.netHours > 0 && rate && !wagesUsed.some((w) => w.hourlyWage === wage && w.guestHourlyWage === gWage)) {
      wagesUsed.push({ from: r.date, hourlyWage: wage, guestHourlyWage: gWage })
    }
    const hasSurcharge = SURCHARGE_BUCKETS.some((k) => r.surchargeMinutes[k] > 0)
    if (wage == null) {
      if (r.workHours > 0 || hasSurcharge) missingWage = true
    } else {
      rawBase += Math.round(r.workHours * 60) / 60 * wage
      for (const k of SURCHARGE_BUCKETS) rawAmount[k] += (r.surchargeMinutes[k] / 60) * wage * (bucketPct(k, rules) / 100)
    }
    if (r.gastfahrtHours > 0) {
      if (gWage == null) missingGuestWage = true
      else rawGast += (Math.round(r.gastfahrtHours * 60) / 60) * gWage
    }
  }
  const anyWage = wagesUsed.some((w) => w.hourlyWage != null)
  const withWage = !missingWage && (anyWage || allRows.every((r) => r.netHours <= 0)) && !!input.pay?.some((p) => positive(p.hourlyWage) != null)
  const distinctWages = [...new Set(wagesUsed.map((w) => w.hourlyWage))]
  const distinctGuest = [...new Set(wagesUsed.map((w) => w.guestHourlyWage))]
  // Month without shifts: the wage valid at its end (for display only).
  const monthEndRate = payRateOn(input.pay, dates[dates.length - 1])
  const hourlyWage = !withWage ? null : wagesUsed.length === 0 ? positive(monthEndRate?.hourlyWage) : distinctWages.length === 1 ? distinctWages[0] : null
  const guestHourlyWage = wagesUsed.length === 0 ? positive(monthEndRate?.guestHourlyWage) : distinctGuest.length === 1 ? distinctGuest[0] : null
  const surchargeLines: SurchargeLine[] = SURCHARGE_BUCKETS.map((bucket) => {
    const pct = bucketPct(bucket, rules)
    const minutes = surchargeMinutes[bucket]
    return {
      bucket,
      label: bucketLabel(bucket, rules, locale),
      pct,
      minutes,
      hours: minutesToHours(minutes),
      amount: withWage ? r2(rawAmount[bucket]) : null,
    }
  })
  const surchargeTotal = withWage ? r2(surchargeLines.reduce((s, l) => s + (l.amount ?? 0), 0)) : null
  const baseAmount = withWage ? r2(rawBase) : null
  const gastfahrtAmount = gastMinutes > 0 && !missingGuestWage ? r2(rawGast) : null

  // Spesen: one value per shift (spec §4), grouped by rate.
  const spesenMap = new Map<string, SpesenLine>()
  for (const d of days) {
    for (const r of d.rows) {
      if (r.spesen <= 0) continue
      const kind = spesenKind(r.spesen, rates)
      const k = kind === 'none' ? 'other' : kind
      const key = k === 'other' ? `other:${r.spesen}` : k
      const line = spesenMap.get(key) ?? {
        kind: k,
        label:
          k === 'full'
            ? locale === 'de' ? `Vollsatz ${rates.full} € (ab 8 Std. mit Übernachtung)` : `Full rate ${rates.full} € (8 h+ with overnight)`
            : k === 'partial'
              ? locale === 'de' ? `Teilsatz ${rates.partial} € (ab 8 Std.)` : `Partial rate ${rates.partial} € (8 h or more)`
              : locale === 'de' ? `Sonstiger Satz ${r.spesen} €` : `Other rate ${r.spesen} €`,
        rate: k === 'full' ? rates.full : k === 'partial' ? rates.partial : r.spesen,
        count: 0,
        amount: 0,
      }
      line.count += 1
      line.amount = r2(line.amount + r.spesen)
      spesenMap.set(key, line)
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
    night25: minutesToHours(surchargeMinutes.night25),
    night40: minutesToHours(surchargeMinutes.night40),
    sunday: minutesToHours(surchargeMinutes.sunday),
    holiday: minutesToHours(surchargeMinutes.holiday),
    christmas: minutesToHours(surchargeMinutes.christmas),
    newYearsEve: minutesToHours(surchargeMinutes.newYearsEve),
    surchargeMinutes,
    surchargeLines,
    weightedSurchargeHours: weightedSurchargeHours(surchargeMinutes, rules),
    hourlyWage,
    guestHourlyWage,
    wagesUsed,
    baseAmount,
    surchargeTotal,
    gastfahrtAmount,
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
    missingShifts: days.reduce((n, d) => n + d.missing.length, 0),
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

