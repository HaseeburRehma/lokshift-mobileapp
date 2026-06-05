/**
 * Shift duration helpers — ported 1:1 from the webapp's
 * `lib/time/shift-hours.ts` so client (mobile) and server compute the
 * same start/end ISO timestamps and net hours from a
 * (date, startTime, endTime, breakMinutes) tuple.
 *
 * The overnight convention (end < start → next-day end) matches the
 * Excel formula:
 *   IF(End >= Start, End - Start, (1 - Start) + End) * 24
 *
 * Pure module (no I/O); safe for shared use across UI, hooks and the
 * Stundenzettel PDF generator.
 */

export interface ShiftTimes {
  /** ISO string suitable for `time_entries.start_time` (timestamptz). */
  startISO: string
  /** ISO string suitable for `time_entries.end_time` — may be next day. */
  endISO: string
  /** YYYY-MM-DD of the start (always == input date). */
  startDate: string
  /** YYYY-MM-DD of the end (== startDate, OR startDate + 1 if overnight). */
  endDate: string
  /** True when the shift wraps past midnight. */
  isOvernight: boolean
  /** Gross worked hours (no break deduction). */
  grossHours: number
  /** Net worked hours after break deduction (clamped >= 0). */
  netHours: number
}

function isEndBeforeStart(start: string, end: string): boolean {
  return end < start
}

function addDays(date: string, n: number): string {
  // Compose the result from LOCAL components — using toISOString() rolls
  // the day backward by the UTC offset whenever the local timezone is
  // east of UTC (e.g. CEST = UTC+2 → 2026-05-06 became 2026-05-05). That
  // silently turned every overnight shift into a non-shift, which the
  // client saw as "23:00 → 09:45 = 0.00 hours" (Issue 3 in the brief).
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function calculateShiftTimes(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
): ShiftTimes {
  if (
    !date ||
    !startTime ||
    !endTime ||
    !/^\d{2}:\d{2}$/.test(startTime) ||
    !/^\d{2}:\d{2}$/.test(endTime)
  ) {
    const safeStartISO = `${date || new Date().toISOString().split('T')[0]}T${startTime || '00:00'}:00`
    return {
      startISO: safeStartISO,
      endISO: safeStartISO,
      startDate: date,
      endDate: date,
      isOvernight: false,
      grossHours: 0,
      netHours: 0,
    }
  }

  const isOvernight = isEndBeforeStart(startTime, endTime)
  const endDate = isOvernight ? addDays(date, 1) : date

  const startISO = `${date}T${startTime}:00`
  const endISO = `${endDate}T${endTime}:00`

  const startMs = new Date(startISO).getTime()
  const endMs = new Date(endISO).getTime()
  const grossHours = Math.max(0, (endMs - startMs) / 3_600_000)
  const netHours = Math.max(0, grossHours - (breakMinutes || 0) / 60)

  return {
    startISO,
    endISO,
    startDate: date,
    endDate,
    isOvernight,
    grossHours,
    netHours,
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
