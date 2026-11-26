/**
 * Zuschläge (surcharges) — identical copy in the webapp and the mobile app.
 *
 * Billing spec (Rhein Maas Rail, Nov 2026), sections 1–3 and 6:
 *
 *   Group B – night (added on top of Group A)
 *     20:00–24:00  25 %
 *     00:00–04:00  40 %
 *   Group A – day (never added up: only the HIGHEST one counts)
 *     Sunday 00–24                      50 %
 *     public holiday 00–24 (Bundesland) 50 %
 *     25 and 26 December 00–24         150 %
 *     31 December 12:00–24:00          125 %  (00:00–12:00: no day surcharge)
 *
 *   surcharge of a minute = max(Group A) + Group B, always as a percentage
 *   of the regular gross hourly wage (no cascading).
 *
 * A shift is cut into segments at 00:00, 04:00, 12:00 and 20:00 German time
 * (Europe/Berlin on every device, DST-exact) and every minute gets the
 * surcharges of its own date and clock time. The shift itself stays in the
 * month of its start (section 6); that is the report's job, not this one.
 *
 * Each minute lands in exactly one Group-A bucket (the highest; on equal
 * rates: Weihnachten > Silvester > Feiertag > Sonntag) and in at most one
 * night bucket.
 *
 * Surcharges apply to actually worked minutes only (section 1):
 *   - Breaks are taken out at their real clock time (time_entries.break_periods,
 *     recorded by the clock or entered as "Pause ab"). Only when an entry has
 *     no break times (older or manual entries without "Pause ab") is every
 *     bucket capped at the shift's net minutes instead.
 *   - Gastfahrten are not working time (section 5): no surcharges, they are
 *     paid with their own Gastfahrt wage only.
 */

import { addDays, calculateShiftTimes } from './shift-hours'
import { berlinDateKey, berlinTimeKey, berlinToInstant, weekdayOfDateKey } from './berlin'
import { DEFAULT_STATE, holidayName, resolveState, type GermanState } from './holidays'

export interface SurchargeRules {
  /** Minutes after midnight. */
  night25From: number
  night25To: number
  night40From: number
  night40To: number
  /** Percentages of the regular gross hourly wage. */
  night25Pct: number
  night40Pct: number
  sundayPct: number
  holidayPct: number
  christmasPct: number
  newYearsEvePct: number
  /** 31.12. from this minute on (default 12:00). */
  newYearsEveFrom: number
  /** Bundesland for public holidays (the employee's, else the org's). */
  holidayState: GermanState
  /** Gastfahrten never count as regular working time (spec section 5). */
  gastfahrtCountsAsWork: boolean
}

export const DEFAULT_SURCHARGE_RULES: SurchargeRules = {
  night25From: 20 * 60,
  night25To: 24 * 60,
  night40From: 0,
  night40To: 4 * 60,
  night25Pct: 25,
  night40Pct: 40,
  sundayPct: 50,
  holidayPct: 50,
  christmasPct: 150,
  newYearsEvePct: 125,
  newYearsEveFrom: 12 * 60,
  holidayState: DEFAULT_STATE,
  gastfahrtCountsAsWork: false,
}

function parseHHMM(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return fallback
  const [h, m] = value.split(':').map(Number)
  return Math.min(24 * 60, h * 60 + m)
}

function parsePct(value: unknown, fallback: number): number {
  const n = Number(value)
  return value != null && value !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 ? n : fallback
}

/**
 * Reads `organizations.settings.surcharges` with safe fallbacks. The
 * Bundesland of an employee (profiles.federal_state) overrides the org's.
 */
export function resolveSurchargeRules(
  settings?: Record<string, unknown> | null,
  employeeState?: string | null,
): SurchargeRules {
  const s = (settings?.surcharges ?? {}) as Record<string, unknown>
  const d = DEFAULT_SURCHARGE_RULES
  const orgState = resolveState(s.holiday_state, d.holidayState)
  return {
    night25From: parseHHMM(s.night25_from, d.night25From),
    night25To: parseHHMM(s.night25_to, d.night25To),
    night40From: parseHHMM(s.night40_from, d.night40From),
    night40To: parseHHMM(s.night40_to, d.night40To),
    night25Pct: parsePct(s.night25_pct, d.night25Pct),
    night40Pct: parsePct(s.night40_pct, d.night40Pct),
    sundayPct: parsePct(s.sunday_pct, d.sundayPct),
    holidayPct: parsePct(s.holiday_pct, d.holidayPct),
    christmasPct: parsePct(s.christmas_pct, d.christmasPct),
    newYearsEvePct: parsePct(s.new_years_eve_pct, d.newYearsEvePct),
    newYearsEveFrom: parseHHMM(s.new_years_eve_from, d.newYearsEveFrom),
    holidayState: resolveState(employeeState, orgState),
    gastfahrtCountsAsWork: d.gastfahrtCountsAsWork,
  }
}

