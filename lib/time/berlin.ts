/**
 * German wall-clock time (Europe/Berlin) independent of the device's
 * timezone — identical copy in the webapp and the mobile app.
 *
 * LokShift is operated in Germany: every shift, report and surcharge is
 * defined in German local time. Using the device timezone made a laptop
 * abroad show 22:00 as 01:00 and compute night/Sunday hours wrongly.
 *
 * Plain arithmetic with the EU summer-time rule (CEST from the last Sunday
 * of March 01:00 UTC to the last Sunday of October 01:00 UTC), no Intl —
 * so it behaves the same in every browser and in Hermes.
 */

export const APP_TIME_ZONE = 'Europe/Berlin'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Day of month of the last Sunday in `month` (0-based) of `year`. */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month + 1, 0))
  return lastDay.getUTCDate() - lastDay.getUTCDay()
}

/** UTC offset of German time at instant `ms`: 120 (summer) or 60 (winter) minutes. */
export function berlinOffsetMinutes(ms: number): number {
  const year = new Date(ms).getUTCFullYear()
  const summerStart = Date.UTC(year, 2, lastSunday(year, 2), 1)
  const summerEnd = Date.UTC(year, 9, lastSunday(year, 9), 1)
  return ms >= summerStart && ms < summerEnd ? 120 : 60
}

export interface WallClock {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = Sunday … 6 = Saturday */
  weekday: number
}

function toMs(input: Date | string | number): number {
  return input instanceof Date ? input.getTime() : typeof input === 'number' ? input : new Date(input).getTime()
}

/** German wall-clock fields of an instant. */
export function berlinWallClock(input: Date | string | number = new Date()): WallClock {
  const ms = toMs(input)
  const shifted = new Date(ms + berlinOffsetMinutes(ms) * MINUTE)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" of an instant in German time. */
export function berlinDateKey(input: Date | string | number = new Date()): string {
  const w = berlinWallClock(input)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`
}

/** "HH:mm" of an instant in German time. */
export function berlinTimeKey(input: Date | string | number): string {
  const w = berlinWallClock(input)
  return `${pad(w.hour)}:${pad(w.minute)}`
}

/**
 * Instant of German wall-clock `date` ("YYYY-MM-DD") + `time` ("HH:mm").
 * In the autumn hour that happens twice the first (summer-time) occurrence
 * is used; a time inside the spring gap (02:00–03:00) moves forward by the
 * missing hour, like a wall clock does.
 */
export function berlinToInstant(date: string, time = '00:00'): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0)
  for (const offset of [120, 60]) {
    const candidate = naive - offset * MINUTE
    if (berlinOffsetMinutes(candidate) === offset) return new Date(candidate)
  }
  return new Date(naive - HOUR)
}

/** Weekday (0 = Sunday) of a calendar date "YYYY-MM-DD" — no timezone involved. */
export function weekdayOfDateKey(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Value for <input type="datetime-local"> showing an instant in German time. */
export function toBerlinInputValue(input: Date | string | number | null | undefined): string {
  if (input == null || input === '') return ''
  const ms = toMs(input)
  if (!Number.isFinite(ms)) return ''
  return `${berlinDateKey(ms)}T${berlinTimeKey(ms)}`
}

/** ISO instant from a datetime-local value ("YYYY-MM-DDTHH:mm") read as German time. */
export function fromBerlinInputValue(value: string | null | undefined): string | null {
  if (!value) return null
  const [date, time] = value.split('T')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !/^\d{2}:\d{2}/.test(time ?? '')) return null
  return berlinToInstant(date, time.slice(0, 5)).toISOString()
}

/**
 * "YYYY-MM-DD" of a calendar-day Date built from year/month/day parts on
 * this device (date pickers, month grids). These represent a day, not an
 * instant, so they are read in the device calendar — never via
 * toISOString(), which shifts the day in timezones east of UTC.
 */
export function calendarDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
