/**
 * Time-entry math — pure functions used by the mobile Times screens.
 * Lifted from the webapp's `lib/time/shift-hours.ts` and stripped of
 * Spesen logic (mobile v1 displays net hours; full Spesen calc stays in
 * the webapp).
 */

export interface ShiftMath {
  startISO: string
  endISO: string
  startDate: string
  endDate: string
  isOvernight: boolean
  netHours: number
}

/** Compose ISO timestamps from a YYYY-MM-DD date + HH:mm time-of-day. */
function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`)
}

/** Add `n` days to YYYY-MM-DD without timezone drift. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function calculateShift(
  date: string,
  start: string,
  end: string,
  breakMinutes: number,
): ShiftMath {
  // Reject obviously-malformed inputs so callers can short-circuit.
  if (!date || !start || !end) {
    return {
      startISO: '', endISO: '', startDate: date ?? '', endDate: date ?? '',
      isOvernight: false, netHours: 0,
    }
  }

  const isOvernight = end < start
  const endDate = isOvernight ? addDays(date, 1) : date
  const startDt = combine(date, start)
  const endDt = combine(endDate, end)

  const gross = Math.max(0, (endDt.getTime() - startDt.getTime()) / 3_600_000)
  const net = Math.max(0, gross - (breakMinutes || 0) / 60)

  return {
    startISO: startDt.toISOString(),
    endISO: endDt.toISOString(),
    startDate: date,
    endDate,
    isOvernight,
    netHours: Number(net.toFixed(2)),
  }
}
