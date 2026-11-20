/**
 * useTimeTracking — clock in / break / clock out / submit for the signed-in
 * user (same flow as the webapp, Kundenfeedback Punkte 1, 2, 19):
 *
 *   Schicht starten → Pause → Beenden (time stops, entry stays an editable
 *   draft) → Abschlussansicht → Schicht absenden.
 *
 * Dates use the local calendar day; net hours are recalculated by the
 * database trigger, so the client never writes net_hours.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import * as Location from 'expo-location'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { safeParseISO } from '@/lib/safe-format'
import { toast } from '@/components/Toast'
import { addDays, calculateShiftTimes, localDateKey } from '@/lib/time/shift-hours'
import { berlinDateKey, berlinToInstant } from '@/lib/time/berlin'
import { calculateSpesen } from '@/lib/spesen'
import { TIME_ENTRY_SELECT, dbErrorMessage } from '@/lib/times/entry-status'
import { useOrgRules } from '@/hooks/useOrgRules'
import { useTranslation } from '@/lib/i18n'
import type { TimeEntry } from '@/lib/types'
import {
  dequeue,
  enqueue,
  isNetworkError,
  newEntryId,
  nextAttemptAt,
  pendingClockOps,
  sendClockIn,
  sendClockOut,
  type PendingClock,
} from '@/lib/time/pending-clock'
import {
  startTrackingIfEnabled,
  stopTracking,
} from '@/lib/location/background'

interface ActiveEntry {
  id: string
  date?: string
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
  status?: string
  shift_name?: string | null
  customer_id?: string | null
  customer?: { id: string; name: string } | null
  location?: string | null
  route?: string | null
  start_location_id?: string | null
  destination_location_id?: string | null
  is_gastfahrt?: boolean | null
  overnight_stay?: boolean | null
  hotel_address?: string | null
}

export interface SubmitShiftValues {
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  overnightStay: boolean
  notes: string | null
}

/**
 * Best-effort current position. Mirrors the web's
 * `navigator.geolocation.getCurrentPosition` semantics: returns null
 * when permission is denied or the lookup times out (does not throw).
 */
