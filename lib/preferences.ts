/**
 * Lightweight per-device preferences (date format, etc.) backed by
 * AsyncStorage. Language is handled by `lib/i18n/index.tsx`; timezone
 * is read from the device's Intl resolved options at runtime, no
 * persistence needed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY_DATE_FORMAT = 'lokshift.dateFormat'
const KEY_THEME = 'lokshift.theme'

export type DateFormat = 'de' | 'iso' | 'us'
export type ThemePref = 'system' | 'light' | 'dark'

export const DATE_FORMAT_EXAMPLES: Record<DateFormat, string> = {
  de: '31.12.2026',
  iso: '2026-12-31',
  us: '12/31/2026',
}

export async function getDateFormat(): Promise<DateFormat> {
  const v = await AsyncStorage.getItem(KEY_DATE_FORMAT)
  if (v === 'iso' || v === 'us') return v
  return 'de'
}

export async function setDateFormat(v: DateFormat): Promise<void> {
  await AsyncStorage.setItem(KEY_DATE_FORMAT, v)
}

export async function getThemePref(): Promise<ThemePref> {
  const v = await AsyncStorage.getItem(KEY_THEME)
  if (v === 'light' || v === 'dark') return v
  return 'system'
}

export async function setThemePref(v: ThemePref): Promise<void> {
  await AsyncStorage.setItem(KEY_THEME, v)
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
  } catch {
    return 'Europe/Berlin'
  }
}
