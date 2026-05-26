/**
 * Per-diem (Verpflegungsmehraufwand) data hook.
 *
 * Employees see + submit their own claims; admin/dispatcher see every
 * claim in the organisation and can approve/reject. Status transitions
 * write a notifications row so the submitter gets pinged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import type { PerDiem, PerDiemStatus } from '@/lib/types'

export function usePerDiem(filter: 'all' | PerDiemStatus = 'all') {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const [items, setItems] = useState<PerDiem[]>([])
  const [loading, setLoading] = useState(true)

  const isManagerial = isAdmin || isDispatcher
  const myId = session?.user?.id

  const fetchItems = useCallback(async () => {
    if (!profile?.organization_id || !myId) return
    setLoading(true)
    let query = supabase
      .from('per_diems')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!isManagerial) query = query.eq('employee_id', myId)
    if (filter !== 'all') query = query.eq('status', filter)

    const { data, error } = await query
    if (error) console.warn('[usePerDiem] fetch failed:', error.message)
    setItems((data ?? []) as PerDiem[])
    setLoading(false)
  }, [supabase, profile?.organization_id, myId, isManagerial, filter])

  useEffect(() => { fetchItems() }, [fetchItems])

  const ytdTotal = useMemo(() => {
    const year = new Date().getFullYear()
    return items
      .filter((p) => new Date(p.created_at).getFullYear() === year && p.status === 'approved')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  }, [items])

  const submit = async (payload: Partial<PerDiem>) => {
    if (!profile?.organization_id || !myId) throw new Error('No session')
    const body = {
      organization_id: profile.organization_id,
      employee_id: myId,
      status: 'submitted',
      ...payload,
    }
    const { data, error } = await supabase
      .from('per_diems')
      .insert(body as any)
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url)')
      .single()
    if (error) throw error
    setItems((prev) => [data as PerDiem, ...prev])
    return data as PerDiem
  }

  const updateStatus = async (perDiem: PerDiem, status: PerDiemStatus) => {
    // optimistic
    setItems((prev) => prev.map((p) => (p.id === perDiem.id ? { ...p, status } : p)))
    const { error } = await supabase
      .from('per_diems')
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq('id', perDiem.id)
    if (error) {
      setItems((prev) => prev.map((p) => (p.id === perDiem.id ? perDiem : p)))
      throw error
    }
    // Notify the submitter.
    try {
      await supabase.from('notifications').insert({
        user_id: perDiem.employee_id,
        title:
          status === 'approved' ? '✅ Spesen genehmigt'
          : status === 'rejected' ? '❌ Spesen abgelehnt'
          : '⏳ Spesen aktualisiert',
        body: `€${perDiem.amount.toFixed(2)} · ${perDiem.country}`,
        type: 'per_diem',
        is_read: false,
      } as any)
    } catch (e) { console.warn('[usePerDiem] notify failed (non-fatal):', e) }
  }

  return { items, loading, fetchItems, submit, updateStatus, ytdTotal }
}
