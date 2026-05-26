/**
 * DrawerContext — small state container that lets the AppHeader's
 * hamburger button open the AppDrawer rendered at the (tabs) layout
 * level. Keeping state separate from either component means we can
 * trigger the drawer from anywhere (e.g. a deep-link or a Settings row)
 * without prop-drilling.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface DrawerContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const value = useMemo<DrawerContextValue>(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle])

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext)
  if (!ctx) {
    // Falling back keeps the hook usable outside the provider (eg. preview tools).
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} }
  }
  return ctx
}
