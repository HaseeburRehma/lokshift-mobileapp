/**
 * Holiday list storage. Persists to AsyncStorage per device for now;
 * when the web ships a shared `org_holidays` table this can switch to
 * Supabase reads/writes without changing the consumer API.
 *
 * Default seed comes from `DEFAULT_HOLIDAYS_2025` in the zuschlag engine
 * so a fresh install already produces the right Stundenzettel totals.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_HOLIDAYS_2025 } from '@/lib/time/zuschlag'

const STORAGE_KEY = 'lokshift.holidays'

export interface HolidayEntry {
  date: string // YYYY-MM-DD
  label: string
}

const DEFAULT_LABELS: Record<string, string> = {
  '2025-01-01': 'Neujahr',
  '2025-04-18': 'Karfreitag',
  '2025-04-21': 'Ostermontag',
  '2025-05-01': 'Tag der Arbeit',
  '2025-05-29': 'Christi Himmelfahrt',
  '2025-06-09': 'Pfingstmontag',
  '2025-06-19': 'Fronleichnam',
  '2025-10-03': 'Tag der Deutschen Einheit',
  '2025-11-01': 'Allerheiligen',
}

function defaultList(): HolidayEntry[] {
  return DEFAULT_HOLIDAYS_2025.map((d) => ({
    date: d,
    label: DEFAULT_LABELS[d] ?? '',
  }))
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
        if (typeof row === 'string') return { date: row, label: DEFAULT_LABELS[row] ?? '' }
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
