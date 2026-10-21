/**
 * Employee home (Kundenfeedback Punkte 9, 10, 14): today's shift first —
 * confirm it or start the time tracking (the ClockInOutCard sits right
 * above) — then the next days of the own week. Same content as the
 * webapp's EmployeeWeekGlance.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarRange, CheckCircle2, MapPin, Play, StickyNote } from 'lucide-react-native'

import { toast } from '@/components/Toast'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { Plan } from '@/lib/types'
import { WEEK_PLAN_SELECT } from '@/hooks/usePlanningWeek'
import { useTimeTracking } from '@/hooks/useTimeTracking'
import { addDays, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatShiftRange, weekdayName } from '@/lib/time/format'
import { planStartDay } from '@/lib/plans/week'
import { describePlan } from '@/lib/plans/notify'
import { notifyManagers, sendNotification } from '@/lib/notifications/service'

/** Same labels + tones as the webapp's PLAN_STATUS (PlanCard). */
const STATUS: Record<string, { de: string; en: string; bg: string; fg: string; border: string }> = {
  draft: { de: 'Entwurf', en: 'Draft', bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  assigned: { de: 'Offen', en: 'Open', bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  confirmed: { de: 'Bestätigt', en: 'Confirmed', bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
  rejected: { de: 'Abgelehnt', en: 'Rejected', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  cancelled: { de: 'Storniert', en: 'Cancelled', bg: '#F1F5F9', fg: '#64748B', border: '#E2E8F0' },
}

export function EmployeeWeekGlance() {
  const router = useRouter()
  const { session, profile } = useUser()
  const myId = session?.user?.id ?? null
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { activeEntry, clockIn } = useTimeTracking()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loaded, setLoaded] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)
  const suffix = useRef(Math.random().toString(36).slice(2, 8))

  const load = useCallback(async () => {
    if (!myId) return
    const today = localDateKey()
    const { data } = await getSupabase()
      .from('plans')
      .select(WEEK_PLAN_SELECT)
      .eq('employee_id', myId)
      .in('status', ['assigned', 'confirmed'])
      .gt('end_time', new Date().toISOString())
      .lt('start_time', new Date(`${addDays(today, 7)}T00:00:00`).toISOString())
      .order('start_time')
    setPlans((data ?? []) as Plan[])
    setLoaded(true)
  }, [myId])

  useEffect(() => {
    load()
    if (!myId) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueChannelName(`employee-week-${myId}-${suffix.current}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `employee_id=eq.${myId}` }, () => load())
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {}
    }
  }, [load, myId])

  const today = localDateKey()
  const now = Date.now()
  const current = plans.filter((p) => planStartDay(p) === today || (new Date(p.start_time).getTime() <= now && new Date(p.end_time).getTime() > now))
  const upcoming = plans.filter((p) => !current.includes(p))

  const confirm = async (p: Plan) => {
    const { error } = await getSupabase()
      .from('plans')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() } as any)
      .eq('id', p.id)
    if (error) {
      toast.error(L('Bestätigung fehlgeschlagen', 'Confirmation failed'))
      return
    }
    setPlans((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'confirmed' } : x)))
    toast.success(L('Schicht bestätigt', 'Shift confirmed'))
    const payload = {
      title: 'Schicht bestätigt',
      message: `${profile?.full_name ?? 'Mitarbeiter'} hat die Schicht ${describePlan(p)} bestätigt.`,
      module: 'plans' as const,
      moduleId: p.id,
      skipEmail: true,
    }
    if (p.creator_id && p.creator_id !== myId) void sendNotification({ userId: p.creator_id, ...payload })
    else void notifyManagers(payload)
  }

  // "Schicht starten" — same clock-in as the ClockInOutCard above, bound
  // to this plan (webapp EmployeeWeekGlance).
  const start = async (p: Plan) => {
    if (starting || activeEntry) return
    setStarting(p.id)
    try {
      await clockIn(p.id)
    } finally {
      setStarting(null)
    }
  }

  const card = (p: Plan, highlight: boolean) => {
    const st = STATUS[p.status] ?? STATUS.assigned
    const day = planStartDay(p)
    const from = p.start_location?.short_code || p.start_location?.name
    const to = p.destination_location?.short_code || p.destination_location?.name
    return (
      <Pressable key={p.id} onPress={() => router.push(`/plans/${p.id}` as any)}>
        <View
          style={{
            borderRadius: 16,
            borderWidth: highlight ? 2 : 1,
            borderColor: highlight ? '#BFDBFE' : '#F1F5F9',
            backgroundColor: '#FFFFFF',
            padding: 14,
            marginBottom: 8,
            borderLeftWidth: 4,
            borderLeftColor: highlight ? '#0064E0' : '#CBD5E1',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#94A3B8' }}>
                {(day === today ? L('Heute', 'Today') : `${weekdayName(day, locale, true)}, ${formatDateDE(day).slice(0, 6)}`).toUpperCase()}
              </Text>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', marginTop: 2 }}>{formatShiftRange(p.start_time, p.end_time, locale)}</Text>
              {(p.shift_name || p.route) ? <Text style={{ fontSize: 13, fontWeight: '800', color: '#0064E0' }} numberOfLines={1}>{p.shift_name || p.route}</Text> : null}
              {p.customer?.name ? <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }} numberOfLines={1}>{p.customer.name}</Text> : null}
              {from || to ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                  <MapPin size={11} color="#64748B" />
                  <Text style={{ marginLeft: 3, fontSize: 12, fontWeight: '600', color: '#64748B' }}>{from || '?'} → {to || '?'}</Text>
                </View>
              ) : null}
              {p.notes ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
                  <StickyNote size={12} color="#92400E" style={{ marginTop: 2 }} />
                  <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: '#92400E', flex: 1 }}>{p.notes}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ borderRadius: 6, borderWidth: 1, borderColor: st.border, backgroundColor: st.bg, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
              <Text style={{ fontSize: 9, fontWeight: '900', color: st.fg }}>{(locale === 'de' ? st.de : st.en).toUpperCase()}</Text>
            </View>
          </View>
          {p.status === 'assigned' || (highlight && !activeEntry) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {p.status === 'assigned' ? (
                <Pressable onPress={() => confirm(p)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <CheckCircle2 size={14} color="#FFFFFF" />
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#FFFFFF' }}>{L('Bestätigen', 'Confirm')}</Text>
                  </View>
                </Pressable>
              ) : null}
              {highlight && !activeEntry ? (
                <Pressable onPress={() => start(p)} disabled={!!starting}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, opacity: starting ? 0.6 : 1 }}>
                    <Play size={14} color="#FFFFFF" fill="#FFFFFF" />
                    <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#FFFFFF' }}>{L('Schicht starten', 'Start shift')}</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    )
  }

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <CalendarRange size={16} color="#2563EB" />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#0F172A' }}>{L('Meine Einsätze', 'My shifts')}</Text>
        </View>
        <Pressable onPress={() => router.push('/plans/my-week' as any)} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Ganze Woche', 'Whole week')}</Text>
        </Pressable>
      </View>
      {loaded && plans.length === 0 ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#94A3B8', textAlign: 'center' }}>{L('In den nächsten 7 Tagen sind keine Schichten geplant.', 'No shifts planned in the next 7 days.')}</Text>
        </View>
      ) : (
        <>
          {current.map((p) => card(p, true))}
          {upcoming.slice(0, current.length ? 5 : 6).map((p) => card(p, false))}
        </>
      )}
    </View>
  )
}
