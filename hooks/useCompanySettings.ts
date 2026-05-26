/**
 * Company-settings hook — reads + patches the single
 * `company_settings` row for the current organization. The web stores
 * channel toggles (email_enabled, whatsapp_enabled, push_enabled) and
 * event-trigger toggles (alert_new_lead, alert_job_completed, etc.)
 * here, so mobile uses the same row to stay in sync.
 *
 * Admin-only. Server-side RLS enforces the same.
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

export interface CompanySettings {
  id: string
  organization_id?: string | null
  // Channel toggles
  email_enabled?: boolean | null
  whatsapp_enabled?: boolean | null
  push_enabled?: boolean | null
  sms_enabled?: boolean | null
  // Event triggers (legacy field names mirror the web schema verbatim)
  alert_new_lead?: boolean | null
  alert_job_completed?: boolean | null
  alert_low_credits?: boolean | null
  alert_negative_review?: boolean | null
  alert_shift_assigned?: boolean | null
  alert_shift_rejected?: boolean | null
  alert_absence_submitted?: boolean | null
  // Misc
  updated_at?: string
}

export function useCompanySettings() {
  const supabase = getSupabase()
  const { profile } = useUser()
  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSettings = useCallback(async () => {
    if (!profile?.organization_id) return
    setLoading(true)
    let query = supabase.from('company_settings').select('*')
    // Some installations key by organization_id; others have a single row
    // per database. Try the org filter first, fall back to maybeSingle().
    const orgQuery = await query.eq('organization_id', profile.organization_id).maybeSingle()
    if (orgQuery.data) {
      setSettings(orgQuery.data as CompanySettings)
    } else {
      const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      setSettings((data ?? null) as CompanySettings | null)
    }
    setLoading(false)
  }, [supabase, profile?.organization_id])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const update = async (patch: Partial<CompanySettings>): Promise<void> => {
    if (!settings?.id) throw new Error('Settings not initialised')
    const previous = settings
    setSettings({ ...settings, ...patch })
    const { error } = await supabase
      .from('company_settings')
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq('id', settings.id)
    if (error) {
      setSettings(previous)
      throw error
    }
  }

  return { settings, loading, fetchSettings, update }
}
