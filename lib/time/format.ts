/**
 * Display formatting for hours, money and dates — identical copy in the
 * webapp and the mobile app. German output uses a decimal comma; times and
 * dates of instants are always German time (Europe/Berlin).
 */

import { berlinDateKey, berlinTimeKey, berlinWallClock, weekdayOfDateKey } from './berlin'

export type Locale = 'de' | 'en'

export const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
export const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const WEEKDAYS_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const WEEKDAYS_SHORT_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
/** Duden short forms ("Mai", "Juni", "Juli" stay unabbreviated). */
export const MONTHS_SHORT_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']
export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 7.5 → "7,50" (de) / "7.50" (en). */
export function formatHours(hours: number | null | undefined, locale: Locale = 'de'): string {
  const n = Number(hours) || 0
  const s = n.toFixed(2)
  return locale === 'de' ? s.replace('.', ',') : s
}

/** 7.5 → "7 Std. 30 Min." — explains decimal hours. */
export function formatHoursLong(hours: number | null | undefined, locale: Locale = 'de'): string {
  const total = Math.round((Number(hours) || 0) * 60)
  const sign = total < 0 ? '−' : ''
  const abs = Math.abs(total)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return locale === 'de' ? `${sign}${h} Std. ${m} Min.` : `${sign}${h} h ${m} min`
}

/** 7.5 → "7:30". */
export function formatHoursClock(hours: number | null | undefined): string {
  const total = Math.round((Number(hours) || 0) * 60)
  const abs = Math.abs(total)
  return `${total < 0 ? '−' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`
}

export function formatSignedHours(hours: number | null | undefined, locale: Locale = 'de'): string {
  const n = Number(hours) || 0
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatHours(Math.abs(n), locale)}`
}

export function formatEuro(amount: number | null | undefined, locale: Locale = 'de'): string {
  const n = Number(amount) || 0
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-GB', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}

function validInstant(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null
  const d = iso instanceof Date ? iso : new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "HH:mm" in German time of a stored instant. */
export function formatTimeOfDay(iso: string | Date | null | undefined): string {
  const d = validInstant(iso)
  return d ? berlinTimeKey(d) : ''
}

/** "14.10.2026" — German date of a stored instant. */
export function formatInstantDate(iso: string | Date | null | undefined): string {
  const d = validInstant(iso)
  return d ? formatDateDE(berlinDateKey(d)) : ''
}

/** "14.10.2026, 22:00" — German date and time of a stored instant. */
export function formatInstantDateTime(iso: string | Date | null | undefined): string {
  const d = validInstant(iso)
  return d ? `${formatDateDE(berlinDateKey(d))}, ${berlinTimeKey(d)}` : ''
}

/** "Mi, 14.10.2026" (short) / "Mittwoch, 14.10.2026" — German date of an instant with weekday. */
export function formatInstantWeekdayDate(iso: string | Date | null | undefined, locale: Locale = 'de', short = true): string {
  const d = validInstant(iso)
  if (!d) return ''
  const key = berlinDateKey(d)
  return `${weekdayName(key, locale, short)}, ${formatDateDE(key)}`
}

/** "14. Okt." / "Oct 14" — short German day + month of an instant. */
export function formatInstantDayMonth(iso: string | Date | null | undefined, locale: Locale = 'de'): string {
  const d = validInstant(iso)
  if (!d) return ''
  const w = berlinWallClock(d)
  return locale === 'de' ? `${w.day}. ${MONTHS_SHORT_DE[w.month - 1]}` : `${MONTHS_EN[w.month - 1].slice(0, 3)} ${w.day}`
}

/** "2026-10-10" → "10.10.2026". */
export function formatDateDE(date: string | null | undefined): string {
  if (!date) return ''
  const [y, m, d] = date.split('-')
  return d && m && y ? `${d}.${m}.${y}` : date
}

export function weekdayName(date: string, locale: Locale = 'de', short = false): string {
  const idx = weekdayOfDateKey(date)
  if (short) return (locale === 'de' ? WEEKDAYS_SHORT_DE : WEEKDAYS_SHORT_EN)[idx]
  return (locale === 'de' ? WEEKDAYS_DE : WEEKDAYS_EN)[idx]
}

/** "2026-10" → "Oktober 2026". */
export function monthLabel(monthKey: string, locale: Locale = 'de'): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return `${(locale === 'de' ? MONTHS_DE : MONTHS_EN)[m - 1]} ${y}`
}

/** "2026-10" → "10/2026". */
export function monthShort(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${m}/${y}`
}

/** Start time + end time with a "+1" marker when the shift ends on a later day. */
export function formatShiftRange(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  locale: Locale = 'de',
): string {
  const start = formatTimeOfDay(startIso)
  if (!endIso) return `${start} – ${locale === 'de' ? 'läuft' : 'running'}`
  const s = validInstant(startIso)
  const e = validInstant(endIso)
  const offset = s && e ? Math.round((Date.parse(berlinDateKey(e)) - Date.parse(berlinDateKey(s))) / 86_400_000) : 0
  return `${start} – ${formatTimeOfDay(endIso)}${offset > 0 ? ` (+${offset})` : ''}`
}
