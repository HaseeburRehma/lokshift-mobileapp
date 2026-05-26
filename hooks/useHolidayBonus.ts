/**
 * Holiday-bonus data hook. Managerial users can grant bonuses to any
 * employee in the org; employees see read-only feed of their own.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import type { HolidayBonus } from '@/lib/types'

export function useHolidayBonus() {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const [items, setItems] = useState<HolidayBonus[]>([])
  const [loading, setLoading] = useState(true)

  const isManagerial = isAdmin || isDispatcher
  const myId = session?.user?.id

  const fetchItems = useCallback(async () => {
    if (!profile?.organization_id || !myId) return
    setLoading(true)
    let query = supabase
      .from('holiday_bonuses')
      .select('*, employee:profiles!employee_id(id, full_name)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (!isManagerial) query = query.eq('employee_id', myId)
    const { data, error } = await query
    if (error) console.warn('[useHolidayBonus] fetch failed:', error.message)
    setItems((data ?? []) as HolidayBonus[])
    setLoading(false)
  }, [supabase, profile?.organization_id, myId, isManagerial])

  useEffect(() => { fetchItems() }, [fetchItems])

  const ytdTotal = useMemo(() => {
    const year = new Date().getFullYear()
    return items
      .filter((b) => new Date(b.created_at).getFullYear() === year)
      .reduce((s, b) => s + (Number(b.amount) || 0), 0)
  }, [items])

  const grantBonus = async (payload: Partial<HolidayBonus>) => {
    if (!profile?.organization_id) throw new Error('No session')
    const body = {
      organization_id: profile.organization_id,
      bonus_type: 'holiday_pay',
      ...payload,
    }
    const { data, error } = await supabase
      .from('holiday_bonuses')
      .insert(body as any)
      .select('*, employee:profiles!employee_id(id, full_name)')
      .single()
    if (error) throw error
    setItems((prev) => [data as HolidayBonus, ...prev])

    // Notify the recipient.
    try {
      if ((data as HolidayBonus).employee_id) {
        await supabase.from('notifications').insert({
          user_id: (data as HolidayBonus).employee_id,
          title: '🎁 Bonus erhalten',
          body: `€${Number((data as HolidayBonus).amount).toFixed(2)}`,
          type: 'holiday_bonus',
          is_read: false,
        } as any)
      }
    } catch (e) { console.warn('[useHolidayBonus] notify failed:', e) }

    return data as HolidayBonus
  }

  return { items, loading, fetchItems, grantBonus, ytdTotal }
}