async function captureCoords(): Promise<{ latitude: number; longitude: number } | 'denied' | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync()
    let granted = perm.granted
    if (!granted) {
      const req = await Location.requestForegroundPermissionsAsync()
      granted = req.granted
    }
    if (!granted) return 'denied'

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
  const { spesenRates } = useOrgRules()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null)
  const [drafts, setDrafts] = useState<TimeEntry[]>([])
  const [todayPlans, setTodayPlans] = useState<TodayPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [breakSeconds, setBreakSeconds] = useState(0)

  // Only the very first load shows the placeholder; later refreshes (realtime,
  // foreground) are silent so an open closing sheet is never unmounted.
  const loadedOnce = useRef(false)
  const flushing = useRef(false)
  // While "Schicht starten" saves, a refresh must not replace the
  // optimistic running shift with "nothing running yet".
  const startingRef = useRef(false)

  /** Sends queued offline clock actions whose retry time has come. */
  const flushPending = useCallback(async (force = false): Promise<PendingClock[]> => {
    if (flushing.current) return pendingClockOps()
    flushing.current = true
    try {
      for (const op of await pendingClockOps()) {
        if (!force && op.nextAt > Date.now()) continue
        const res = op.kind === 'clock_in' ? await sendClockIn(op) : await sendClockOut(op, TIME_ENTRY_SELECT)
        if (!res.error) {
          await dequeue(op.kind, op.id)
        } else if (isNetworkError(res.error)) {
          await enqueue({ ...op, attempts: op.attempts + 1, nextAt: nextAttemptAt(op.attempts + 1) })
        } else {
          await dequeue(op.kind, op.id)
          toast.error(dbErrorMessage(res.error, locale, L('Offline gespeicherte Stempelung konnte nicht übertragen werden', 'An offline clock action could not be saved')))
        }
      }
    } finally {
      flushing.current = false
    }
    return pendingClockOps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  const fetchActive = useCallback(async () => {
    if (!myId || !profile?.organization_id) {
      setLoading(false)
      return
    }
    if (!loadedOnce.current) setLoading(true)
    const pending = await flushPending()

    // Plans touching today's German day — includes a night shift from
    // yesterday that is still running (same window as the webapp).
    const today = berlinDateKey()
    const dayStart = berlinToInstant(today).toISOString()
    const dayEnd = berlinToInstant(addDays(today, 1)).toISOString()
    const [{ data: running }, { data: open }, { data: plans }] = await Promise.all([
      supabase
        .from('time_entries')
        .select('*')
        .eq('employee_id', myId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1),
      supabase
        .from('time_entries')
        .select(TIME_ENTRY_SELECT)
        .eq('employee_id', myId)
        .not('end_time', 'is', null)
        .is('submitted_at', null)
        .eq('is_planned', false)
        .order('end_time', { ascending: false })
        .limit(10),
      supabase
        .from('plans')
        .select('*, customer:customers(id, name)')
        .eq('employee_id', myId)
        .in('status', ['assigned', 'confirmed'])
        .lt('start_time', dayEnd)
        .gt('end_time', dayStart)
        .order('start_time', { ascending: true }),
    ])

    // Overlay actions still waiting for the network.
    let current = ((running ?? [])[0] ?? null) as ActiveEntry | null
    const pendingOut = pending.find((p) => p.kind === 'clock_out' && p.id === current?.id)
    if (pendingOut) current = null
    const pendingIn = pending.find((p) => p.kind === 'clock_in')
    if (!current && pendingIn && pendingIn.kind === 'clock_in' && !pending.some((p) => p.kind === 'clock_out' && p.id === pendingIn.id)) {
      current = { ...(pendingIn.payload as object), id: pendingIn.id, start_time: pendingIn.at, end_time: null } as unknown as ActiveEntry
    }
    if (!startingRef.current) setActiveEntry(current)
    setDrafts((open ?? []) as TimeEntry[])
    setTodayPlans((plans ?? []) as TodayPlan[])
    loadedOnce.current = true
    setLoading(false)
  }, [supabase, myId, profile?.organization_id, flushPending])

  useEffect(() => {
    if (!myId) { setLoading(false); return }
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
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [myId, fetchActive, supabase])

  // Retry queued offline actions when the app returns and every 30 s.
  useEffect(() => {
    if (!myId) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchActive()
    })
    const timer = setInterval(async () => {
      const left = await pendingClockOps()
      if (left.length) void fetchActive()
    }, 30_000)
    return () => {
      sub.remove()
      clearInterval(timer)
    }
  }, [myId, fetchActive])

  // Live ticker — only runs when an entry is open.
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (tickerRef.current) clearInterval(tickerRef.current)
    if (!activeEntry) {
      setElapsedSeconds(0)
      setBreakSeconds(0)
      return
    }
    const startDate = safeParseISO(activeEntry.start_time)
    if (!startDate) {
      setElapsedSeconds(0)
      setBreakSeconds(0)
      return
    }
    const startMs = startDate.getTime()
    const accumBreak = activeEntry.total_break_seconds ?? 0

    tickerRef.current = setInterval(() => {
      const now = Date.now()
      const total = Math.floor((now - startMs) / 1000)
      let currentBreak = 0
      if (activeEntry.is_on_break && activeEntry.current_break_start) {
        const breakStart = safeParseISO(activeEntry.current_break_start)
        if (breakStart) {
          currentBreak = Math.floor((now - breakStart.getTime()) / 1000)
        }
      }
      setElapsedSeconds(Math.max(0, total - (accumBreak + currentBreak)))
      setBreakSeconds(accumBreak + currentBreak)
    }, 1000)
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [activeEntry])

  /** True while "Schicht starten" is being saved (the card already shows the shift). */
  const [starting, setStarting] = useState(false)

  /**
   * Location is evidence, never a gate (QA P2-4/P2-8): it is attached after
   * the shift has started, so a slow GPS lock or a permission prompt never
   * delays "Schicht starten".
   */
  const attachLocation = useCallback(
    async (entryId: string) => {
      if (!myId) return
      const coords = await captureCoords()
      if (coords === 'denied') {
        toast.info(L('Standort nicht freigegeben – die Schicht läuft trotzdem.', 'Location not shared – the shift is running anyway.'))
        return
      }
      if (coords) {
        const at = new Date().toISOString()
        try {
          await supabase.from('time_entries').update({ latitude: coords.latitude, longitude: coords.longitude } as any).eq('id', entryId)
          // Live Operations pins the employee at profiles.last_lat/last_lng.
          await supabase
            .from('profiles')
            .update({ last_lat: coords.latitude, last_lng: coords.longitude, last_location_update: at } as any)
            .eq('id', myId)
        } catch (e) {
          console.warn('[useTimeTracking] location update failed (non-fatal):', e)
        }
      }
      // Background tracking if the user opted in (non-fatal when denied).
      try {
        await startTrackingIfEnabled(myId)
      } catch (e) {
        console.warn('[useTimeTracking] bg tracking start failed (non-fatal):', e)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, myId, locale],
  )

  const clockIn = useCallback(
    async (planId?: string, location?: string) => {
      if (!myId || !profile?.organization_id || starting) return null

      // Guard against double-clock-in: if the realtime channel hasn't
      // delivered the open entry yet, refuse rather than create a second row.
      if (activeEntry) return activeEntry

      const nowDate = new Date()
      const now = nowDate.toISOString()

      // The plan the user picked — otherwise the one closest to now.
      const plan =
        (planId ? todayPlans.find((p) => p.id === planId) : undefined) ??
        [...todayPlans].sort(
          (a, b) =>
            Math.abs(new Date(a.start_time).getTime() - nowDate.getTime()) -
            Math.abs(new Date(b.start_time).getTime() - nowDate.getTime()),
        )[0]

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        employee_id: myId,
        plan_id: plan?.id ?? null,
        customer_id: plan?.customer_id ?? null,
        start_location_id: plan?.start_location_id ?? null,
        destination_location_id: plan?.destination_location_id ?? null,
        is_gastfahrt: !!plan?.is_gastfahrt,
        overnight_stay: !!plan?.overnight_stay,
        hotel_address: plan?.hotel_address ?? null,
        location: location ?? plan?.location ?? null,
        start_time: now,
        date: localDateKey(nowDate),
        break_minutes: 0,
        is_on_break: false,
        total_break_seconds: 0,
        is_verified: false,
      }

      // The id is created on the device, so the shift shows as running at
      // once (QA P2-3) — the controls stay disabled until the row exists.
      const op = { kind: 'clock_in' as const, id: newEntryId(), at: now, payload, attempts: 0, nextAt: nextAttemptAt(0) }
      const local = {
        ...payload,
        id: op.id,
        start_time: now,
        end_time: null,
        current_break_start: null,
        latitude: null,
        longitude: null,
      } as unknown as ActiveEntry
      startingRef.current = true
      setStarting(true)
      setActiveEntry(local)

      try {
        // Stored on the device first with the tap time, then sent.
        await enqueue(op)
        const { data, error } = await sendClockIn(op)
        if (error) {
          if (isNetworkError(error)) {
            toast.success(L('Offline gestartet – wird übertragen, sobald wieder Netz da ist.', 'Started offline – will sync when you are back online.'))
            return local
          }
          await dequeue('clock_in', op.id)
          setActiveEntry(null)
          console.warn('[useTimeTracking] clockIn failed:', error.message)
          if (error.code === '23505') {
            toast.error(L('Es läuft bereits eine Schicht (z. B. auf einem anderen Gerät).', 'A shift is already running (e.g. on another device).'))
            void fetchActive()
            return null
          }
          toast.error(dbErrorMessage(error, locale, L('Schicht konnte nicht gestartet werden', 'Could not start shift')))
          return null
        }
        await dequeue('clock_in', op.id)
        setActiveEntry(data as ActiveEntry)
        void attachLocation(op.id)
        return data
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supabase, myId, profile?.organization_id, activeEntry, todayPlans, locale, fetchActive, starting, attachLocation],
  )

  const startBreak = useCallback(async () => {
    if (!activeEntry || activeEntry.is_on_break) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('time_entries')
      .update({ is_on_break: true, current_break_start: now } as any)
      .eq('id', activeEntry.id)
    if (error) {
      console.warn('[useTimeTracking] startBreak failed:', error.message)
      toast.error('Pause konnte nicht gestartet werden')
      return
    }
    setActiveEntry({ ...activeEntry, is_on_break: true, current_break_start: now })
  }, [supabase, activeEntry])

  const endBreak = useCallback(async () => {
    if (!activeEntry || !activeEntry.is_on_break || !activeEntry.current_break_start) return
    const breakStart = safeParseISO(activeEntry.current_break_start)
    if (!breakStart) return
    const now = new Date()
    const extraBreak = Math.floor((now.getTime() - breakStart.getTime()) / 1000)
    const newTotal = (activeEntry.total_break_seconds ?? 0) + extraBreak
    const { error } = await supabase
      .from('time_entries')
      .update({
        is_on_break: false,
        current_break_start: null,
        total_break_seconds: newTotal,
      } as any)
      .eq('id', activeEntry.id)
    if (error) {
      console.warn('[useTimeTracking] endBreak failed:', error.message)
      toast.error('Pause konnte nicht beendet werden')
      return
    }
    setActiveEntry({
      ...activeEntry,
      is_on_break: false,
      current_break_start: null,
      total_break_seconds: newTotal,
    })
  }, [supabase, activeEntry])

  /**
   * Stops the clock. The entry stays a draft so the closing view can
   * compare planned and recorded times before it is submitted.
   */
  const clockOut = useCallback(async (endAt: number = Date.now()): Promise<TimeEntry | null> => {
    if (!activeEntry || starting) return null
    const now = new Date(endAt)
    const totalBreak = breakTotalSeconds(activeEntry, endAt)

    // Stored on the device first so the tap time survives a dead network.
    const op = { kind: 'clock_out' as const, id: activeEntry.id, at: now.toISOString(), totalBreakSeconds: totalBreak, attempts: 0, nextAt: nextAttemptAt(0) }
    await enqueue(op)
    // A clock-in still waiting for the network must be sent first.
    const before = await flushPending(true)
    if (before.some((p) => p.kind === 'clock_in' && p.id === activeEntry.id)) {
      setActiveEntry(null)
      toast.success(L('Offline beendet – wird übertragen, sobald wieder Netz da ist.', 'Ended offline – will sync when you are back online.'))
      return null
    }
    const { data, error } = await sendClockOut(op, TIME_ENTRY_SELECT)
    if (error || !data) {
      if (error && isNetworkError(error)) {
        setActiveEntry(null)
        toast.success(L('Offline beendet – Endzeit gespeichert und wird übertragen, sobald wieder Netz da ist.', 'Ended offline – end time saved and will sync when you are back online.'))
        return null
      }
      await dequeue('clock_out', op.id)
      console.warn('[useTimeTracking] clockOut failed:', error?.message)
      toast.error(dbErrorMessage(error as any, locale, L('Schicht konnte nicht beendet werden', 'Could not end shift')))
      return null
    }
    await dequeue('clock_out', op.id)
    setActiveEntry(null)
    const ended = data as unknown as TimeEntry
    setDrafts((prev) => [ended, ...prev.filter((d) => d.id !== ended.id)])

    // Tear down the background-location task so the OS notification
    // disappears and we stop burning battery once the shift is over.
    try {
      await stopTracking()
    } catch (e) {
      console.warn('[useTimeTracking] bg tracking stop failed (non-fatal):', e)
    }
    return data as unknown as TimeEntry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, activeEntry, locale, flushPending, starting])

  /** Writes the reviewed values and submits the shift. */
  const submitEntry = useCallback(async (entryId: string, v: SubmitShiftValues): Promise<boolean> => {
    const shift = calculateShiftTimes(v.date, v.startTime, v.endTime, v.breakMinutes)
    const { error } = await supabase
      .from('time_entries')
      .update({
        date: v.date,
        start_time: shift.startISO,
        end_time: shift.endISO,
        break_minutes: Math.max(0, Math.round(v.breakMinutes || 0)),
        overnight_stay: v.overnightStay,
        meal_allowance: calculateSpesen(shift.netHours, v.overnightStay, spesenRates),
        notes: v.notes?.trim() ? v.notes.trim() : null,
        submitted_at: new Date().toISOString(),
      } as any)
      .eq('id', entryId)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Schicht konnte nicht abgesendet werden', 'Could not submit shift')))
      return false
    }
    setDrafts((prev) => prev.filter((d) => d.id !== entryId))
    toast.success(L('Schicht abgesendet', 'Shift submitted'))
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, spesenRates, locale])

  return {
    activeEntry,
    drafts,
    submitEntry,
    todayPlans,
    loading,
    elapsedSeconds,
    breakSeconds,
    clockIn,
    startBreak,
    endBreak,
    clockOut,
    refresh: fetchActive,
    starting,
    breakTotalSeconds,
  }
}

/** Break seconds of a running entry up to `at` (incl. a break still running). */
export function breakTotalSeconds(
  entry: { total_break_seconds?: number | null; is_on_break?: boolean | null; current_break_start?: string | null },
  at: number = Date.now(),
): number {
  let total = entry.total_break_seconds ?? 0
  if (entry.is_on_break && entry.current_break_start) {
    const breakStart = safeParseISO(entry.current_break_start)
    if (breakStart) total += Math.max(0, Math.floor((at - breakStart.getTime()) / 1000))
  }
  return total
}
