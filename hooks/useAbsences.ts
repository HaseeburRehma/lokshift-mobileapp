
/**
 * Absences (Anträge) hook — wraps the calendar_events table for
 * vacation (Urlaubsantrag) and sick-leave (Krankmeldung) entries with
 * a real approval workflow.
 *
 *   Employee:   submit() → status = 'pending' (vacation) / 'approved' (sick)
 *               withdraw own pending requests anytime.
 *   Admin/Disp: approve() / reject(reason) on pending vacations
 *               (sick leaves are auto-approved on submit; admin may
 *               still acknowledge with a note).
 *               see every entry in the org.
 *
 * Schema: requires the columns added by
 *   supabase/migrations/20260607120000_absence_approval_workflow.sql
 * (request_status, decided_by, decided_at, decision_reason).
 *
 * Notifications:
 *   - Submit → notifies every admin/dispatcher in the org.
 *   - Decide → notifies the original requester.
 *
 * Realtime: any insert/update/delete on calendar_events for the org
 * triggers a silent refetch so two admins watching the queue see each
 * other's decisions immediately.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { EVENT_COLORS } from '@/lib/types'
import type { CalendarEvent, AbsenceRequestStatus } from '@/lib/types'

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

/** Older rows might have `request_status = null`; treat as approved. */
export function effectiveStatus(e: CalendarEvent): AbsenceRequestStatus {
  return (e.request_status ?? 'approved') as AbsenceRequestStatus
}

