/**
 * Customers data hook — mirrors the webapp's hooks/useCustomers. List,
 * create, update, archive (soft via is_active=false) and hard-delete.
 *
 * Realtime subscription keeps the list in sync with admin edits made on
 * the web. The picker components rely on is_active=true; toggleArchive
 * is the safe day-to-day action and hardDelete is reserved for never-
 * used rows.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { Customer } from '@/lib/types'

export interface CustomerInput {
  name: string
  address?: string | null
  contact_person?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  latitude?: number | null
  longitude?: number | null
  is_active?: boolean
}

export function useCustomers(includeArchived = true) {
  const supabase = getSupabase()
  const { profile } = useUser()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  const fetchCustomers = useCallback(
    async (silent = false) => {
      if (!profile?.organization_id) return
      if (!silent) setLoading(true)

      let query = supabase
        .from('customers')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name', { ascending: true })

      if (!includeArchived) query = query.eq('is_active', true)

      const { data, error } = await query
      if (error) {
        console.warn('[useCustomers] fetch failed', error.message)
      } else {
        setCustomers((data ?? []) as Customer[])
      }
      setLoading(false)
    },
    [supabase, profile?.organization_id, includeArchived],
  )

  useEffect(() => {
    fetchCustomers()
    if (!profile?.organization_id) return

    const channel = supabase
      .channel(uniqueChannelName(`customers-${profile.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => fetchCustomers(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, profile?.organization_id, fetchCustomers])

  const createCustomer = async (input: CustomerInput): Promise<Customer> => {
    if (!profile?.organization_id) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('customers')
      .insert({
        ...input,
        organization_id: profile.organization_id,
        is_active: input.is_active ?? true,
      } as any)
      .select('*')
      .single()
    if (error) throw error
    setCustomers((prev) =>
      [...prev, data as Customer].sort((a, b) => a.name.localeCompare(b.name)),
    )
    return data as Customer
  }

  const updateCustomer = async (
    id: string,
    patch: Partial<CustomerInput>,
  ): Promise<Customer> => {
    const previous = customers
    setCustomers((prev) =>
      prev
        .map((c) => (c.id === id ? ({ ...c, ...patch } as Customer) : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    const { data, error } = await supabase
      .from('customers')
      .update(patch as any)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      setCustomers(previous)
      throw error
    }
    setCustomers((prev) =>
      prev
        .map((c) => (c.id === id ? (data as Customer) : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    return data as Customer
  }

  const toggleArchive = async (id: string, currentlyActive: boolean) =>
    updateCustomer(id, { is_active: !currentlyActive })

  const deleteCustomer = async (id: string): Promise<void> => {
    const previous = customers
    setCustomers((prev) => prev.filter((c) => c.id !== id))
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) {
      setCustomers(previous)
      throw error
    }
  }

  /** #plans + total worked hours associated with this customer. */
  const getStats = async (id: string): Promise<{ plans: number; hours: number }> => {
    const [{ data: planRows }, { data: timeRows }] = await Promise.all([
      supabase.from('plans').select('id').eq('customer_id', id),
      supabase.from('time_entries').select('net_hours').eq('customer_id', id),
    ])
    const plans = planRows?.length ?? 0
    const hours = (timeRows ?? []).reduce(
      (sum: number, t: any) => sum + (Number(t.net_hours) || 0),
      0,
    )
    return { plans, hours }
  }

  return {
    customers,
    loading,
    fetchCustomers,
    createCustomer,
    updateCustomer,
    toggleArchive,
    deleteCustomer,
    getStats,
  }
}
