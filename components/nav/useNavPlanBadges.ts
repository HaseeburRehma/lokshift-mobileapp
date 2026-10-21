/**
 * The webapp sidebar's plan / time badges that useDrawerBadges does not
 * provide (web hooks/useSidebarBadges):
 *
 *   plans        managers  → upcoming shifts that need action
 *                             (unassigned or rejected)
 *                employees → own shifts still to confirm (status assigned)
 *   unsubmitted  employees → finished own entries not yet submitted
 *
 * Head-only count queries + one realtime channel, debounced.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'

export interface NavPlanBadges {
  plans: number
  unsubmitted: number
}

const EMPTY: NavPlanBadges = { plans: 0, unsubmitted: 0 }

export function useNavPlanBadges(): NavPlanBadges {
  const { session, profile, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const managerial = isAdmin || isDispatcher
  const [badges, setBadges] = useState<NavPlanBadges>(EMPTY)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchCounts = useCallback(async () => {
    if (!orgId || !myId) {
      setBadges(EMPTY)
      return
    }
    const supabase = getSupabase()
    const nowIso = new Date().toISOString()
    try {
      if (managerial) {
        const { count } = await supabase
          .from('plans')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .neq('status', 'cancelled')
          .gte('start_time', nowIso)
          .or('status.eq.rejected,employee_id.is.null')
        setBadges({ plans: count ?? 0, unsubmitted: 0 })
      } else {
        const [{ count: toConfirm }, { count: unsubmitted }] = await Promise.all([
          supabase
            .from('plans')
            .select('id', { count: 'exact', head: true })
            .eq('employee_id', myId)
            .eq('status', 'assigned')
            .gte('end_time', nowIso),
          supabase
            .from('time_entries')
            .select('id', { count: 'exact', head: true })
            .eq('employee_id', myId)
            .eq('is_planned', false)
            .not('end_time', 'is', null)
            .is('submitted_at', null),
        ])
        setBadges({ plans: toConfirm ?? 0, unsubmitted: unsubmitted ?? 0 })
      }
    } catch (e) {
      // Non-critical UI counts — keep the last known values.
      console.warn('[useNavPlanBadges] fetch failed', e)
    }
  }, [orgId, myId, managerial])

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fetchCounts, 400)
  }, [fetchCounts])

  useEffect(() => {
    fetchCounts()
    if (!orgId || !myId) return
    const supabase = getSupabase()
    let channel = supabase.channel(uniqueChannelName(`nav-plan-badges-${myId}`))
    channel = managerial
      ? channel.on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `organization_id=eq.${orgId}` }, schedule)
      : channel
          .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `employee_id=eq.${myId}` }, schedule)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `employee_id=eq.${myId}` }, schedule)
    channel.subscribe()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') schedule()
    })
    return () => {
      sub.remove()
      if (timer.current) clearTimeout(timer.current)
      try {
        supabase.removeChannel(channel)
      } catch {}
    }
  }, [fetchCounts, schedule, orgId, myId, managerial])

  return badges
}
