/**
 * Shift time helpers — identical copy in the webapp and the mobile app.
 *
 * A shift is entered as (date, "HH:mm" start, "HH:mm" end, break minutes).
 * An end earlier than the start falls on the following calendar day
 * (22:00 → 08:00 = 10 h). Times are German wall-clock time (Europe/Berlin,
 * see ./berlin) on every device and are stored as real UTC instants, so the
 * database never has to guess a timezone.
 *
 * The database recalculates `net_hours` from the stored instants on every
 * write (trigger `time_entries_normalize`); the values computed here are
 * for previews and must match that formula.
 */

import { berlinDateKey, berlinTimeKey, berlinToInstant } from './berlin'

export interface ShiftTimes {
  /** UTC instant for `time_entries.start_time`. */
  startISO: string
  /** UTC instant for `time_entries.end_time` — next day for overnight shifts. */
  endISO: string
  /** YYYY-MM-DD of the start (== input date). */
  startDate: string
  /** YYYY-MM-DD of the end (startDate, or the following day). */
  endDate: string
  isOvernight: boolean
  /** Hours between start and end, before the break. */
  grossHours: number
  /** Hours after the break, never negative, rounded to 2 decimals. */
  netHours: number
  /** True when the break is at least as long as the shift. */
  breakExceedsShift: boolean
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidTime(value: string | null | undefined): value is string {
  return !!value && TIME_RE.test(value)
}

/** Years a typed date may have — keeps half-typed years (0002, 0202) out. */
export const MIN_YEAR = 2000
export const MAX_YEAR = 2100

/**
 * A complete, real calendar date "YYYY-MM-DD" in a sane range. Date inputs
 * report half-typed years (0002 → 0020 → 0202 → 2026) while the user types,
 * so every lookup or calculation must check this first.
 */
export function isValidDate(value: string | null | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (y < MIN_YEAR || y > MAX_YEAR || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100
}

/** YYYY-MM-DD of an instant in German time (never via toISOString, which is UTC). */
export function localDateKey(d: Date = new Date()): string {
  return berlinDateKey(d)
}

/** "HH:mm" of an instant in German time. */
export function localTimeKey(d: Date): string {
  return berlinTimeKey(d)
}

/** Add calendar days to a YYYY-MM-DD string (pure calendar arithmetic). */
export function addDays(date: string, n: number): string {
  if (!DATE_RE.test(date ?? '')) return date
  const [y, m, d] = date.split('-').map(Number)
  // setUTCFullYear, not Date.UTC: Date.UTC maps years 0–99 to 1900–1999.
  const t = new Date(0)
  t.setUTCFullYear(y, m - 1, d + n)
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** German wall-clock date + time → UTC ISO instant. */
export function toInstantIso(date: string, time: string): string {
  return berlinToInstant(date, time).toISOString()
}

const MINUTE_MS = 60_000

/**
 * Net hours between two instants minus a break — same formula as the DB
 * trigger. Whole minutes only: clocked seconds never turn a 0-minute shift
 * into 0,01 h (one rounding rule for app, PDF and Excel).
 */
export function hoursBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  breakMinutes: number | null | undefined = 0,
): number {
  if (!startIso || !endIso) return 0
  const start = Math.floor(new Date(startIso).getTime() / MINUTE_MS) * MINUTE_MS
  const end = Math.floor(new Date(endIso).getTime() / MINUTE_MS) * MINUTE_MS
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return roundHours(Math.max(0, (end - start) / 3_600_000 - (Number(breakMinutes) || 0) / 60))
}

/**
 * Net hours of a stored entry. Every screen and export uses this so the
 * values always match each other and the database trigger.
 */
export function entryNetHours(entry: {
  start_time: string | null
  end_time: string | null
  break_minutes?: number | null
}): number {
  return hoursBetween(entry.start_time, entry.end_time, entry.break_minutes)
}

/**
 * Whole calendar days between the German start date and the German end
 * date of a stored shift (0 = same day, 1 = ends next day).
 */
export function endDayOffset(startIso: string | null | undefined, endIso: string | null | undefined): number {
  if (!startIso || !endIso) return 0
  const s = new Date(startIso)
  const e = new Date(endIso)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0
  return Math.round((Date.parse(berlinDateKey(e)) - Date.parse(berlinDateKey(s))) / 86_400_000)
}

export function calculateShiftTimes(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
): ShiftTimes {
  const brk = Math.max(0, Number(breakMinutes) || 0)
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) {
    const safeDate = isValidDate(date) ? date : localDateKey()
    const safeStart = toInstantIso(safeDate, isValidTime(startTime) ? startTime : '00:00')
    return {
      startISO: safeStart,
      endISO: safeStart,
      startDate: safeDate,
      endDate: safeDate,
      isOvernight: false,
      grossHours: 0,
      netHours: 0,
      breakExceedsShift: false,
    }
  }

  const isOvernight = endTime < startTime
  const endDate = isOvernight ? addDays(date, 1) : date
  const startISO = toInstantIso(date, startTime)
  const endISO = toInstantIso(endDate, endTime)
  const grossHours = Math.max(0, (new Date(endISO).getTime() - new Date(startISO).getTime()) / 3_600_000)
  const netHours = roundHours(Math.max(0, grossHours - brk / 60))

  return {
    startISO,
    endISO,
    startDate: date,
    endDate,
    isOvernight,
    grossHours: roundHours(grossHours),
    netHours,
    breakExceedsShift: grossHours > 0 && brk / 60 >= grossHours,
  }
}

export function calculateNetHours(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
): number {
  return calculateShiftTimes(date, startTime, endTime, breakMinutes).netHours
}

export type ShiftIssue =
  | 'missing_end'
  | 'zero_hours'
  | 'break_exceeds_shift'
  | 'very_long'
  | 'end_equals_start'

/**
 * Problems that must be visible before a shift is submitted or approved
 * (Kundenfeedback Punkt 1: "fehlende oder widersprüchliche Angaben als
 * Fehler kennzeichnen").
 */
export function shiftIssues(entry: {
  start_time: string | null
  end_time: string | null
  break_minutes?: number | null
  is_planned?: boolean | null
}): ShiftIssue[] {
  if (entry.is_planned) return []
  if (!entry.end_time) return ['missing_end']
  const issues: ShiftIssue[] = []
  const gross = hoursBetween(entry.start_time, entry.end_time, 0)
  const net = hoursBetween(entry.start_time, entry.end_time, entry.break_minutes)
  if (gross === 0) issues.push('end_equals_start')
  else if (net === 0) issues.push((entry.break_minutes ?? 0) > 0 ? 'break_exceeds_shift' : 'zero_hours')
  if (gross > 16) issues.push('very_long')
  return issues
}

export function shiftIssueLabel(issue: ShiftIssue, locale: 'de' | 'en' = 'de'): string {
  const de: Record<ShiftIssue, string> = {
    missing_end: 'Schichtende fehlt',
    zero_hours: '0 Stunden erfasst',
    break_exceeds_shift: 'Pause ist so lang wie die Schicht',
    very_long: 'Ungewöhnlich lange Schicht (über 16 Std.)',
    end_equals_start: 'Ende entspricht Beginn',
  }
  const en: Record<ShiftIssue, string> = {
    missing_end: 'End time missing',
    zero_hours: '0 hours recorded',
    break_exceeds_shift: 'Break is as long as the shift',
    very_long: 'Unusually long shift (over 16 h)',
    end_equals_start: 'End equals start',
  }
  return (locale === 'de' ? de : en)[issue]
}
