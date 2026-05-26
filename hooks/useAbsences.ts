/**
 * Absences (Anträge) hook — wraps the calendar_events table for
 * vacation ("holiday") and sick-leave entries.
 *
 * Per the May 2026 audit, the web app has no dedicated
 * absence_requests table; absences are calendar events filtered by
 * event_type. We honor that schema so anything the mobile creates is
 * directly readable by the web's /dashboard/calendar.
 *
 * Scope rules:
 *   - employee: sees own entries (creator_id = me).
 *   - admin/dispatcher: sees every entry in the org.
 *
 * "Approval" is implicit (the event exists = recorded). An admin can
 * delete to retract; an employee can delete their own. There is no
 * pending/approved/rejected status column, matching the web. When a
 * fully-typed absence_requests table ships on the web side, the mobile
 * can extend this hook to honor it.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { EVENT_COLORS } from '@/lib/types'
import type { CalendarEvent } from '@/lib/types'

export type AbsenceKind = 'holiday' | 'sick_leave'

export interface AbsenceInput {
  kind: AbsenceKind
  title: string
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD (inclusive)
  notes?: string | null
  /** Minutes before start_time to fire a reminder. NULL = no reminder. */
  reminder_minutes_before?: number | null
}

function isoStart(date: string): string {
  return new Date(`${date}T00:00:00`).toISOString()
}

function isoEnd(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString()
}

export function useAbsences() {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  const isManagerial = isAdmin || isDispatcher
  const myId = session?.user?.id

  const fetchAbsences = useCallback(
    async (silent = false) => {
      if (!profile?.organization_id || !myId) return
      if (!silent) setLoading(true)
      let query = supabase
        .from('calendar_events')
        .select('*, creator:profiles!creator_id(id, full_name, avatar_url)')
        .eq('organization_id', profile.organization_id)
        .in('event_type', ['holiday', 'sick_leave'])
        .order('start_time', { ascending: false })
        .limit(200)
      if (!isManagerial) query = query.eq('creator_id', myId)

      const { data, error } = await query
      if (error) {
        console.warn('[useAbsences] fetch failed', error.message)
      } else {
        setEvents((data ?? []) as CalendarEvent[])
      }
      setLoading(false)
    },
    [supabase, profile?.organization_id, myId, isManagerial],
  )

  useEffect(() => {
    fetchAbsences()
    if (!profile?.organization_id) return
    const channel = supabase
      .channel(uniqueChannelName(`absences-${profile.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => fetchAbsences(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, profile?.organization_id, fetchAbsences])

  const submit = async (input: AbsenceInput): Promise<CalendarEvent> => {
    if (!profile?.organization_id || !myId) {
      throw new Error('Not authenticated')
    }
    const payload = {
      organization_id: profile.organization_id,
      creator_id: myId,
      title: input.title,
      description: input.notes ?? null,
      event_type: input.kind,
      start_time: isoStart(input.start_date),
      end_time: isoEnd(input.end_date),
      is_all_day: true,
      color: input.kind === 'holiday' ? EVENT_COLORS.holiday : EVENT_COLORS.sick_leave,
      location: null,
      reminder_minutes_before: input.reminder_minutes_before ?? null,
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .insert(payload as any)
      .select('*, creator:profiles!creator_id(id, full_name, avatar_url)')
      .single()
    if (error) throw error
    setEvents((prev) => [data as CalendarEvent, ...prev])

    // Best-effort: notify every admin / dispatcher in the org.
    try {
      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .in('role', ['admin', 'dispatcher', 'administrator', 'disponent'])
      const submitterName = profile.full_name ?? profile.email ?? '—'
      const titleDe = input.kind === 'holiday' ? '🏖️ Neuer Urlaubsantrag' : '🤒 Krankmeldung'
      const bodyDe =
        input.kind === 'holiday'
          ? `${submitterName} hat Urlaub für ${input.start_date} bis ${input.end_date} beantragt.`
          : `${submitterName} hat sich krank gemeldet (${input.start_date} bis ${input.end_date}).`
      await Promise.all(
        (managers ?? []).map((m: any) =>
          supabase
            .from('notifications')
            .insert({
              user_id: m.id,
              title: titleDe,
              body: bodyDe,
              type: 'absence',
              is_read: false,
            } as any),
        ),
      )
    } catch (e) {
      console.warn('[useAbsences] manager notification failed (non-fatal):', e)
    }

    return data as CalendarEvent
  }

  const withdraw = async (id: string): Promise<void> => {
    const previous = events
    setEvents((prev) => prev.filter((e) => e.id !== id))
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) {
      setEvents(previous)
      throw error
    }
  }

  return { events, loading, fetchAbsences, submit, withdraw, isManagerial }
}
