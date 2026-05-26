/**
 * Biometric-lock provider.
 *
 * Responsibilities:
 *   - On app launch, if the user has opted-in and a session exists, the
 *     UI starts in the "locked" state until the biometric prompt
 *     succeeds.
 *   - On every transition active → background (with at least N seconds
 *     of grace), re-lock so coming back to the foreground prompts
 *     again. This matches WhatsApp / 1Password behaviour.
 *   - The Locked overlay is rendered separately by the LockOverlay
 *     component so the provider can stay rendering children untouched.
 *
 * The provider is a no-op when the user hasn't opted-in or the device
 * doesn't support biometrics — `locked` stays false and the unlock
 * helper resolves true immediately.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'

import { useUser } from '@/lib/user-context'
import {
  authenticate,
  getBiometricSupport,
  isBiometricEnabled,
} from './index'

const RELOCK_GRACE_MS = 30_000 // 30 s — typical app-switch buffer.

interface LockContextValue {
  /** True when the UI should be hidden behind the biometric prompt. */
  locked: boolean
  /** True when the underlying device supports + has enrolled biometrics. */
  supported: boolean
  /** Trigger the prompt. Resolves true on success. */
  unlock: () => Promise<boolean>
}

const LockContext = createContext<LockContextValue | null>(null)

export function BiometricLockProvider({ children }: { children: React.ReactNode }) {
  const { session } = useUser()
  const [locked, setLocked] = useState(false)
  const [supported, setSupported] = useState(false)
  const appState = useRef<AppStateStatus>(AppState.currentState)
  const backgroundedAt = useRef<number | null>(null)

  // Detect support once at mount.
  useEffect(() => {
    getBiometricSupport().then((s) => setSupported(s.hasHardware && s.enrolled))
  }, [])

  // Lock on launch if the user is signed-in AND has opted-in.
  useEffect(() => {
    if (!session) {
      setLocked(false)
      return
    }
    isBiometricEnabled().then((enabled) => {
      if (enabled) setLocked(true)
    })
  }, [session])

  // Re-lock when the app returns from a >grace background spell.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = appState.current
      appState.current = next

      if (next === 'background' || next === 'inactive') {
        if (prev === 'active') backgroundedAt.current = Date.now()
        return
      }
      if (next === 'active' && prev !== 'active') {
        const wasAway = backgroundedAt.current
          ? Date.now() - backgroundedAt.current
          : 0
        backgroundedAt.current = null
        if (!session) return
        if (wasAway < RELOCK_GRACE_MS) return
        const enabled = await isBiometricEnabled()
        if (enabled) setLocked(true)
      }
    })
    return () => sub.remove()
  }, [session])

  const unlock = useCallback(async (): Promise<boolean> => {
    if (!locked) return true
    const ok = await authenticate('Lokshift entsperren', {
      cancelLabel: 'Abbrechen',
      disableDeviceFallback: false,
    })
    if (ok) setLocked(false)
    return ok
  }, [locked])

  return (
    <LockContext.Provider value={{ locked, supported, unlock }}>
      {children}
    </LockContext.Provider>
  )
}

export function useBiometricLock(): LockContextValue {
  const c = useContext(LockContext)
  if (!c) return { locked: false, supported: false, unlock: async () => true }
  return c
}
