/**
 * Korrekturanträge (Kundenfeedback Punkt 3) — same logic as the webapp:
 * after submitting, employees only propose changes; the old values stay
 * valid until dispatch/admin approves via review_time_entry_correction().
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { toast } from '@/components/Toast'
import type { CorrectionValues, TimeEntry, TimeEntryAuditRow, TimeEntryCorrection } from '@/lib/types'
import { TIME_ENTRY_SELECT, dbErrorMessage } from '@/lib/times/entry-status'
import { notifyManagers, sendNotification } from '@/lib/notifications/service'
import { formatDateDE, formatShiftRange } from '@/lib/time/format'

export const CORRECTION_SELECT = `*, employee:profiles!employee_id(id, full_name), reviewer:profiles!reviewed_by(id, full_name), entry:time_entries(${TIME_ENTRY_SELECT})`

export function originalValues(e: TimeEntry): CorrectionValues {
  return {
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time ?? undefined,
    break_minutes: e.break_minutes ?? 0,
    notes: e.notes ?? null,
    overnight_stay: !!e.overnight_stay,
    meal_allowance: Number(e.meal_allowance) || 0,
  }
}

export function useCorrections(opts: { entryId?: string; pendingOnly?: boolean } = {}) {
  const supabase = getSupabase()
  const { session, profile, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id
  const isManager = isAdmin || isDispatcher
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [corrections, setCorrections] = useState<TimeEntryCorrection[]>([])
  const [loading, setLoading] = useState(true)
  const suffix = useRef(Math.random().toString(36).slice(2, 8))

  const fetchCorrections = useCallback(async () => {
    if (!profile?.organization_id) {
      setLoading(false)
      return
    }
    let q = supabase
      .from('time_entry_corrections')
      .select(CORRECTION_SELECT)
      .eq('organization_id', profile.organization_id)
      .order('requested_at', { ascending: false })
      .limit(200)
    if (opts.entryId) q = q.eq('entry_id', opts.entryId)
    if (opts.pendingOnly) q = q.eq('status', 'pending')
    if (!isManager && myId) q = q.eq('employee_id', myId)
    const { data, error } = await q
    if (error) console.warn('[useCorrections]', error.message)
    setCorrections((data ?? []) as TimeEntryCorrection[])
    setLoading(false)
  }, [supabase, profile?.organization_id, opts.entryId, opts.pendingOnly, isManager, myId])

  useEffect(() => {
    fetchCorrections()
    if (!profile?.organization_id) return
    // Coalesce bursts of realtime events into one reload.
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fetchCorrections(), 400)
    }
    const channel = supabase
      .channel(uniqueChannelName(`corrections-${profile.organization_id}-${suffix.current}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'time_entry_corrections', filter: `organization_id=eq.${profile.organization_id}` },
        schedule,
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [fetchCorrections, profile?.organization_id, supabase])

  const requestCorrection = async (entry: TimeEntry, proposed: CorrectionValues, reason: string) => {
    if (!myId || !profile?.organization_id) return false
    const { data, error } = await supabase
      .from('time_entry_corrections')
      .insert({
        organization_id: profile.organization_id,
        entry_id: entry.id,
        employee_id: entry.employee_id,
        requested_by: myId,
        reason: reason.trim(),
        original: originalValues(entry),
        proposed,
      } as any)
      .select('id')
      .single()
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Korrekturantrag konnte nicht gesendet werden', 'Could not send correction request')))
      return false
    }
    void notifyManagers({
      title: 'Neuer Korrekturantrag',
      message: `${entry.employee?.full_name ?? profile.full_name ?? ''} beantragt eine Korrektur für ${formatDateDE(entry.date)} (${formatShiftRange(entry.start_time, entry.end_time)}). Begründung: ${reason.trim()}`,
      module: 'corrections',
      moduleId: (data as any)?.id,
      link: '/dashboard/times/approvals',
    })
    toast.success(L('Korrekturantrag gesendet. Bis zur Freigabe gelten die bisherigen Werte.', 'Correction requested. Current values stay valid until approved.'))
    await fetchCorrections()
    return true
  }

  const cancelCorrection = async (id: string) => {
    // Pending requests can't be edited directly (server rule); withdraw via RPC.
    const { error } = await (supabase as any).rpc('cancel_time_entry_correction', { p_correction_id: id })
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Antrag konnte nicht zurückgezogen werden', 'Could not withdraw request')))
      return false
    }
    toast.success(L('Antrag zurückgezogen', 'Request withdrawn'))
    await fetchCorrections()
    return true
  }

  const reviewCorrection = async (c: TimeEntryCorrection, approve: boolean, note?: string) => {
    const { error } = await (supabase as any).rpc('review_time_entry_correction', {
      p_correction_id: c.id,
      p_approve: approve,
      p_note: note?.trim() || null,
    })
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Entscheidung konnte nicht gespeichert werden', 'Could not save decision')))
      return false
    }
    const day = c.entry?.date ?? c.original?.date ?? ''
    void sendNotification({
      userId: c.employee_id,
      title: approve ? 'Korrektur genehmigt' : 'Korrektur abgelehnt',
      message: approve
        ? `Ihre Korrektur für ${formatDateDE(day)} wurde genehmigt und übernommen.${note?.trim() ? ` Hinweis: ${note.trim()}` : ''}`
        : `Ihre Korrektur für ${formatDateDE(day)} wurde abgelehnt. Es gelten die bisherigen Werte.${note?.trim() ? ` Begründung: ${note.trim()}` : ''}`,
      module: 'time_entries',
      moduleId: c.entry_id,
    })
    toast.success(approve ? L('Korrektur genehmigt und übernommen', 'Correction approved') : L('Korrektur abgelehnt', 'Correction rejected'))
    await fetchCorrections()
    return true
  }

  return { corrections, loading, refetch: fetchCorrections, requestCorrection, cancelCorrection, reviewCorrection }
}

export function useEntryHistory(entryId: string | null | undefined) {
  const supabase = getSupabase()
  const [rows, setRows] = useState<TimeEntryAuditRow[]>([])
  const fetchRows = useCallback(async () => {
    if (!entryId) return
    const { data, error } = await supabase
      .from('time_entry_audit')
      .select('*, changer:profiles!changed_by(id, full_name)')
      .eq('entry_id', entryId)
      .order('changed_at', { ascending: true })
    if (error) console.warn('[useEntryHistory]', error.message)
    setRows((data ?? []) as TimeEntryAuditRow[])
  }, [entryId, supabase])
  useEffect(() => {
    fetchRows()
  }, [fetchRows])
  return { rows, refetch: fetchRows }
}
