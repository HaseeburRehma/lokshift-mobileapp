/**
 * Working-time-models hook — mirrors the webapp's useWorkModels. CRUD
 * over `working_time_models` (id, name, description,
 * target_hours_per_week, is_active), with realtime sync so admin edits
 * on the web appear here immediately.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { WorkingTimeModel } from '@/lib/types'

export interface WorkModelInput {
  name: string
  description?: string | null
  target_hours_per_week: number
  is_active?: boolean
}

export function useWorkModels() {
  const supabase = getSupabase()
  const { profile } = useUser()
  const [models, setModels] = useState<WorkingTimeModel[]>([])
  const [loading, setLoading] = useState(true)

  const fetchModels = useCallback(
    async (silent = false) => {
      if (!profile?.organization_id) return
      if (!silent) setLoading(true)
      const { data, error } = await supabase
        .from('working_time_models')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('name', { ascending: true })
      if (error) {
        console.warn('[useWorkModels] fetch failed', error.message)
      } else {
        setModels((data ?? []) as WorkingTimeModel[])
      }
      setLoading(false)
    },
    [supabase, profile?.organization_id],
  )

  useEffect(() => {
    fetchModels()
    if (!profile?.organization_id) return
    const channel = supabase
      .channel(uniqueChannelName(`work-models-${profile.organization_id}`))
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'working_time_models',
          filter: `organization_id=eq.${profile.organization_id}`,
        },
        () => fetchModels(true),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, profile?.organization_id, fetchModels])

  const createModel = async (input: WorkModelInput): Promise<WorkingTimeModel> => {
    if (!profile?.organization_id) throw new Error('Not authenticated')
    const { data, error } = await supabase
      .from('working_time_models')
      .insert({
        ...input,
        organization_id: profile.organization_id,
        is_active: input.is_active ?? true,
      } as any)
      .select('*')
      .single()
    if (error) throw error
    setModels((prev) =>
      [...prev, data as WorkingTimeModel].sort((a, b) => a.name.localeCompare(b.name)),
    )
    return data as WorkingTimeModel
  }

  const updateModel = async (id: string, patch: Partial<WorkModelInput>): Promise<WorkingTimeModel> => {
    const previous = models
    setModels((prev) =>
      prev.map((m) => (m.id === id ? ({ ...m, ...patch } as WorkingTimeModel) : m)),
    )
    const { data, error } = await supabase
      .from('working_time_models')
      .update(patch as any)
      .eq('id', id)
      .select('*')
      .single()
    if (error) {
      setModels(previous)
      throw error
    }
    setModels((prev) =>
      prev.map((m) => (m.id === id ? (data as WorkingTimeModel) : m)),
    )
    return data as WorkingTimeModel
  }

  const deleteModel = async (id: string): Promise<void> => {
    const previous = models
    setModels((prev) => prev.filter((m) => m.id !== id))
    const { error } = await supabase.from('working_time_models').delete().eq('id', id)
    if (error) {
      setModels(previous)
      throw error
    }
  }

  return { models, loading, fetchModels, createModel, updateModel, deleteModel }
}
