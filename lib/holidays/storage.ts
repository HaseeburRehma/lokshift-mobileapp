/**
 * Holiday list storage. Persists to AsyncStorage per device.
 *
 * The default list is the computed public holidays (current + next year)
 * of the state used by the surcharge engine, so the list always matches
 * what the Stundenzettel counts as Feiertag.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_STATE, generateGermanHolidays } from '@/lib/time/holidays'

const STORAGE_KEY = 'lokshift.holidays'

export interface HolidayEntry {
  date: string // YYYY-MM-DD
  label: string
}

function defaultList(): HolidayEntry[] {
  const year = new Date().getFullYear()
  return [year, year + 1].flatMap((y) =>
    generateGermanHolidays(y, DEFAULT_STATE).map((h) => ({ date: h.date, label: h.name })),
  )
}

export async function loadHolidays(): Promise<HolidayEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultList()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return defaultList()
    // Filter / normalize defensively — accept either the new {date,label}
    // shape or the legacy string form.
    return parsed
      .map((row: any): HolidayEntry | null => {
        if (typeof row === 'string') return { date: row, label: '' }
        if (row && typeof row.date === 'string')
          return { date: row.date, label: String(row.label ?? '') }
        return null
      })
      .filter((x): x is HolidayEntry => !!x)
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return defaultList()
  }
}

export async function saveHolidays(rows: HolidayEntry[]): Promise<void> {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
}

export async function resetHolidays(): Promise<HolidayEntry[]> {
  const seed = defaultList()
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seed))
  return seed
}

export function holidayDates(rows: HolidayEntry[]): string[] {
  return rows.map((r) => r.date)
}