/** Same rules with the employee's Bundesland. */
export function rulesForState(rules: SurchargeRules, state: string | null | undefined): SurchargeRules {
  const holidayState = resolveState(state, rules.holidayState)
  return holidayState === rules.holidayState ? rules : { ...rules, holidayState }
}

export type DayBucket = 'sunday' | 'holiday' | 'christmas' | 'newYearsEve'
export type NightBucket = 'night25' | 'night40'
export type SurchargeBucket = NightBucket | DayBucket

export const SURCHARGE_BUCKETS: SurchargeBucket[] = ['night25', 'night40', 'sunday', 'holiday', 'christmas', 'newYearsEve']

/** Whole minutes per bucket — the exact basis for every sum and amount. */
export type SurchargeMinutes = Record<SurchargeBucket, number>

export interface ZuschlagBreakdown {
  /** Hours (2 decimals, for display) per bucket. */
  night25: number
  night40: number
  sunday: number
  holiday: number
  christmas: number
  newYearsEve: number
  /** Net hours of a Gastfahrt entry (else 0). */
  gastfahrt: number
  /** Exact minutes per bucket. */
  minutes: SurchargeMinutes
}

export const EMPTY_MINUTES: SurchargeMinutes = { night25: 0, night40: 0, sunday: 0, holiday: 0, christmas: 0, newYearsEve: 0 }

export const EMPTY_ZUSCHLAG: ZuschlagBreakdown = {
  night25: 0,
  night40: 0,
  sunday: 0,
  holiday: 0,
  christmas: 0,
  newYearsEve: 0,
  gastfahrt: 0,
  minutes: { ...EMPTY_MINUTES },
}

export function bucketPct(bucket: SurchargeBucket, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): number {
  switch (bucket) {
    case 'night25': return rules.night25Pct
    case 'night40': return rules.night40Pct
    case 'sunday': return rules.sundayPct
    case 'holiday': return rules.holidayPct
    case 'christmas': return rules.christmasPct
    case 'newYearsEve': return rules.newYearsEvePct
  }
}

/** Name of the public holiday on a date in the rules' Bundesland, else null. */
export function publicHolidayName(date: string, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): string | null {
  return holidayName(date, rules.holidayState)
}

/**
 * Group-A bucket and rate of one moment, or null when no day surcharge
 * applies. `minuteOfDay` is German wall-clock time.
 */
export function dayBucketAt(
  date: string,
  minuteOfDay: number,
  rules: SurchargeRules = DEFAULT_SURCHARGE_RULES,
): { bucket: DayBucket; pct: number } | null {
  const md = date.slice(5)
  const candidates: { bucket: DayBucket; pct: number }[] = []
  // Priority on equal rates = order of this list.
  if (md === '12-25' || md === '12-26') candidates.push({ bucket: 'christmas', pct: rules.christmasPct })
  if (md === '12-31' && minuteOfDay >= rules.newYearsEveFrom) candidates.push({ bucket: 'newYearsEve', pct: rules.newYearsEvePct })
  if (holidayName(date, rules.holidayState)) candidates.push({ bucket: 'holiday', pct: rules.holidayPct })
  if (weekdayOfDateKey(date) === 0) candidates.push({ bucket: 'sunday', pct: rules.sundayPct })
  let best: { bucket: DayBucket; pct: number } | null = null
  for (const c of candidates) if (c.pct > 0 && (!best || c.pct > best.pct)) best = c
  return best
}

/** Group-B bucket and rate of one moment, or null. */
export function nightBucketAt(minuteOfDay: number, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): { bucket: NightBucket; pct: number } | null {
  if (minuteOfDay >= rules.night40From && minuteOfDay < rules.night40To) return { bucket: 'night40', pct: rules.night40Pct }
  if (minuteOfDay >= rules.night25From && minuteOfDay < rules.night25To) return { bucket: 'night25', pct: rules.night25Pct }
  return null
}

