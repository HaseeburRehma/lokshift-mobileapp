/**
 * Background location task. While the user has an open time_entries
 * row (end_time IS NULL), expo-location ships periodic position
 * updates to a TaskManager task that writes the latest coords back to
 * `profiles.last_lat/last_lng/last_location_update`. The Live
 * Operations map reads from those columns, so dispatch sees movement
 * during a shift, not just the start-of-shift snapshot.
 *
 * The task is started by `startTrackingIfClockedIn()` on clock-in /
 * app resume, and stopped by `stopTracking()` on clock-out / sign-out.
 * Permission requests stay on the foreground caller so the system
 * "Always" prompt only appears at a meaningful moment (toggle in
 * security settings or first clock-in attempt).
 */

import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { getSupabase } from '@/lib/supabase/client'

export const LOCATION_TASK_NAME = 'lokshift.location.background'

const STORAGE_KEY_USER_ID = 'lokshift.location.userId'
const STORAGE_KEY_ENABLED = 'lokshift.location.bgEnabled'

// Define the task at module scope so the OS can reach it after a cold
// launch from a background trigger. The defineTask call is idempotent:
// JS hot-reload will re-register the same name without error.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[bg-location] task error:', error.message)
    return
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)
    ?.locations
  if (!locations || locations.length === 0) return

  // We only care about the freshest sample; older buffered points just
  // generate write amplification.
  const latest = locations[locations.length - 1]
  const userId = await AsyncStorage.getItem(STORAGE_KEY_USER_ID)
  if (!userId) return

  try {
    const supabase = getSupabase()
    await supabase
      .from('profiles')
      .update({
        last_lat: latest.coords.latitude,
        last_lng: latest.coords.longitude,
        last_location_update: new Date(latest.timestamp).toISOString(),
      } as any)
      .eq('id', userId)
  } catch (e) {
    console.warn('[bg-location] supabase write failed (non-fatal):', e)
  }
})

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
  } catch {
    return false
  }
}

/** Read the user's opt-in flag (security settings toggle). */
export async function getBackgroundLocationEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY_ENABLED)
  return v === '1'
}

export async function setBackgroundLocationEnabled(v: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_ENABLED, v ? '1' : '0')
  if (!v) await stopTracking()
}

/**
 * Begin shipping location updates. Idempotent — does nothing if the
 * task is already running for the same user.
 */
export async function startTracking(userId: string): Promise<boolean> {
  if (!userId) return false

  // Foreground permission is a prerequisite for "always" on both
  // platforms.
  const fg = await Location.getForegroundPermissionsAsync()
  if (!fg.granted) {
    const req = await Location.requestForegroundPermissionsAsync()
    if (!req.granted) return false
  }

  const bg = await Location.getBackgroundPermissionsAsync()
  if (!bg.granted) {
    const req = await Location.requestBackgroundPermissionsAsync()
    if (!req.granted) return false
  }

  await AsyncStorage.setItem(STORAGE_KEY_USER_ID, userId)

  const already = await isBackgroundTrackingActive()
  if (already) return true

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    // 5 minutes between samples; well under the 1-2 % battery / hour
    // budget the OS allows for foreground-service-like behaviour.
    timeInterval: 5 * 60 * 1000,
    distanceInterval: 100, // metres — skip updates if the user is parked.
    deferredUpdatesInterval: 5 * 60 * 1000,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Lokshift Schicht aktiv',
      notificationBody:
        'Standort wird zur Anzeige in der Live-Einsatzkarte aktualisiert.',
      notificationColor: '#0064E0',
    },
    pausesUpdatesAutomatically: false,
  })
  return true
}

export async function stopTracking(): Promise<void> {
  const active = await isBackgroundTrackingActive()
  if (active) {
    try {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME)
    } catch {}
  }
  await AsyncStorage.removeItem(STORAGE_KEY_USER_ID)
}

/**
 * Convenience wrapper for app code: start tracking iff the user opted-in
 * AND we have a userId. Returns true when tracking is running afterwards.
 */
export async function startTrackingIfEnabled(userId: string): Promise<boolean> {
  const enabled = await getBackgroundLocationEnabled()
  if (!enabled) return false
  return startTracking(userId)
}
