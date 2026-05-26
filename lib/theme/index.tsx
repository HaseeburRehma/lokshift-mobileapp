/**
 * Theme provider — wires the user preference (system / light / dark)
 * into NativeWind's `useColorScheme()` so `dark:` variants on Tailwind
 * classes resolve correctly across the app.
 *
 * Persists the preference per device via the small AsyncStorage helper
 * in lib/preferences. On first launch the preference defaults to
 * 'system' so the app follows whatever the OS is set to.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme as useNwColorScheme } from 'nativewind'
import { useColorScheme as useRnColorScheme } from 'react-native'

import { getThemePref, setThemePref, type ThemePref } from '@/lib/preferences'

interface ThemeContextValue {
  pref: ThemePref
  /** The effective scheme after resolving 'system' against the OS. */
  scheme: 'light' | 'dark'
  setPref: (next: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system')
  const { setColorScheme } = useNwColorScheme()
  const system = useRnColorScheme() ?? 'light'

  useEffect(() => {
    getThemePref().then((v) => setPrefState(v))
  }, [])

  const scheme: 'light' | 'dark' = pref === 'system' ? (system as 'light' | 'dark') : pref

  useEffect(() => {
    setColorScheme(scheme)
  }, [scheme, setColorScheme])

  const setPref = (next: ThemePref) => {
    setPrefState(next)
    setThemePref(next).catch(() => {})
  }

  return (
    <ThemeContext.Provider value={{ pref, scheme, setPref }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return { pref: 'system', scheme: 'light', setPref: () => {} }
  }
  return ctx
}
