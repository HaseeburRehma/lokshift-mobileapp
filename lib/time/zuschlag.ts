/**
 * Zuschläge (night / Sunday / holiday premium hours) — identical copy in
 * the webapp and the mobile app.
 *
 * Rules (defaults derived from the client's monthly timesheet template,
 * configurable per organisation via organizations.settings.surcharges):
 *   25 %      hours worked between 20:00 and 24:00
 *   40 %      hours worked between 00:00 and 04:00
 *   Sonntag   hours that fall on a Sunday (only the Sunday part of a shift
 *             that crosses midnight — 22:30 Sun → 10:20 Mon = 1.50 h)
 *   Feiertag  hours that fall on a public holiday of the configured state;
 *             1./2. Weihnachtstag are excluded (paid separately)
 *   Gastfahrt net hours of entries flagged as Gastfahrt
 *
 * The calculation walks the real start/end instants day by day in German
 * time (Europe/Berlin, on every device), so DST changes and shifts across
 * midnight / month ends are exact.
 * Breaks are not positioned in time; premium hours are therefore capped at
 * the shift's net hours.
 */

import { addDays, calculateShiftTimes } from './shift-hours'
import { berlinDateKey, berlinToInstant, weekdayOfDateKey } from './berlin'
import {
  DEFAULT_STATE,
  EXCLUDED_HOLIDAY_NAMES,
  generateGermanHolidays,
  type GermanState,
} from './holidays'

export interface SurchargeRules {
  /** Minutes after midnight. */
  night25From: number
  night25To: number
  night40From: number
  night40To: number
  holidayState: GermanState
  excludedHolidayNames: string[]
  /** Whether Gastfahrt hours count towards the actual hours (Ist). */
  gastfahrtCountsAsWork: boolean
}

export const DEFAULT_SURCHARGE_RULES: SurchargeRules = {
  night25From: 20 * 60,
  night25To: 24 * 60,
  night40From: 0,
  night40To: 4 * 60,
  holidayState: DEFAULT_STATE,
  excludedHolidayNames: EXCLUDED_HOLIDAY_NAMES,
  gastfahrtCountsAsWork: true,
}

function parseHHMM(value: unknown, fallback: number): number {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return fallback
  const [h, m] = value.split(':').map(Number)
  return Math.min(24 * 60, h * 60 + m)
}

/** Reads `organizations.settings.surcharges` with safe fallbacks. */
export function resolveSurchargeRules(settings?: Record<string, unknown> | null): SurchargeRules {
  const s = (settings?.surcharges ?? {}) as Record<string, unknown>
  const d = DEFAULT_SURCHARGE_RULES
  return {
    night25From: parseHHMM(s.night25_from, d.night25From),
    night25To: parseHHMM(s.night25_to, d.night25To),
    night40From: parseHHMM(s.night40_from, d.night40From),
    night40To: parseHHMM(s.night40_to, d.night40To),
    holidayState: (typeof s.holiday_state === 'string' ? s.holiday_state : d.holidayState) as GermanState,
    excludedHolidayNames: Array.isArray(s.excluded_holidays)
      ? (s.excluded_holidays as string[])
      : d.excludedHolidayNames,
    gastfahrtCountsAsWork:
      typeof s.gastfahrt_counts_as_work === 'boolean' ? s.gastfahrt_counts_as_work : d.gastfahrtCountsAsWork,
  }
}

export interface ZuschlagBreakdown {
  night25: number
  night40: number
  sunday: number
  holiday: number
  gastfahrt: number
}

export const EMPTY_ZUSCHLAG: ZuschlagBreakdown = {
  night25: 0,
  night40: 0,
  sunday: 0,
  holiday: 0,
  gastfahrt: 0,
}

const holidayCache = new Map<string, Map<string, string>>()

function holidaysFor(year: number, state: GermanState): Map<string, string> {
  const key = `${year}:${state}`
  let map = holidayCache.get(key)
  if (!map) {
    map = new Map(generateGermanHolidays(year, state).map((h) => [h.date, h.name]))
    holidayCache.set(key, map)
  }
  return map
}