/** Total surcharge percentage of one moment: max(Group A) + Group B. */
export function surchargePctAt(date: string, minuteOfDay: number, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): number {
  return (dayBucketAt(date, minuteOfDay, rules)?.pct ?? 0) + (nightBucketAt(minuteOfDay, rules)?.pct ?? 0)
}

const MINUTE_MS = 60_000
const r2 = (n: number) => Math.round(n * 100) / 100

export function minutesToHours(minutes: number): number {
  return r2(minutes / 60)
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Segment boundaries of one day, minutes after midnight. */
function boundaries(rules: SurchargeRules): number[] {
  const set = new Set([0, 24 * 60, rules.night25From, rules.night25To, rules.night40From, rules.night40To, rules.newYearsEveFrom])
  return [...set].filter((m) => m >= 0 && m <= 24 * 60).sort((a, b) => a - b)
}

function toBreakdown(minutes: SurchargeMinutes, gastfahrtHours: number): ZuschlagBreakdown {
  return {
    night25: minutesToHours(minutes.night25),
    night40: minutesToHours(minutes.night40),
    sunday: minutesToHours(minutes.sunday),
    holiday: minutesToHours(minutes.holiday),
    christmas: minutesToHours(minutes.christmas),
    newYearsEve: minutesToHours(minutes.newYearsEve),
    gastfahrt: gastfahrtHours,
    minutes,
  }
}

/** One break with its real clock time (ISO instants). */
export interface BreakPeriod {
  start: string
  end: string
}

/**
 * Valid break intervals of a shift in ms (whole minutes), clipped to the
 * shift, sorted and merged — or null when the stored break times do not
 * match the stored break length (then their position is unknown).
 */
export function positionedBreaks(
  start: number,
  end: number,
  breakMinutes: number,
  periods: BreakPeriod[] | null | undefined,
): Array<[number, number]> | null {
  if (!Array.isArray(periods) || periods.length === 0) return breakMinutes <= 0 ? [] : null
  const list: Array<[number, number]> = []
  for (const p of periods) {
    const a = Math.floor(new Date(p?.start as string).getTime() / MINUTE_MS) * MINUTE_MS
    const b = Math.floor(new Date(p?.end as string).getTime() / MINUTE_MS) * MINUTE_MS
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    const from = Math.max(start, a)
    const to = Math.min(end, b)
    if (to > from) list.push([from, to])
  }
  list.sort((x, y) => x[0] - y[0])
  const merged: Array<[number, number]> = []
  for (const iv of list) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else merged.push([iv[0], iv[1]])
  }
  const total = merged.reduce((s, [a, b]) => s + Math.round((b - a) / MINUTE_MS), 0)
  // Clock breaks are stored in seconds and rounded to minutes: allow 1 minute.
  return Math.abs(total - breakMinutes) <= 1 ? merged : null
}

/**
 * Surcharge minutes of one stored shift.
 *
 * @param startIso  time_entries.start_time
 * @param endIso    time_entries.end_time
 * @param opts.netHours  stored net hours — caps every bucket
 * @param opts.breakPeriods  time_entries.break_periods (real break times)
 */
export function calculateSurcharges(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  opts: { isGastfahrt?: boolean; netHours?: number | null; breakPeriods?: BreakPeriod[] | null; rules?: SurchargeRules } = {},
): ZuschlagBreakdown {
  if (!startIso || !endIso) return { ...EMPTY_ZUSCHLAG, minutes: { ...EMPTY_MINUTES } }
  // Whole minutes, like net_hours (DB trigger and hoursBetween).
  const start = Math.floor(new Date(startIso).getTime() / MINUTE_MS) * MINUTE_MS
  const end = Math.floor(new Date(endIso).getTime() / MINUTE_MS) * MINUTE_MS
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ...EMPTY_ZUSCHLAG, minutes: { ...EMPTY_MINUTES } }

  const rules = opts.rules ?? DEFAULT_SURCHARGE_RULES
  const grossMin = Math.round((end - start) / MINUTE_MS)
  const netMin = opts.netHours == null ? grossMin : Math.max(0, Math.round(Number(opts.netHours) * 60) || 0)
  if (netMin <= 0) return { ...EMPTY_ZUSCHLAG, minutes: { ...EMPTY_MINUTES } }

  // Gastfahrt: no working time, so no surcharges (spec sections 1 and 5).
  if (opts.isGastfahrt) return toBreakdown({ ...EMPTY_MINUTES }, r2(netMin / 60))

  // Worked intervals = shift minus breaks at their real time.
  const breaks = positionedBreaks(start, end, grossMin - netMin, opts.breakPeriods)
  const work: Array<[number, number]> = []
  let cursor = start
  for (const [a, b] of breaks ?? []) {
    if (a > cursor) work.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (end > cursor) work.push([cursor, end])

  const minutes: SurchargeMinutes = { ...EMPTY_MINUTES }
  const cuts = boundaries(rules)
  for (const [wStart, wEnd] of work) addSegments(wStart, wEnd, cuts, rules, minutes)

  // Safety cap; without break times this is the documented fallback.
  for (const k of SURCHARGE_BUCKETS) minutes[k] = Math.min(minutes[k], netMin)
  return toBreakdown(minutes, 0)
}