/** Format a YYYY-MM-DD into the German DD.MM.YYYY used by notifications. */
function fmtDe(date: string): string {
  const [y, m, d] = date.split('-')
  if (!y || !m || !d) return date
  return `${d}.${m}.${y}`
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
      if (!profile?.organization_id || !myId) {
        setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      let query = supabase
        .from('calendar_events')
        .select(
          '*, creator:profiles!creator_id(id, full_name, avatar_url), decided_by_profile:profiles!decided_by(id, full_name)',
        )
        .eq('organization_id', profile.organization_id)
        .in('event_type', ['holiday', 'sick_leave'])
        .order('created_at', { ascending: false })
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
      try {
        supabase.removeChannel(channel)
      } catch {
        // best-effort
      }
    }
  }, [supabase, profile?.organization_id, fetchAbsences])

  /** Pending vacations only — used by the admin queue badge. */
  const pendingCount = useMemo(
    () =>
      events.filter(
        (e) => e.event_type === 'holiday' && effectiveStatus(e) === 'pending',
      ).length,
    [events],
  )

  // ─── Mutations ─────────────────────────────────────────────────────────

  /**
   * Notify every admin/dispatcher in the org about a new submission.
   * Best-effort — failure here doesn't roll back the submit.
   */
  const notifyManagers = async (kind: AbsenceKind, input: AbsenceInput) => {
    if (!profile?.organization_id) return
    try {
      const { data: managers } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .in('role', ['admin', 'dispatcher', 'administrator', 'disponent'])

      const submitterName = profile.full_name ?? profile.email ?? '—'
      const titleDe =
        kind === 'holiday' ? '🏖️ Neuer Urlaubsantrag' : '🤒 Krankmeldung'
      const bodyDe =
        kind === 'holiday'
          ? `${submitterName} hat Urlaub für ${fmtDe(input.start_date)} bis ${fmtDe(input.end_date)} beantragt. Bitte genehmigen.`
          : `${submitterName} hat sich krank gemeldet (${fmtDe(input.start_date)} bis ${fmtDe(input.end_date)}).`

      await Promise.all(
        (managers ?? []).map((m: any) =>
          supabase.from('notifications').insert({
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
  }

  /**
   * Notify the original requester about an approval / rejection.
   */
  const notifyRequester = async (
    event: CalendarEvent,
    decision: 'approved' | 'rejected',
    reason: string | null,
  ) => {
    if (!event.creator_id) return
    try {
      const isHoliday = event.event_type === 'holiday'
      const period = `${fmtDe((event.start_time || '').slice(0, 10))} – ${fmtDe(
        (event.end_time || '').slice(0, 10),
      )}`
      const approved = decision === 'approved'
      const titleDe = approved
        ? isHoliday
          ? '✅ Urlaub genehmigt'
          : '✅ Krankmeldung bestätigt'
        : isHoliday
          ? '❌ Urlaub abgelehnt'
          : '❌ Krankmeldung abgelehnt'
      const bodyDe = approved
        ? `Ihr Antrag (${period}) wurde genehmigt.${reason ? `\nHinweis: ${reason}` : ''}`
        : `Ihr Antrag (${period}) wurde abgelehnt.${reason ? `\nBegründung: ${reason}` : ''}`

      await supabase.from('notifications').insert({
        user_id: event.creator_id,
        title: titleDe,
        body: bodyDe,
        type: 'absence',
        is_read: false,
      } as any)
    } catch (e) {
      console.warn('[useAbsences] requester notification failed (non-fatal):', e)
    }
  }

  /**
   * Employee submits a vacation request or sick-leave notice.
   * Status defaults via the DB trigger:
   *   holiday    → 'pending'
   *   sick_leave → 'approved' (informational, auto-acknowledged)
   */
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
      color:
        input.kind === 'holiday' ? EVENT_COLORS.holiday : EVENT_COLORS.sick_leave,
      location: null,
      reminder_minutes_before: input.reminder_minutes_before ?? null,
      // request_status defaults via DB trigger; explicit for clarity.
      request_status: input.kind === 'holiday' ? 'pending' : 'approved',
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .insert(payload as any)
      .select(
        '*, creator:profiles!creator_id(id, full_name, avatar_url), decided_by_profile:profiles!decided_by(id, full_name)',
      )
      .single()
    if (error) throw error
    setEvents((prev) => [data as CalendarEvent, ...prev])
    void notifyManagers(input.kind, input)
    return data as CalendarEvent
  }

  /** Employee retracts their own request; admin can also delete. */
  const withdraw = async (id: string): Promise<void> => {
    const previous = events
    setEvents((prev) => prev.filter((e) => e.id !== id))
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) {
      setEvents(previous)
      throw error
    }
  }

  /**
   * Admin/dispatcher approves a pending request.
   * Optional `reason` becomes the decision note (rarely used on approve;
   * common pattern is "approved with restrictions").
   */
  const approve = async (id: string, reason?: string | null): Promise<void> => {
    if (!isManagerial || !myId) throw new Error('Not permitted')
    const current = events.find((e) => e.id === id)
    if (!current) throw new Error('Request not found')
    const patch = {
      request_status: 'approved' as AbsenceRequestStatus,
      decided_by: myId,
      decided_at: new Date().toISOString(),
      decision_reason: reason ?? null,
    }
    // Optimistic
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? ({ ...e, ...patch } as CalendarEvent) : e)),
    )
    const { error } = await supabase
      .from('calendar_events')
      .update(patch as any)
      .eq('id', id)
    if (error) {
      // Rollback
      setEvents((prev) => prev.map((e) => (e.id === id ? current : e)))
      throw error
    }
    void notifyRequester(current, 'approved', reason ?? null)
  }

  /**
   * Admin/dispatcher rejects a pending request. A reason is strongly
   * encouraged (the UI will require it) — gets surfaced to the
   * employee in the rejection notification.
   */
  const reject = async (id: string, reason: string): Promise<void> => {
    if (!isManagerial || !myId) throw new Error('Not permitted')
    const trimmed = (reason ?? '').trim()
    if (!trimmed) throw new Error('Reason is required to reject')
    const current = events.find((e) => e.id === id)
    if (!current) throw new Error('Request not found')
    const patch = {
      request_status: 'rejected' as AbsenceRequestStatus,
      decided_by: myId,
      decided_at: new Date().toISOString(),
      decision_reason: trimmed,
    }
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? ({ ...e, ...patch } as CalendarEvent) : e)),
    )
    const { error } = await supabase
      .from('calendar_events')
      .update(patch as any)
      .eq('id', id)
    if (error) {
      setEvents((prev) => prev.map((e) => (e.id === id ? current : e)))
      throw error
    }
    void notifyRequester(current, 'rejected', trimmed)
  }

  return {
    events,
    loading,
    isManagerial,
    pendingCount,
    fetchAbsences,
    submit,
    withdraw,
    approve,
    reject,
  }
}