/** Holiday name for a YYYY-MM-DD date that counts for the holiday premium, else null. */
export function premiumHolidayName(date: string, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): string | null {
  const name = holidaysFor(Number(date.slice(0, 4)), rules.holidayState).get(date) ?? null
  if (!name || rules.excludedHolidayNames.includes(name)) return null
  return name
}

/** Holiday name for any public holiday (also the excluded ones), else null. */
export function publicHolidayName(date: string, rules: SurchargeRules = DEFAULT_SURCHARGE_RULES): string | null {
  return holidaysFor(Number(date.slice(0, 4)), rules.holidayState).get(date) ?? null
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

/**
 * Premium hours for one stored shift.
 *
 * @param startIso  time_entries.start_time
 * @param endIso    time_entries.end_time
 * @param opts.netHours  stored net hours — caps the premium hours
 */
export function calculateSurcharges(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  opts: { isGastfahrt?: boolean; netHours?: number | null; rules?: SurchargeRules } = {},
): ZuschlagBreakdown {
  if (!startIso || !endIso) return { ...EMPTY_ZUSCHLAG }
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ...EMPTY_ZUSCHLAG }

  const rules = opts.rules ?? DEFAULT_SURCHARGE_RULES
  const gross = (end - start) / 3_600_000
  const net = opts.netHours == null ? gross : Math.max(0, Number(opts.netHours) || 0)
  if (net <= 0) return { ...EMPTY_ZUSCHLAG }

  let n25 = 0
  let n40 = 0
  let sun = 0
  let hol = 0

  let day = berlinDateKey(start)
  // A shift never spans more than a few days; the guard prevents runaway
  // loops on corrupt data.
  for (let i = 0; i < 40; i++) {
    const dayStart = berlinToInstant(day, '00:00').getTime()
    if (dayStart >= end) break
    const next = addDays(day, 1)
    const dayEnd = berlinToInstant(next, '00:00').getTime()
    // Minutes after German midnight → instant (24:00 = next midnight).
    const at = (minutes: number) =>
      minutes >= 24 * 60
        ? dayEnd
        : berlinToInstant(day, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`).getTime()

    n25 += overlapMs(start, end, at(rules.night25From), at(rules.night25To))
    n40 += overlapMs(start, end, at(rules.night40From), at(rules.night40To))
    if (weekdayOfDateKey(day) === 0) sun += overlapMs(start, end, dayStart, dayEnd)
    if (premiumHolidayName(day, rules)) hol += overlapMs(start, end, dayStart, dayEnd)

    day = next
  }

  const toHours = (ms: number) => Math.round(Math.min(ms / 3_600_000, net) * 100) / 100
  return {
    night25: toHours(n25),
    night40: toHours(n40),
    sunday: toHours(sun),
    holiday: toHours(hol),
    gastfahrt: opts.isGastfahrt ? Math.round(net * 100) / 100 : 0,
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
): ZuschlagBreakdown {
  if (!date || !startTime || !endTime) return { ...EMPTY_ZUSCHLAG }
  const shift = calculateShiftTimes(date, startTime, endTime, breakMinutes)
  return calculateSurcharges(shift.startISO, shift.endISO, {
    isGastfahrt,
    netHours: shift.netHours,
    rules,
  })
}

export function sumZuschlag(rows: ZuschlagBreakdown[]): ZuschlagBreakdown {
  const total = rows.reduce<ZuschlagBreakdown>(
    (acc, r) => ({
      night25: acc.night25 + r.night25,
      night40: acc.night40 + r.night40,
      sunday: acc.sunday + r.sunday,
      holiday: acc.holiday + r.holiday,
      gastfahrt: acc.gastfahrt + r.gastfahrt,
    }),
    { ...EMPTY_ZUSCHLAG },
  )
  const r2 = (n: number) => Math.round(n * 100) / 100
  return {
    night25: r2(total.night25),
    night40: r2(total.night40),
    sunday: r2(total.sunday),
    holiday: r2(total.holiday),
    gastfahrt: r2(total.gastfahrt),
  }
}