/** Adds the minutes of [start, end) to the buckets of their own date and time. */
function addSegments(start: number, end: number, cuts: number[], rules: SurchargeRules, minutes: SurchargeMinutes): void {
  let day = berlinDateKey(start)
  // A shift never spans more than a few days; the guard stops runaway loops
  // on corrupt data.
  for (let i = 0; i < 40; i++) {
    const dayStart = berlinToInstant(day, '00:00').getTime()
    if (dayStart >= end) break
    const next = addDays(day, 1)
    const dayEnd = berlinToInstant(next, '00:00').getTime()
    const at = (m: number) => (m >= 24 * 60 ? dayEnd : m <= 0 ? dayStart : berlinToInstant(day, hhmm(m)).getTime())

    for (let k = 0; k < cuts.length - 1; k++) {
      const ov = Math.max(0, Math.min(end, at(cuts[k + 1])) - Math.max(start, at(cuts[k])))
      if (ov <= 0) continue
      const mins = Math.round(ov / MINUTE_MS)
      const a = dayBucketAt(day, cuts[k], rules)
      const b = nightBucketAt(cuts[k], rules)
      if (a) minutes[a.bucket] += mins
      if (b) minutes[b.bucket] += mins
    }
    day = next
  }
}

/**
 * Same result from wall-clock input (date + "HH:mm" start/end). Used by
 * form previews before anything is stored.
 */
export function calculateZuschlag(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
  isGastfahrt: boolean = false,
  rules: SurchargeRules = DEFAULT_SURCHARGE_RULES,
  breakPeriods: BreakPeriod[] | null = null,
): ZuschlagBreakdown {
  if (!date || !startTime || !endTime) return { ...EMPTY_ZUSCHLAG, minutes: { ...EMPTY_MINUTES } }
  const shift = calculateShiftTimes(date, startTime, endTime, breakMinutes)
  return calculateSurcharges(shift.startISO, shift.endISO, { isGastfahrt, netHours: shift.netHours, breakPeriods, rules })
}

/**
 * Break period from the form field "Pause ab" (German wall-clock "HH:mm")
 * and the break length. The break starts on the shift's start day, or on the
 * next day when that time lies before the shift start (night shifts).
 * Returns [] without a start or length; null when it does not fit the shift.
 */
export function breakPeriodFromForm(
  startISO: string,
  endISO: string,
  breakStart: string | null | undefined,
  breakMinutes: number,
): BreakPeriod[] | null {
  const mins = Math.round(Number(breakMinutes) || 0)
  if (!breakStart || !/^\d{1,2}:\d{2}$/.test(breakStart) || mins <= 0) return []
  const s = new Date(startISO).getTime()
  const e = new Date(endISO).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  const day = berlinDateKey(s)
  let a = berlinToInstant(day, breakStart.padStart(5, '0')).getTime()
  if (a < Math.floor(s / MINUTE_MS) * MINUTE_MS) a = berlinToInstant(addDays(day, 1), breakStart.padStart(5, '0')).getTime()
  const b = a + mins * MINUTE_MS
  if (a < Math.floor(s / MINUTE_MS) * MINUTE_MS || b > e) return null
  return [{ start: new Date(a).toISOString(), end: new Date(b).toISOString() }]
}

/**
 * What an entry form stores in break_periods: undefined = leave the stored
 * break times as they are (e.g. clock breaks when only notes or times were
 * edited); [] = position unknown; else the "Pause ab" break. Only changed
 * values are sent, so an untouched entry is not marked as corrected.
 */
