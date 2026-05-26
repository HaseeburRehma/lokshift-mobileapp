/**
 * useTimeTracking — clock in / break / clock out lifecycle for the
 * currently authenticated user. Mirrors the webapp's hook 1:1 including:
 *
 *   - best-effort geolocation capture on clockIn (5 s timeout; missing
 *     coords are NOT a blocker — the shift still starts)
 *   - latitude/longitude written into time_entries (matches web payload)
 *   - profiles.last_lat / last_lng / last_location_update updated so the
 *     Live Operations map can pin the employee on the map
 *   - break_minutes written on clockOut alongside net_hours so the
 *     month-end Stundenzettel summary matches the web export
 *
 * State exposed to the UI:
 *   activeEntry      — the open `time_entries` row (end_time IS NULL) or null
 *   elapsedSeconds   — worked seconds, recomputed every 1s
 *   breakSeconds     — break seconds, recomputed every 1s
 *   todayPlans       — confirmed plans starting today (clock-in picker)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import {
  startTrackingIfEnabled,
  stopTracking,
} from '@/lib/location/background'

interface ActiveEntry {
  id: string
  employee_id: string
  start_time: string
  end_time: string | null
  is_on_break: boolean
  current_break_start: string | null
  total_break_seconds: number
  plan_id: string | null
  latitude: number | null
  longitude: number | null
  location: string | null
}

interface TodayPlan {
  id: string
  start_time: string
  end_time: string
  customer?: { id: string; name: string } | null
  location?: string | null
  route?: string | null
}

/**
 * Best-effort current position. Mirrors the web's
 * `navigator.geolocation.getCurrentPosition` semantics: returns null
 * when permission is denied or the lookup times out (does not throw).
 */
async function captureCoords(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync()
    let granted = perm.granted
    if (!granted) {
      const req = await Location.requestForegroundPermissionsAsync()
      granted = req.granted
    }
    if (!granted) return null

    // Cap the wait so a slow GPS lock doesn't keep the user staring at a
    // spinning button. 5 s matches the web's `timeout: 5000`.
    const pos = await Promise.race<Location.LocationObject | null>([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ])
    if (!pos) return null
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
  } catch {
    return null
  }
}

