/**
 * German public holiday calculator — NRW-defaults for Rheinmaasrail.
 *
 * Previously the codebase hard-coded a `DEFAULT_HOLIDAYS_2025` list, so
 * shifts on 01.05.2026 (Tag der Arbeit), Karfreitag 2026, etc. were
 * silently treated as regular workdays — no Feiertagszuschlag applied
 * (Issue 4 from the client bug brief).
 *
 * This module computes the holidays for any year using the Anonymous
 * Gregorian algorithm for Easter, then derives all Easter-relative
 * holidays from it. Fixed-date holidays (Neujahr, 1. Mai, Tag der
 * Deutschen Einheit, 1./2. Weihnachten) are added directly.
 *
 * State-specific holidays:
 *   - NW (NRW): Fronleichnam, Allerheiligen
 *   - BY (Bayern): Heilige Drei Könige, Mariä Himmelfahrt, …
 *   - BW (Baden-Württemberg): Heilige Drei Könige, Fronleichnam, …
 *   - … etc.  Phase 1 covers NW since that's the client's location.
 *
 * Pure module — no I/O. Cache one Map per year for repeat calls.
 */

export type GermanState =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH'

export const DEFAULT_STATE: GermanState = 'NW' // Rheinmaasrail = NRW

export interface GermanHoliday {
  /** YYYY-MM-DD */
  date: string
  /** Localized name in German. */
  name: string
}

/**
 * Excluded from the Feiertagszuschlag column — paid via the separate
 * Weihnachtsgeld scheme (preserved from the original client convention).
 */
export const EXCLUDED_HOLIDAY_NAMES = ['1. Weihnachtstag', '2. Weihnachtstag']

// ─── Easter algorithm (Anonymous Gregorian) ────────────────────────────────

/**
 * Returns the date of Easter Sunday for the given year (Gregorian).
 * Source: Knuth TAOCP, Vol. 1, Algorithm E.
 */
function easterSunday(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

// ─── Holiday generator ─────────────────────────────────────────────────────

const _cache = new Map<string, GermanHoliday[]>()

export function generateGermanHolidays(
  year: number,
  state: GermanState = DEFAULT_STATE,
): GermanHoliday[] {
  const key = `${year}:${state}`
  const cached = _cache.get(key)
  if (cached) return cached

  const easter = easterSunday(year)
  const holidays: GermanHoliday[] = [
    // ─── Federal fixed-date holidays ──────────────────────────────────────
    { date: `${year}-01-01`, name: 'Neujahr' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit' },
    { date: `${year}-12-25`, name: '1. Weihnachtstag' },
    { date: `${year}-12-26`, name: '2. Weihnachtstag' },

    // ─── Federal Easter-relative ──────────────────────────────────────────
    { date: toIso(addDays(easter, -2)), name: 'Karfreitag' },
    { date: toIso(addDays(easter, 1)),  name: 'Ostermontag' },
    { date: toIso(addDays(easter, 39)), name: 'Christi Himmelfahrt' },
    { date: toIso(addDays(easter, 50)), name: 'Pfingstmontag' },
  ]

  // ─── State-specific ────────────────────────────────────────────────────
  if (state === 'NW') {
    holidays.push({ date: toIso(addDays(easter, 60)), name: 'Fronleichnam' })
    holidays.push({ date: `${year}-11-01`, name: 'Allerheiligen' })
  } else if (state === 'BY' || state === 'BW' || state === 'HE' || state === 'RP' || state === 'SL') {
    holidays.push({ date: toIso(addDays(easter, 60)), name: 'Fronleichnam' })
    if (state === 'BY' || state === 'BW') {
      holidays.push({ date: `${year}-01-06`, name: 'Heilige Drei Könige' })
    }
    if (state === 'BY' || state === 'SL') {
      holidays.push({ date: `${year}-08-15`, name: 'Mariä Himmelfahrt' })
    }
    if (state === 'BW' || state === 'BY' || state === 'SL') {
      holidays.push({ date: `${year}-11-01`, name: 'Allerheiligen' })
    }
  } else if (state === 'BE') {
    holidays.push({ date: `${year}-03-08`, name: 'Internationaler Frauentag' })
  }
  // Reformationstag (31.10.) for BB, MV, SN, ST, TH, HB, HH, NI, SH
  if (['BB', 'MV', 'SN', 'ST', 'TH', 'HB', 'HH', 'NI', 'SH'].includes(state)) {
    holidays.push({ date: `${year}-10-31`, name: 'Reformationstag' })
  }
  // Buß- und Bettag (Wed before 23.11.) for SN
  if (state === 'SN') {
    const nov23 = new Date(year, 10, 23)
    const dow = nov23.getDay() // 0 = Sun
    const offset = ((dow - 3 + 7) % 7) + 0 // back to previous Wed
    const bbDate = addDays(nov23, -(offset === 0 ? 7 : offset))
    holidays.push({ date: toIso(bbDate), name: 'Buß- und Bettag' })
  }

  // Sort by date and cache
  holidays.sort((a, b) => a.date.localeCompare(b.date))
  _cache.set(key, holidays)
  return holidays
}

/**
 * Flat list of holiday dates (YYYY-MM-DD) for the given year(s) and
 * state. Convenience wrapper for the zuschlag engine.
 */
export function holidayDatesFor(
  years: number | number[],
  state: GermanState = DEFAULT_STATE,
): string[] {
  const list = Array.isArray(years) ? years : [years]
  const out: string[] = []
  for (const y of list) {
    for (const h of generateGermanHolidays(y, state)) {
      out.push(h.date)
    }
  }
  return out
}

/**
 * Returns the name of the holiday for a given date, or null if not a
 * holiday. Useful for displaying "Tag der Arbeit" next to the date in
 * the Stundenzettel.
 */
export function holidayName(
  date: string,
  state: GermanState = DEFAULT_STATE,
): string | null {
  if (!date || date.length < 4) return null
  const year = parseInt(date.slice(0, 4), 10)
  if (!Number.isFinite(year)) return null
  const match = generateGermanHolidays(year, state).find((h) => h.date === date)
  return match ? match.name : null
}

/**
 * Excluded-from-Zuschlag dates for a given year (Christmas Day + Boxing
 * Day, paid via Weihnachtsgeld instead).
 */
export function excludedZuschlagDatesFor(years: number | number[]): string[] {
  const list = Array.isArray(years) ? years : [years]
  const out: string[] = []
  for (const y of list) {
    out.push(`${y}-12-25`, `${y}-12-26`)
  }
  return out
}