export function breakPeriodsToSave(
  stored: BreakPeriod[] | null | undefined,
  fromForm: BreakPeriod[] | null,
  breakStart: string | null | undefined,
  breakMinutesChanged: boolean,
): BreakPeriod[] | undefined {
  const before = Array.isArray(stored) ? stored : []
  if (!breakStart) {
    // Cleared "Pause ab" or a new break length without a time: unknown.
    return breakMinutesChanged || breakStartForForm(before) !== '' ? (before.length ? [] : undefined) : undefined
  }
  const next = fromForm ?? []
  const same =
    before.length === next.length &&
    before.every((b, i) => Date.parse(b.start) === Date.parse(next[i].start) && Date.parse(b.end) === Date.parse(next[i].end))
  return same ? undefined : next
}

/** "HH:mm" (German time) of the first stored break, for the form field. */
export function breakStartForForm(periods: BreakPeriod[] | null | undefined): string {
  if (!Array.isArray(periods) || periods.length !== 1) return ''
  const t = new Date(periods[0].start).getTime()
  return Number.isFinite(t) ? berlinTimeKey(t) : ''
}

/** Sums exact minutes; hours are derived once from the total. */
export function sumZuschlag(rows: ZuschlagBreakdown[]): ZuschlagBreakdown {
  const minutes: SurchargeMinutes = { ...EMPTY_MINUTES }
  let gast = 0
  for (const r of rows) {
    for (const k of SURCHARGE_BUCKETS) minutes[k] += r.minutes?.[k] ?? Math.round((r[k] ?? 0) * 60)
    gast += r.gastfahrt
  }
  return toBreakdown(minutes, r2(gast))
}

/**
 * Weighted surcharge hours = Σ hours × rate. Multiplied by the regular gross
 * hourly wage this is the surcharge amount in euros.
 */
export function weightedSurchargeHours(minutes: SurchargeMinutes, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): number {
  let total = 0
  for (const k of SURCHARGE_BUCKETS) total += (minutes[k] / 60) * (bucketPct(k, rules) / 100)
  return Math.round(total * 10_000) / 10_000
}

/** Surcharge amount in euros of one bucket (rounded to cents). */
export function surchargeAmount(minutes: number, pct: number, hourlyWage: number): number {
  return r2((minutes / 60) * hourlyWage * (pct / 100))
}

/** Label of a bucket for reports, e.g. "Sonntag 50 %". */
export function bucketLabel(bucket: SurchargeBucket, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES, locale: 'de' | 'en' = 'de'): string {
  const pct = `${String(bucketPct(bucket, rules)).replace('.', locale === 'de' ? ',' : '.')} %`
  const de: Record<SurchargeBucket, string> = {
    night25: `Nacht ${hhmm(rules.night25From)}–${hhmm(rules.night25To)}`,
    night40: `Nacht ${hhmm(rules.night40From)}–${hhmm(rules.night40To)}`,
    sunday: 'Sonntag',
    holiday: 'Feiertag',
    christmas: '25./26.12.',
    newYearsEve: `31.12. ab ${hhmm(rules.newYearsEveFrom)}`,
  }
  const en: Record<SurchargeBucket, string> = {
    night25: `Night ${hhmm(rules.night25From)}–${hhmm(rules.night25To)}`,
    night40: `Night ${hhmm(rules.night40From)}–${hhmm(rules.night40To)}`,
    sunday: 'Sunday',
    holiday: 'Public holiday',
    christmas: '25/26 Dec',
    newYearsEve: `31 Dec from ${hhmm(rules.newYearsEveFrom)}`,
  }
  return `${(locale === 'de' ? de : en)[bucket]} ${pct}`
}

/** Short legend line shared by screen, PDF and Excel. */
export function surchargeLegend(rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): string {
  return (
    `Zuschläge auf den regulären Bruttostundenlohn, minutengenau nach Datum und Uhrzeit: ` +
    `Nacht ${hhmm(rules.night25From)}–${hhmm(rules.night25To)} ${rules.night25Pct} %, ${hhmm(rules.night40From)}–${hhmm(rules.night40To)} ${rules.night40Pct} %; ` +
    `Sonntag ${rules.sundayPct} %, Feiertag ${rules.holidayPct} % (Bundesland ${rules.holidayState}), 25./26.12. ${rules.christmasPct} %, ` +
    `31.12. ab ${hhmm(rules.newYearsEveFrom)} ${rules.newYearsEvePct} %. Sonntag/Feiertag/Weihnachten/Silvester: nur der höchste Satz; ` +
    `Nachtzuschlag kommt hinzu. Pausen zählen nicht (zur tatsächlichen Uhrzeit abgezogen), Gastfahrten ohne Zuschläge. ` +
    `Schichten zählen zum Monat ihres Beginns.`
  )
}
