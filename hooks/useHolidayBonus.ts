/**
 * Sonderzahlungen (Kundenfeedback Punkt 6) — table `holiday_bonuses`
 * (historic name). Same logic as the webapp's useSpecialPayments:
 * admin/dispatch create, edit and delete; employees see their own.
 * Payments appear automatically in the matching Monatsnachweis — the
 * report computes the monthly share on read, so nothing is counted twice.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { toast } from '@/components/Toast'
import type { HolidayBonus } from '@/lib/types'
import { sendNotification } from '@/lib/notifications/service'
import { formatEuro } from '@/lib/time/format'
import { paymentPeriodLabel } from '@/lib/special-payments'
import { dbErrorMessage } from '@/lib/times/entry-status'

export type SpecialPaymentInput = Pick<
  HolidayBonus,
  'employee_id' | 'title' | 'amount' | 'bonus_type' | 'distribution' | 'billing_month' | 'period_start' | 'period_end' | 'notes'
>

const SELECT = '*, employee:profiles!employee_id(id, full_name)'

function normalize(data: SpecialPaymentInput): SpecialPaymentInput {
  return {
    ...data,
    title: data.title?.trim() || null,
    notes: data.notes?.trim() || null,
    billing_month: data.distribution === 'once' ? data.billing_month : null,
    period_start: data.distribution === 'once' ? null : data.period_start,
    period_end: data.distribution === 'once' ? null : data.period_end,
  }
}

/** Month the payment is booked in (for "this year" totals and sorting). */
export function paymentMonth(b: Pick<HolidayBonus, 'billing_month' | 'period_start' | 'created_at'>): string {
  return (b.billing_month ?? b.period_start ?? b.created_at ?? '').slice(0, 7)
}

export function useHolidayBonus() {
  const supabase = getSupabase()
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [items, setItems] = useState<HolidayBonus[]>([])
  const [loading, setLoading] = useState(true)
  const suffix = useRef(Math.random().toString(36).slice(2, 8))

  const isManagerial = isAdmin || isDispatcher
  const myId = session?.user?.id
  const orgId = profile?.organization_id

  const fetchItems = useCallback(async () => {
    if (!orgId || !myId) {
      setLoading(false)
      return
    }
    let query = supabase
      .from('holiday_bonuses')
      .select(SELECT)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (!isManagerial) query = query.eq('employee_id', myId)
    const { data, error } = await query
    if (error) console.warn('[useHolidayBonus] fetch failed:', error.message)
    else {
      const rows = (data ?? []) as HolidayBonus[]
      rows.sort((a, b) => paymentMonth(b).localeCompare(paymentMonth(a)) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
      setItems(rows)
    }
    setLoading(false)
  }, [supabase, orgId, myId, isManagerial])

  useEffect(() => {
    fetchItems()
    if (!orgId) return
    const channel = supabase
      .channel(uniqueChannelName(`special-payments-${orgId}-${suffix.current}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'holiday_bonuses', filter: `organization_id=eq.${orgId}` },
        () => fetchItems(),
      )
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {}
    }
  }, [fetchItems, orgId, supabase])

  const ytdTotal = useMemo(() => {
    const year = String(new Date().getFullYear())
    return items
      .filter((b) => paymentMonth(b).startsWith(year))
      .reduce((s, b) => s + (Number(b.amount) || 0), 0)
  }, [items])

  const createPayment = async (data: SpecialPaymentInput): Promise<boolean> => {
    if (!orgId) return false
    const payload = normalize(data)
    const { data: created, error } = await supabase
      .from('holiday_bonuses')
      .insert({ ...payload, organization_id: orgId, created_by: myId ?? null } as any)
      .select(SELECT)
      .single()
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Sonderzahlung konnte nicht gespeichert werden', 'Could not save special payment')))
      return false
    }
    const row = created as HolidayBonus
    setItems((prev) => [row, ...prev.filter((b) => b.id !== row.id)])
    toast.success(L('Sonderzahlung angelegt', 'Special payment added'))
    void sendNotification({
      userId: payload.employee_id,
      title: 'Neue Sonderzahlung',
      message: `${payload.title ?? 'Sonderzahlung'}: ${formatEuro(payload.amount, 'de')} (${paymentPeriodLabel(payload, 'de')}).`,
      module: 'bonuses',
      moduleId: row.id,
      link: '/dashboard/holiday-bonus',
    })
    return true
  }

  const updatePayment = async (id: string, data: SpecialPaymentInput): Promise<boolean> => {
    const payload = normalize(data)
    const { error } = await supabase
      .from('holiday_bonuses')
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq('id', id)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Änderung konnte nicht gespeichert werden', 'Could not save changes')))
      return false
    }
    toast.success(L('Sonderzahlung aktualisiert', 'Special payment updated'))
    await fetchItems()
    return true
  }

  const deletePayment = async (id: string): Promise<boolean> => {
    const prev = items
    setItems((curr) => curr.filter((b) => b.id !== id))
    const { error } = await supabase.from('holiday_bonuses').delete().eq('id', id)
    if (error) {
      setItems(prev)
      toast.error(dbErrorMessage(error, locale, L('Löschen fehlgeschlagen', 'Delete failed')))
      return false
    }
    toast.success(L('Sonderzahlung gelöscht', 'Special payment deleted'))
    return true
  }

  return { items, loading, fetchItems, createPayment, updatePayment, deletePayment, ytdTotal }
}
