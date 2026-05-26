/**
 * Qualifications hook. Mirrors the web's `qualifications` table:
 *   - employee sees + edits their own
 *   - admin / dispatcher see + can verify everyone's
 *
 * Realtime subscription on the org's qualifications keeps the list in
 * sync with edits made from web.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { Qualification } from '@/lib/types'

export interface QualificationInput {
  name: string
  issuer?: string | null
  issued_at?: string | null
  expires_at?: string | null
  reference?: string | null
  document_url?: string | null
}

export function useQualifications(targetUserId?: string) {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const isManagerial = isAdmin || isDispatcher
  const [items, setItems] = useState<Qualification[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(
    async (silent = false) => {
      if (!orgId || !myId) return
      if (!silent) setLoading(true)
      let query = supabase
        .from('qualifications')
        .select('*, user:profiles!user_id(id, full_name, avatar_url)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(200)
      // Non-managerial users only see their own. Managerial users can
      // scope to one specific user via targetUserId, or list everyone.
      if (!isManagerial) {
        query = query.eq('user_id', myId)
      } else if (targetUserId) {
        query = query.eq('user_id', targetUserId)
      }
      const { data, error } = await query
      if (error) {
        console.warn('[useQualifications] fetch failed', error.message)
      } else {
        setItems((data ?? []) as Qualification[])
      }
      setLoading(false)
    },
    [supabase, orgId, myId, isManagerial, targetUserId],
  )

  useEffect(() => {
    if (!orgId) return
    fetchItems()
    const channel = supabase
      .channel(uniqueChannelName(`qualifications:${orgId}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'qualifications',
          filter: `organization_id=eq.${orgId}`,
        },
        () => fetchItems(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, fetchItems])

  const createItem = async (
    input: QualificationInput,
    userId?: string,
  ): Promise<Qualification> => {
    if (!orgId || !myId) throw new Error('Not authenticated')
    // Managerial users may create on behalf of another employee;
    // employees can only create their own (RLS double-checks).
    const owner = isManagerial && userId ? userId : myId
    const { data, error } = await supabase
      .from('qualifications')
      .insert({
        ...input,
        user_id: owner,
        organization_id: orgId,
        is_verified: false,
      } as any)
      .select('*, user:profiles!user_id(id, full_name, avatar_url)')
      .single()
    if (error) throw error
    setItems((prev) => [data as Qualification, ...prev])
    return data as Qualification
  }

  const updateItem = async (
    id: string,
    patch: Partial<QualificationInput> & { is_verified?: boolean },
  ): Promise<void> => {
    const previous = items
    setItems((prev) =>
      prev.map((q) => (q.id === id ? ({ ...q, ...patch } as Qualification) : q)),
    )
    const { error } = await supabase
      .from('qualifications')
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
    if (error) {
      setItems(previous)
      throw error
    }
  }

  const deleteItem = async (id: string): Promise<void> => {
    const previous = items
    setItems((prev) => prev.filter((q) => q.id !== id))
    const { error } = await supabase.from('qualifications').delete().eq('id', id)
    if (error) {
      setItems(previous)
      throw error
    }
  }

  /** Admin / dispatcher action — flips is_verified on a single row. */
  const setVerified = async (id: string, verified: boolean): Promise<void> => {
    if (!isManagerial) throw new Error('Forbidden')
    await updateItem(id, { is_verified: verified })
  }

  return {
    items,
    loading,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    setVerified,
    isManagerial,
  }
}