export function useTimeTracking() {
  const supabase = getSupabase()
  const { profile, session } = useUser()
  const myId = session?.user?.id

  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null)
  const [todayPlans, setTodayPlans] = useState<TodayPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [breakSeconds, setBreakSeconds] = useState(0)

  const fetchActive = useCallback(async () => {
    if (!myId || !profile?.organization_id) {
      setLoading(false)
      return
    }
    setLoading(true)

    const today = new Date().toISOString().split('T')[0]
    const [{ data: entry }, { data: plans }] = await Promise.all([
      supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', myId)
        .is('end_time', null)
        .maybeSingle(),
      supabase
        .from('plans')
        .select('*, customer:customers(id, name)')
        .eq('employee_id', myId)
        .eq('status', 'confirmed')
        .gte('start_time', `${today}T00:00:00`)
        .lte('start_time', `${today}T23:59:59`),
    ])

    setActiveEntry((entry ?? null) as ActiveEntry | null)
    setTodayPlans((plans ?? []) as TodayPlan[])
    setLoading(false)
  }, [supabase, myId, profile?.organization_id])

  useEffect(() => {
    if (!myId) return
    fetchActive()
    const channel = supabase
      .channel(uniqueChannelName(`personal-shift-${myId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_entries', filter: `employee_id=eq.${myId}` },
        () => {
          fetchActive()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [myId, fetchActive, supabase])

  // Live ticker — only runs when an entry is open.
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current)
    if (!activeEntry) {
      setElapsedSeconds(0)
      setBreakSeconds(0)
      return
    }
    const startMs = new Date(activeEntry.start_time).getTime()
    const accumBreak = activeEntry.total_break_seconds ?? 0

    tickerRef.current = setInterval(() => {
      const now = Date.now()
      const total = Math.floor((now - startMs) / 1000)
      let currentBreak = 0
      if (activeEntry.is_on_break && activeEntry.current_break_start) {
        currentBreak = Math.floor(
          (now - new Date(activeEntry.current_break_start).getTime()) / 1000,
        )
      }
      setElapsedSeconds(Math.max(0, total - (accumBreak + currentBreak)))
      setBreakSeconds(accumBreak + currentBreak)
    }, 1000)
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [activeEntry])

  const clockIn = useCallback(
    async (planId?: string, location?: string) => {
      if (!myId || !profile?.organization_id) return null

      // Guard against double-clock-in: if the realtime channel hasn't
      // delivered the open entry yet, refuse rather than create a second
      // row. Matches the web's UI-state guard.
      if (activeEntry) return activeEntry

      const now = new Date().toISOString()
      const coords = await captureCoords()

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        employee_id: myId,
        plan_id: planId ?? null,
        location: location ?? null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        start_time: now,
        date: now.split('T')[0],
        is_on_break: false,
        total_break_seconds: 0,
        is_verified: false,
      }

      const { data, error } = await supabase
        .from('time_entries')
        .insert(payload as any)
        .select('*')
        .single()
      if (error) {
        console.warn('[useTimeTracking] clockIn failed:', error.message)
        return null
      }
      setActiveEntry(data as ActiveEntry)

      // Mirror the web's profile snapshot — the Live Operations map
      // pins the employee at profiles.last_lat/last_lng. Best-effort.
      if (coords) {
        try {
          await supabase
            .from('profiles')
            .update({
              last_lat: coords.latitude,
              last_lng: coords.longitude,
              last_location_update: now,
            } as any)
            .eq('id', myId)
        } catch (e) {
          console.warn('[useTimeTracking] profile location update failed (non-fatal):', e)
        }
      }

      // Kick off the background-location task if the user opted-in in
      // security settings. Non-fatal if denied — the snapshot above is
      // already on the map.
      try {
        await startTrackingIfEnabled(myId)
      } catch (e) {
        console.warn('[useTimeTracking] bg tracking start failed (non-fatal):', e)
      }

      return data
    },
    [supabase, myId, profile?.organization_id, activeEntry],
  )

  const startBreak = useCallback(async () => {
    if (!activeEntry || activeEntry.is_on_break) return
    const now = new Date().toISOString()
    await supabase
      .from('time_entries')
      .update({ is_on_break: true, current_break_start: now } as any)
      .eq('id', activeEntry.id)
    setActiveEntry({ ...activeEntry, is_on_break: true, current_break_start: now })
  }, [supabase, activeEntry])

  const endBreak = useCallback(async () => {
    if (!activeEntry || !activeEntry.is_on_break || !activeEntry.current_break_start) return
    const now = new Date()
    const extraBreak = Math.floor(
      (now.getTime() - new Date(activeEntry.current_break_start).getTime()) / 1000,
    )
    const newTotal = (activeEntry.total_break_seconds ?? 0) + extraBreak
    await supabase
      .from('time_entries')
      .update({
        is_on_break: false,
        current_break_start: null,
        total_break_seconds: newTotal,
      } as any)
      .eq('id', activeEntry.id)
    setActiveEntry({
      ...activeEntry,
      is_on_break: false,
      current_break_start: null,
      total_break_seconds: newTotal,
    })
  }, [supabase, activeEntry])

  const clockOut = useCallback(
    async (notes?: string) => {
      if (!activeEntry) return false
      const now = new Date()
      let totalBreak = activeEntry.total_break_seconds ?? 0
      if (activeEntry.is_on_break && activeEntry.current_break_start) {
        totalBreak += Math.floor(
          (now.getTime() - new Date(activeEntry.current_break_start).getTime()) / 1000,
        )
      }
      const grossSeconds = Math.floor(
        (now.getTime() - new Date(activeEntry.start_time).getTime()) / 1000,
      )
      const netHours = Math.max(0, (grossSeconds - totalBreak) / 3600)
      const breakMinutes = Math.round(totalBreak / 60)

      const { error } = await supabase
        .from('time_entries')
        .update({
          end_time: now.toISOString(),
          is_on_break: false,
          current_break_start: null,
          total_break_seconds: totalBreak,
          break_minutes: breakMinutes,
          net_hours: Number(netHours.toFixed(2)),
          notes: notes ?? activeEntry.location ?? null,
        } as any)
        .eq('id', activeEntry.id)
      if (error) {
        console.warn('[useTimeTracking] clockOut failed:', error.message)
        return false
      }
      setActiveEntry(null)

      // Tear down the background-location task so the OS notification
      // disappears and we stop burning battery once the shift is over.
      try {
        await stopTracking()
      } catch (e) {
        console.warn('[useTimeTracking] bg tracking stop failed (non-fatal):', e)
      }
      return true
    },
    [supabase, activeEntry],
  )

  return {
    activeEntry,
    todayPlans,
    loading,
    elapsedSeconds,
    breakSeconds,
    clockIn,
    startBreak,
    endBreak,
    clockOut,
    refresh: fetchActive,
  }
}
