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

export const DEFAULT_HOLIDAYS_2025: string[] = [
  '2025-01-01', // Neujahr
  '2025-04-18', // Karfreitag
  '2025-04-21', // Ostermontag
  '2025-05-01', // Tag der Arbeit
  '2025-05-29', // Christi Himmelfahrt
  '2025-06-09', // Pfingstmontag
  '2025-06-19', // Fronleichnam
  '2025-10-03', // Tag der Deutschen Einheit
  '2025-11-01', // Allerheiligen
]

/**
 * Holidays the client template excludes from the Feiertag column even
 * though they would otherwise qualify. Christmas Day and Boxing Day are
 * paid via a separate Weihnachtsgeld scheme.
 */
export const EXCLUDED_HOLIDAYS: string[] = ['2025-12-25', '2025-12-26']

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
  holidays: string[] = DEFAULT_HOLIDAYS_2025,
  excluded: string[] = EXCLUDED_HOLIDAYS,
): ZuschlagBreakdown {
  if (!date || !startTime || !endTime) return { ...EMPTY }

  const shift = calculateShiftTimes(date, startTime, endTime, breakMinutes)
  const netHours = shift.netHours
  if (netHours <= 0) return { ...EMPTY }

  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  let endMin = eh * 60 + em
  if (shift.isOvernight) endMin += 1440

  const night25 = overlapHours(startMin, endMin, 1200, 1440)
  const night40 = overlapHours(startMin, endMin, 0, 240)

  const weekday = new Date(`${date}T00:00:00`).getDay()
  const sunday = weekday === 0 ? netHours : 0

  const isHoliday = holidays.includes(date) && !excluded.includes(date)
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
