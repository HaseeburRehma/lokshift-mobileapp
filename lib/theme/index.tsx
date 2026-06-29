/**
 * Theme provider — LOCKED TO LIGHT MODE app-wide.
 *
 * Per product decision the app does NOT follow the device's dark mode
 * setting. `userInterfaceStyle: "light"` in app.json keeps iOS native UI
 * (status bar, keyboard, action sheets, modals) in light mode, and this
 * provider forces NativeWind's color scheme to 'light' so every `dark:`
 * Tailwind variant scattered through the codebase stays a no-op.
 *
 * The `setPref` API is preserved as a no-op so existing settings-screen
 * code that toggles theme still compiles without churn.
 */

import React, { createContext, useContext, useEffect } from 'react'
import { useColorScheme as useNwColorScheme } from 'nativewind'

import type { ThemePref } from '@/lib/preferences'

interface ThemeContextValue {
  pref: ThemePref
  /** Effective scheme — always 'light'. */
  scheme: 'light' | 'dark'
  setPref: (next: ThemePref) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useNwColorScheme()

  useEffect(() => {
    setColorScheme('light')
  }, [setColorScheme])

  return (
    <ThemeContext.Provider value={{ pref: 'light', scheme: 'light', setPref: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return { pref: 'light', scheme: 'light', setPref: () => {} }
  }
  return ctx
}
