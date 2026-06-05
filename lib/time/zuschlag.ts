/**
 * Zuschlag (wage supplement) calculator — ported 1:1 from the webapp's
 * `lib/time/zuschlag.ts`. Mirrors the exact formulas used in the client's
 * manual Stundenzettel Excel so the mobile Stundenzettel PDF matches a
 * hand-calculated row to the minute:
 *
 *   I  25% Zuschlag → hours between 20:00 and 24:00
 *   J  40% Zuschlag → hours between 00:00 and 04:00
 *   K  Sonntag      → full shift hours when start weekday = Sunday
 *   L  Feiertag     → full shift hours on a configured holiday
 *                     (Christmas Day and Boxing Day are excluded)
 *   M  Gastfahrt    → net hours when is_gastfahrt is true
 *
 * Overnight handling matches `calculateShiftTimes`: when endTime < startTime
 * the end is shifted by 24h and the night bands are tested in both today's
 * and tomorrow's domains.
 *
 * Pure module — no I/O, safe for UI + PDF generator.
 */

import { calculateShiftTimes } from './shift-hours'
import {
  DEFAULT_STATE,
  holidayDatesFor,
  excludedZuschlagDatesFor,
  type GermanState,
} from './holidays'

/**
 * Deprecated — kept exported as backward-compatible stub. Old callers
 * referenced this constant directly. Use `holidayDatesFor(year, state)`
 * from `./holidays` instead so 2026+ shifts get correct Feiertagszuschlag.
 *
 * @deprecated Use holidayDatesFor(date.year, 'NW') from ./holidays.
 */
export const DEFAULT_HOLIDAYS_2025: string[] = holidayDatesFor(2025, 'NW')

/**
 * Holidays the client template excludes from the Feiertag column even
 * though they would otherwise qualify. Christmas Day and Boxing Day are
 * paid via a separate Weihnachtsgeld scheme.
 *
 * @deprecated Use excludedZuschlagDatesFor(year) from ./holidays.
 */
export const EXCLUDED_HOLIDAYS: string[] = excludedZuschlagDatesFor(2025)

export interface ZuschlagBreakdown {
  /** 25% night premium hours (20:00 – 24:00). */
  night25: number
  /** 40% night premium hours (00:00 – 04:00). */
  night40: number
  /** Hours worked on a Sunday. */
  sunday: number
  /** Hours worked on a designated public holiday. */
  holiday: number
  /** Hours flagged as Gastfahrt (passenger travel). */
  gastfahrt: number
}

const EMPTY: ZuschlagBreakdown = {
  night25: 0,
  night40: 0,
  sunday: 0,
  holiday: 0,
  gastfahrt: 0,
}

/**
 * Compute overlap hours between the shift [start, end] (minutes from
 * midnight; overnight shifts have end > 1440) and a fixed window
 * [winStart, winEnd]. Tests both today's and tomorrow's window so the
 * 40% band (00:00–04:00) of an overnight shift is captured.
 */
function overlapHours(
  shiftStart: number,
  shiftEnd: number,
  winStart: number,
  winEnd: number,
): number {
  const a1 = Math.max(shiftStart, winStart)
  const b1 = Math.min(shiftEnd, winEnd)
  const today = Math.max(0, b1 - a1)
  const a2 = Math.max(shiftStart, winStart + 1440)
  const b2 = Math.min(shiftEnd, winEnd + 1440)
  const tomorrow = Math.max(0, b2 - a2)
  return (today + tomorrow) / 60
}

export function calculateZuschlag(
  date: string,
  startTime: string,
  endTime: string,
  breakMinutes: number = 0,
  isGastfahrt: boolean = false,
  /** When omitted, auto-generated for the date's year + Rheinmaasrail state (NW). */
  holidays?: string[],
  /** When omitted, auto-generated for the date's year (1./2. Weihnachten). */
  excluded?: string[],
  /** Override for non-NRW deployments. */
  state: GermanState = DEFAULT_STATE,
): ZuschlagBreakdown {
  if (!date || !startTime || !endTime) return { ...EMPTY }

  const shift = calculateShiftTimes(date, startTime, endTime, breakMinutes)
  const netHours = shift.netHours
  if (netHours <= 0) return { ...EMPTY }

  // Auto-derive the holiday list for the shift's year(s) — covers both
  // the start date and the next day in the overnight case. Previously we
  // shipped a hard-coded 2025 list which silently treated 01.05.2026
  // (Tag der Arbeit) as a normal weekday (Issue 4 in the bug brief).
  const startYear = parseInt(date.slice(0, 4), 10)
  const endYear = parseInt(shift.endDate.slice(0, 4), 10)
  const years = startYear === endYear ? [startYear] : [startYear, endYear]
  const holidayList = holidays ?? holidayDatesFor(years, state)
  const excludedList = excluded ?? excludedZuschlagDatesFor(years)

  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (shift.isOvernight) endMin += 1440

  const night25 = overlapHours(startMin, endMin, 1200, 1440)
  const night40 = overlapHours(startMin, endMin, 0, 240)

  const weekday = new Date(`${date}T00:00:00`).getDay()
  const sunday = weekday === 0 ? netHours : 0

  const isHoliday = holidayList.includes(date) && !excludedList.includes(date)
  const holiday = isHoliday ? netHours : 0

  const gastfahrt = isGastfahrt ? netHours : 0

  return { night25, night40, sunday, holiday, gastfahrt }
}

export function sumZuschlag(rows: ZuschlagBreakdown[]): ZuschlagBreakdown {
  return rows.reduce<ZuschlagBreakdown>(
    (acc, r) => ({
      night25: acc.night25 + r.night25,
      night40: acc.night40 + r.night40,
      sunday: acc.sunday + r.sunday,
      holiday: acc.holiday + r.holiday,
      gastfahrt: acc.gastfahrt + r.gastfahrt,
    }),
    { ...EMPTY },
  )
}
