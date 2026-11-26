/**
 * German public holidays for all 16 federal states (Bundesländer) —
 * identical copy in the webapp and the mobile app. Pure module, no I/O.
 *
 * Billing spec (Nov 2026), section 2: public holidays depend on the
 * employee's Bundesland (profiles.federal_state). Only holidays that apply
 * state-wide by law are listed; holidays of single municipalities
 * (Fronleichnam in parts of Sachsen/Thüringen, Augsburger Friedensfest) are
 * not. Mariä Himmelfahrt counts for all of Bayern (it is a holiday in the
 * large majority of Bavarian municipalities).
 *
 * Easter: Anonymous Gregorian algorithm; Easter-relative holidays derive
 * from it. Ostersonntag/Pfingstsonntag are listed for Brandenburg, where
 * they are statutory holidays (they fall on a Sunday anyway).
 */

export type GermanState =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH'

/** Rheinmaasrail = Nordrhein-Westfalen; used when no state is set. */
export const DEFAULT_STATE: GermanState = 'NW'

export const GERMAN_STATES: { code: GermanState; name: string }[] = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
]

export function isGermanState(value: unknown): value is GermanState {
  return typeof value === 'string' && GERMAN_STATES.some((s) => s.code === value)
}

/** A valid state code, else the default (NW). */
export function resolveState(value: unknown, fallback: GermanState = DEFAULT_STATE): GermanState {
  return isGermanState(value) ? value : fallback
}

export function stateName(code: string | null | undefined): string {
  return GERMAN_STATES.find((s) => s.code === code)?.name ?? ''
}

export interface GermanHoliday {
  /** YYYY-MM-DD */
  date: string
  /** German name. */
  name: string
}

// ─── Calendar arithmetic (pure UTC, independent of the device timezone) ────

function ymd(year: number, month: number, day: number): string {
  const t = new Date(0)
  t.setUTCFullYear(year, month - 1, day)
  return `${String(t.getUTCFullYear()).padStart(4, '0')}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** Easter Sunday as [month, day] (Anonymous Gregorian algorithm). */
function easter(year: number): [number, number] {
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
  return [month, day]
}

/** Buß- und Bettag: the last Wednesday before 23 November. */
function bussUndBettag(year: number): string {
  const t = new Date(Date.UTC(2000, 10, 23))
  t.setUTCFullYear(year)
  const dow = t.getUTCDay() // 0 = Sunday
  const back = ((dow - 3 + 7) % 7) || 7
  return ymd(year, 11, 23 - back)
}

// ─── Holiday generator ─────────────────────────────────────────────────────

const _cache = new Map<string, GermanHoliday[]>()

const STATES_FRONLEICHNAM: GermanState[] = ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']
const STATES_ALLERHEILIGEN: GermanState[] = ['BW', 'BY', 'NW', 'RP', 'SL']
const STATES_DREIKOENIG: GermanState[] = ['BW', 'BY', 'ST']
const STATES_REFORMATION: GermanState[] = ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']
const STATES_FRAUENTAG: GermanState[] = ['BE', 'MV']

export function generateGermanHolidays(year: number, state: GermanState = DEFAULT_STATE): GermanHoliday[] {
  const st = resolveState(state)
  const key = `${year}:${st}`
  const cached = _cache.get(key)
  if (cached) return cached

  const [em, ed] = easter(year)
  const fromEaster = (n: number) => ymd(year, em, ed + n)

  const list: GermanHoliday[] = [
    // Nationwide
    { date: ymd(year, 1, 1), name: 'Neujahr' },
    { date: fromEaster(-2), name: 'Karfreitag' },
    { date: fromEaster(1), name: 'Ostermontag' },
    { date: ymd(year, 5, 1), name: 'Tag der Arbeit' },
    { date: fromEaster(39), name: 'Christi Himmelfahrt' },
    { date: fromEaster(50), name: 'Pfingstmontag' },
    { date: ymd(year, 10, 3), name: 'Tag der Deutschen Einheit' },
    { date: ymd(year, 12, 25), name: '1. Weihnachtstag' },
    { date: ymd(year, 12, 26), name: '2. Weihnachtstag' },
  ]

  if (STATES_DREIKOENIG.includes(st)) list.push({ date: ymd(year, 1, 6), name: 'Heilige Drei Könige' })
  if (STATES_FRAUENTAG.includes(st)) list.push({ date: ymd(year, 3, 8), name: 'Internationaler Frauentag' })
  if (st === 'BB') {
    list.push({ date: fromEaster(0), name: 'Ostersonntag' })
    list.push({ date: fromEaster(49), name: 'Pfingstsonntag' })
  }
  if (STATES_FRONLEICHNAM.includes(st)) list.push({ date: fromEaster(60), name: 'Fronleichnam' })
  if (st === 'BY' || st === 'SL') list.push({ date: ymd(year, 8, 15), name: 'Mariä Himmelfahrt' })
  if (st === 'TH') list.push({ date: ymd(year, 9, 20), name: 'Weltkindertag' })
  if (STATES_REFORMATION.includes(st)) list.push({ date: ymd(year, 10, 31), name: 'Reformationstag' })
  if (STATES_ALLERHEILIGEN.includes(st)) list.push({ date: ymd(year, 11, 1), name: 'Allerheiligen' })
  if (st === 'SN') list.push({ date: bussUndBettag(year), name: 'Buß- und Bettag' })

  list.sort((a, b) => a.date.localeCompare(b.date))
  _cache.set(key, list)
  return list
}

/** Flat list of holiday dates (YYYY-MM-DD) for the given year(s). */
export function holidayDatesFor(years: number | number[], state: GermanState = DEFAULT_STATE): string[] {
  const list = Array.isArray(years) ? years : [years]
  return list.flatMap((y) => generateGermanHolidays(y, state).map((h) => h.date))
}

/** Name of the public holiday on a YYYY-MM-DD date, or null. */
export function holidayName(date: string, state: GermanState = DEFAULT_STATE): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const year = Number(date.slice(0, 4))
  return generateGermanHolidays(year, state).find((h) => h.date === date)?.name ?? null
}
