/**
 * Background location — DISABLED (Apple guideline 2.5.4 rejection).
 *
 * Persistent location tracking for employee visibility was rejected by
 * Apple in the 1.0 (15) review. All functions in this module are now
 * safe no-ops so existing call sites don't need to be touched. The
 * corresponding UI toggle in security settings has been removed too.
 *
 * Location is still captured at clock-in / clock-out via the foreground
 * `expo-location` helpers in `hooks/useTimeTracking.ts` — that's fine
 * under Apple's "When In Use" permission model.
 */

export const LOCATION_TASK_NAME = 'lokshift.location.background'

export async function isBackgroundTrackingActive(): Promise<boolean> {
  return false
}

export async function getBackgroundLocationEnabled(): Promise<boolean> {
  return false
}

export async function setBackgroundLocationEnabled(_v: boolean): Promise<void> {
  // No-op — feature removed.
}

export async function startTracking(_userId: string): Promise<boolean> {
  return false
}

export async function stopTracking(): Promise<void> {
  // No-op.
}

export async function startTrackingIfEnabled(_userId: string): Promise<boolean> {
  return false
}
