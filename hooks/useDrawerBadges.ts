/**
 * useDrawerBadges — role-aware count badges for the sidebar drawer.
 *
 * Returns real-time counts for:
 *   live      (managerial): active shifts, i.e. time_entries with end_time IS NULL
 *   times     (managerial): unverified completed time_entries
 *   perDiem   (managerial): submitted per_diems awaiting approval
 *   requests  (managerial): pending absence requests org-wide
 *                (employee): own pending absence requests
 *   chat      (everyone): unread messages across my conversations
 *   events    (everyone): calendar_events for today
 *
 * All counts use `count: 'exact', head: true` so we never fetch rows.
 * Every relevant table gets a realtime subscription so the badges
 * update the instant a mutation lands.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'

export interface DrawerBadges {
  live: number
  times: number
  perDiem: number
  requests: number
  chat: number
  events: number
  pendingUsers: number
}

const EMPTY: DrawerBadges = {
  live: 0, times: 0, perDiem: 0, requests: 0, chat: 0, events: 0, pendingUsers: 0,
}

export function useDrawerBadges(): DrawerBadges {
  const supabase = getSupabase()
  const { session, profile, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const isManagerial = isAdmin || isDispatcher

  const [badges, setBadges] = useState<DrawerBadges>(EMPTY)
  // Debounce rapid realtime bursts (typing → many message inserts).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchAll = useCallback(async () => {
    if (!orgId || !myId) {
      setBadges(EMPTY)
      return
    }
    const out: DrawerBadges = { ...EMPTY }
    try {
      // Live shifts (managerial only)
      if (isManagerial) {
        const { count } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .is('end_time', null)
        out.live = count ?? 0

        // Unverified completed shifts
        const { count: timesCount } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_verified', false)
          .not('end_time', 'is', null)
        out.times = timesCount ?? 0

        // Submitted per-diems
        const { count: pdCount } = await supabase
          .from('per_diems')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'submitted')
        out.perDiem = pdCount ?? 0

        // Pending absence requests org-wide
        const { count: reqCount } = await supabase
          .from('absences')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('request_status', 'pending')
        out.requests = reqCount ?? 0

        // Un-orged profiles — new mobile signups whose organization_id
        // was never set. Admin sees these in Members > Pending. If RLS
        // blocks the read, this stays 0 which is fine.
        const { count: pendingCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .is('organization_id', null)
        out.pendingUsers = pendingCount ?? 0
      } else {
        // Employee: only own pending requests
        const { count: reqCount } = await supabase
          .from('absences')
          .select('id', { count: 'exact', head: true })
          .eq('employee_id', myId)
          .eq('request_status', 'pending')
        out.requests = reqCount ?? 0
      }

      // Calendar events today — everyone sees org events for today
      const today = format(new Date(), 'yyyy-MM-dd')
      const { count: eventsCount } = await supabase
        .from('calendar_events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('date', today)
      out.events = eventsCount ?? 0

      // Chat unread — count messages in my conversations after my last_read_at.
      // N+1 by design (small N, drawer badge only refreshes on mutations).
      const { data: myMembers } = await supabase
        .from('chat_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', myId)
      if (myMembers && myMembers.length > 0) {
        let unread = 0
        for (const m of myMembers) {
          const since = m.last_read_at ?? '1970-01-01T00:00:00Z'
          const { count } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', m.conversation_id)
            .neq('sender_id', myId)
            .gt('created_at', since)
          unread += count ?? 0
        }
        out.chat = unread
      }

      setBadges(out)
    } catch (e) {
      // Silent — counts are non-critical UI. Log once and keep last known state.
      console.warn('[useDrawerBadges] fetch failed', e)
    }
  }, [supabase, orgId, myId, isManagerial])

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchAll, 400)
  }, [fetchAll])

  // Initial fetch
  useEffect(() => {
    fetchAll()
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [fetchAll])

  // Realtime subscriptions
  useEffect(() => {
    if (!orgId || !myId) return
    const channels = [
      supabase
        .channel(uniqueChannelName(`drawer-time-entries-${orgId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'time_entries',
          filter: `organization_id=eq.${orgId}`,
        }, scheduleFetch)
        .subscribe(),
      supabase
        .channel(uniqueChannelName(`drawer-per-diems-${orgId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'per_diems',
          filter: `organization_id=eq.${orgId}`,
        }, scheduleFetch)
        .subscribe(),
      supabase
        .channel(uniqueChannelName(`drawer-absences-${orgId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'absences',
          filter: `organization_id=eq.${orgId}`,
        }, scheduleFetch)
        .subscribe(),
      supabase
        .channel(uniqueChannelName(`drawer-events-${orgId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'calendar_events',
          filter: `organization_id=eq.${orgId}`,
        }, scheduleFetch)
        .subscribe(),
      supabase
        .channel(uniqueChannelName(`drawer-chat-msgs-${myId}`))
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages',
        }, scheduleFetch)
        .subscribe(),
      supabase
        .channel(uniqueChannelName(`drawer-chat-members-${myId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'chat_members',
          filter: `user_id=eq.${myId}`,
        }, scheduleFetch)
        .subscribe(),
      // New/un-orged profiles — INSERT (new signup) or UPDATE (org_id
      // gets assigned). Managerial only would be ideal but the client
      // can't reliably filter on organization_id IS NULL via realtime,
      // so we listen broadly and let the count query re-filter.
      supabase
        .channel(uniqueChannelName(`drawer-profiles-${orgId}`))
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'profiles',
        }, scheduleFetch)
        .subscribe(),
    ]
    return () => {
      channels.forEach((c) => {
        try { supabase.removeChannel(c) } catch {}
      })
    }
  }, [supabase, orgId, myId, scheduleFetch])

  return badges
}
