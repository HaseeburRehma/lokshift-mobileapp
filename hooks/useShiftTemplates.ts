/**
 * Shift templates hook — list, create, update, delete reusable plan
 * blueprints. Mirrors the webapp's useShiftTemplates.
 *
 * Templates are stored as `shift_templates` rows scoped to an org.
 * They have HH:mm start/end times (not full timestamps) and an optional
 * `duration_days` so a multi-day mission template can fan out into
 * back-to-back plans when picked.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import type { ShiftTemplate } from '@/lib/types'

export interface ShiftTemplateInput {
  name: string
  customer_id: string | null
  start_time: string // "HH:mm"
  end_time: string // "HH:mm"
  duration_days?: number
  route?: string | null
  location?: string | null
  overnight_stay?: boolean
  hotel_address?: string | null
  notes?: string | null
}

export function useShiftTemplates() {
  const supabase = getSupabase()
  const { profile, session } = useUser()
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTemplates = useCallback(async () => {
    if (!profile?.organization_id) return
    setLoading(true)
    const { data, error } = await supabase
      .from('shift_templates')
      .select('*, customer:customers(id, name)')
      .eq('organization_id', profile.organization_id)
      .order('name', { ascending: true })
      .limit(200)
    if (error) {
      console.warn('[useShiftTemplates] fetch failed', error.message)
    } else {
      setTemplates((data ?? []) as ShiftTemplate[])
    }
    setLoading(false)
  }, [supabase, profile?.organization_id])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const createTemplate = async (input: ShiftTemplateInput): Promise<ShiftTemplate> => {
    if (!profile?.organization_id || !session?.user?.id) {
      throw new Error('Not authenticated')
    }
    const payload = {
      organization_id: profile.organization_id,
      creator_id: session.user.id,
      name: input.name,
      customer_id: input.customer_id ?? null,
      start_time: input.start_time,
      end_time: input.end_time,
      duration_days: input.duration_days ?? 1,
      route: input.route ?? null,
      location: input.location ?? null,
      overnight_stay: input.overnight_stay ?? false,
      hotel_address: input.hotel_address ?? null,
      notes: input.notes ?? null,
    }
    const { data, error } = await supabase
      .from('shift_templates')
      .insert(payload as any)
      .select('*, customer:customers(id, name)')
      .single()
    if (error) throw error
    setTemplates((prev) => [...prev, data as ShiftTemplate].sort((a, b) => a.name.localeCompare(b.name)))
    return data as ShiftTemplate
  }

  const updateTemplate = async (id: string, patch: Partial<ShiftTemplateInput>): Promise<void> => {
    const { error } = await supabase
      .from('shift_templates')
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
    if (error) throw error
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } as ShiftTemplate : t)))
  }

  const deleteTemplate = async (id: string): Promise<void> => {
    const prev = templates
    setTemplates((p) => p.filter((t) => t.id !== id))
    const { error } = await supabase.from('shift_templates').delete().eq('id', id)
    if (error) {
      setTemplates(prev)
      throw error
    }
  }

  return { templates, loading, fetchTemplates, createTemplate, updateTemplate, deleteTemplate }
}
