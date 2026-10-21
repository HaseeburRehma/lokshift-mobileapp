/**
 * Plans data hook — mirrors the webapp's usePlans, scaled down to the
 * actions the mobile app actually needs (list + status update).
 *
 * Employees can only confirm/reject their own plans. Status changes
 * write a notifications row so the other side gets pinged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { readCache, writeCache } from '@/lib/cache'
import { localDateKey } from '@/lib/time/shift-hours'
import type { Plan, PlanStatus } from '@/lib/types'
import { notifyManagers, sendNotification } from '@/lib/notifications/service'
import { describePlan } from '@/lib/plans/notify'

export function usePlans() {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  const myId = session?.user?.id
  const isManagerial = isAdmin || isDispatcher
  const cacheKey =
    profile?.organization_id && myId
      ? `plans:${profile.organization_id}:${isManagerial ? 'all' : myId}`
      : null

  const fetchPlans = useCallback(async () => {
    if (!profile?.organization_id || !myId) { setLoading(false); return }
    setLoading(true)
    let query = supabase
      .from('plans')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
      .eq('organization_id', profile.organization_id)
      // Recent past + everything upcoming, so a busy org still sees what's next.
      .gte('end_time', new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order('start_time', { ascending: true })
      .limit(500)

    if (!isManagerial) query = query.eq('employee_id', myId)

    const { data, error } = await query
    if (error) {
      // Network failure: keep whatever's already in state (cache hydrate
      // already populated it on mount). Don't blow it away.
      console.warn('[usePlans] fetch failed', error.message)
    } else {
      const rows = (data ?? []) as Plan[]
      setPlans(rows)
      if (cacheKey) writeCache(cacheKey, rows)
    }
    setLoading(false)
  }, [supabase, profile?.organization_id, myId, isManagerial, cacheKey])

  // Hydrate from cache on mount so the list renders instantly even when
  // the device is offline. The real fetch fires right after.
  useEffect(() => {
    if (!cacheKey) return
    readCache<Plan[]>(cacheKey).then((cached) => {
      if (cached && cached.length) setPlans(cached)
    })
  }, [cacheKey])

  useEffect(() => { fetchPlans() }, [fetchPlans])

  const grouped = useMemo(() => {
    const map = new Map<string, Plan[]>()
    for (const p of plans) {
      const key = localDateKey(new Date(p.start_time))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, items]) => ({ date, items }))
  }, [plans])

  const updateStatus = async (plan: Plan, newStatus: PlanStatus, reason?: string) => {
    // optimistic
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: newStatus } : p)))

    const { error } = await supabase
      .from('plans')
      .update({
        status: newStatus,
        rejection_reason: newStatus === 'rejected' ? reason?.trim() || null : null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', plan.id)

    if (error) {
      // rollback
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)))
      throw error
    }

    // Best-effort notification to the dispatcher/admins about the
    // confirm/reject. We don't await individual sends; failure here
    // doesn't roll back the status change.
    if (newStatus === 'confirmed' || newStatus === 'rejected') {
      try {
        const employeeName = plan.employee?.full_name ?? profile?.full_name ?? 'Mitarbeiter'
        // The dispatcher who created the shift is told; without a creator
        // all admins + dispatchers are.
        const payload = {
          title: newStatus === 'confirmed' ? 'Schicht bestätigt' : 'Schicht abgelehnt',
          message: `${employeeName} hat die Schicht ${describePlan(plan)} ${newStatus === 'confirmed' ? 'bestätigt' : `abgelehnt${reason ? ` – Grund: ${reason}` : ''}`}.`,
          module: 'plans' as const,
          moduleId: plan.id,
          skipEmail: newStatus === 'confirmed',
        }
        if (plan.creator_id && plan.creator_id !== myId) await sendNotification({ userId: plan.creator_id, ...payload })
        else await notifyManagers(payload)
      } catch (e) {
        console.warn('[usePlans] notification insert failed (non-fatal):', e)
      }
    }
  }

  return { plans, grouped, loading, fetchPlans, updateStatus }
}
