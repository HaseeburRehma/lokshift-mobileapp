/**
 * Generic calendar-events hook. Lists, creates, updates, and deletes
 * rows on the shared `calendar_events` table — same table the absences
 * flow writes to, but here we expose the full set of event_types
 * (event, meeting, birthday, holiday, sick_leave, shift, other) plus
 * the member-attendee join.
 *
 * Scope rules mirror the web:
 *   - employee: events they created OR were added to as a member
 *   - admin / dispatcher: every event in the org
 *
 * Realtime subscription on `calendar_events` keeps multi-device + web
 * edits in sync.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { EVENT_COLORS, type CalendarEvent, type CalendarEventType } from '@/lib/types'

export interface CalendarEventInput {
  title: string
  description?: string | null
  event_type: CalendarEventType
  start_iso: string
  end_iso: string
  is_all_day: boolean
  color?: string | null
  location?: string | null
  reminder_minutes_before?: number | null
  member_ids?: string[]
}

function defaultColor(t: CalendarEventType): string {
  return EVENT_COLORS[t] ?? EVENT_COLORS.event
}

export function useCalendarEvents(filterFromIso?: string, filterToIso?: string) {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const isManagerial = isAdmin || isDispatcher
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(
    async (silent = false) => {
      if (!orgId || !myId) return
      if (!silent) setLoading(true)
      let query = supabase
        .from('calendar_events')
        .select(
          `*,
          creator:profiles!creator_id(id, full_name, avatar_url),
          members:calendar_event_members(user:profiles(id, full_name, avatar_url))`,
        )
        .eq('organization_id', orgId)
        .order('start_time', { ascending: true })
        .limit(500)

      if (filterFromIso) query = query.gte('start_time', filterFromIso)
      if (filterToIso) query = query.lte('start_time', filterToIso)

      const { data, error } = await query
      if (error) {
        console.warn('[useCalendarEvents] fetch failed', error.message)
        setLoading(false)
        return
      }

      let rows = (data ?? []) as CalendarEvent[]
      if (!isManagerial) {
        // Visible to a regular employee = created by me OR I'm in members.
        rows = rows.filter((e) => {
          if (e.creator_id === myId) return true
          return (e.members ?? []).some((m: any) => m.user?.id === myId)
        })
      }
      setEvents(rows)
      setLoading(false)
    },
    [supabase, orgId, myId, isManagerial, filterFromIso, filterToIso],
  )

  useEffect(() => {
    if (!orgId) return
    fetchEvents()
    const channel = supabase
      .channel(uniqueChannelName(`calendar-events:${orgId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calendar_events',
          filter: `organization_id=eq.${orgId}`,
        },
        () => fetchEvents(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'calendar_event_members' },
        () => fetchEvents(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, fetchEvents])

  const createEvent = useCallback(
    async (input: CalendarEventInput): Promise<CalendarEvent> => {
      if (!orgId || !myId) throw new Error('Not authenticated')
      const color = input.color ?? defaultColor(input.event_type)
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({
          organization_id: orgId,
          creator_id: myId,
          title: input.title,
          description: input.description ?? null,
          event_type: input.event_type,
          start_time: input.start_iso,
          end_time: input.end_iso,
          is_all_day: input.is_all_day,
          color,
          location: input.location ?? null,
          reminder_minutes_before: input.reminder_minutes_before ?? null,
        } as any)
        .select('*, creator:profiles!creator_id(id, full_name, avatar_url)')
        .single()
      if (error || !data) throw error ?? new Error('Failed to create event')

      const eventId = (data as any).id as string

      // Fan-out membership rows so attendees see the event in their feed.
      const memberIds = (input.member_ids ?? []).filter((x) => x && x !== myId)
      if (memberIds.length > 0) {
        const rows = memberIds.map((uid) => ({ event_id: eventId, user_id: uid }))
        const { error: memErr } = await supabase
          .from('calendar_event_members')
          .insert(rows as any)
        if (memErr) {
          console.warn(
            '[useCalendarEvents] member fanout failed (non-fatal):',
            memErr.message,
          )
        }

        // Best-effort notification to each member.
        try {
          const creatorName = profile?.full_name ?? profile?.email ?? 'Lokshift'
          await Promise.all(
            memberIds.map((uid) =>
              supabase
                .from('notifications')
                .insert({
                  user_id: uid,
                  title: `📅 ${input.title}`,
                  body: `${creatorName} hat Sie zu einem Termin hinzugefügt.`,
                  type: 'calendar',
                  is_read: false,
                } as any),
            ),
          )
        } catch {}
      }

      return data as CalendarEvent
    },
    [supabase, orgId, myId, profile?.full_name, profile?.email],
  )

  const updateEvent = useCallback(
    async (id: string, patch: Partial<CalendarEventInput>): Promise<void> => {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }
      if (patch.title !== undefined) payload.title = patch.title
      if (patch.description !== undefined) payload.description = patch.description
      if (patch.event_type !== undefined) payload.event_type = patch.event_type
      if (patch.start_iso !== undefined) payload.start_time = patch.start_iso
      if (patch.end_iso !== undefined) payload.end_time = patch.end_iso
      if (patch.is_all_day !== undefined) payload.is_all_day = patch.is_all_day
      if (patch.color !== undefined) payload.color = patch.color
      if (patch.location !== undefined) payload.location = patch.location
      if (patch.reminder_minutes_before !== undefined)
        payload.reminder_minutes_before = patch.reminder_minutes_before

      const { error } = await supabase
        .from('calendar_events')
        .update(payload as any)
        .eq('id', id)
      if (error) throw error

      // Replace member set if provided.
      if (patch.member_ids) {
        const { error: delErr } = await supabase
          .from('calendar_event_members')
          .delete()
          .eq('event_id', id)
        if (delErr) throw delErr
        const newMembers = patch.member_ids.filter((x) => x && x !== myId)
        if (newMembers.length > 0) {
          const rows = newMembers.map((uid) => ({ event_id: id, user_id: uid }))
          const { error: insErr } = await supabase
            .from('calendar_event_members')
            .insert(rows as any)
          if (insErr) throw insErr
        }
      }
    },
    [supabase, myId],
  )

  const deleteEvent = useCallback(
    async (id: string): Promise<void> => {
      const previous = events
      setEvents((prev) => prev.filter((e) => e.id !== id))
      const { error } = await supabase.from('calendar_events').delete().eq('id', id)
      if (error) {
        setEvents(previous)
        throw error
      }
    },
    [supabase, events],
  )

  return {
    events,
    loading,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  }
}
