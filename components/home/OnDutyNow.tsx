/**
 * "Laut Planung aktuell im Einsatz" (Kundenfeedback Punkt 10) — same logic
 * as the webapp's OnDutyNow; first section of the manager home. The planned time decides who is listed (a
 * person planned 10:00–18:00 appears at 11:00 even without check-in); the
 * actual tracking adds the status: not checked in, checked in, already
 * finished, or planned end exceeded while still clocked in.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { MapPin, Radio } from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { Plan } from '@/lib/types'
import { WEEK_PLAN_SELECT } from '@/hooks/usePlanningWeek'
import { dutyStatus, dutyStatusLabel, type DutyStatus } from '@/lib/plans/week'
import { formatShiftRange, formatTimeOfDay } from '@/lib/time/format'
import { localDateKey } from '@/lib/time/shift-hours'

interface EntryLite {
  id: string
  employee_id: string
  plan_id: string | null
  start_time: string
  end_time: string | null
  employee?: { full_name: string | null } | null
}

const STATUS_COLORS: Record<DutyStatus, { bg: string; fg: string; border: string }> = {
  not_checked_in: { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  checked_in: { bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
  finished: { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  overrun: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
}

export function OnDutyNow() {
  const router = useRouter()
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const suffix = useRef(Math.random().toString(36).slice(2, 8))

  const [plans, setPlans] = useState<Plan[]>([])
  const [entries, setEntries] = useState<EntryLite[]>([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  const load = useCallback(async () => {
    if (!orgId) return
    const supabase = getSupabase()
    const t = new Date()
    setNow(t)
    const lookback = new Date(t.getTime() - 16 * 3_600_000).toISOString()
    const [planRes, entryRes] = await Promise.all([
      supabase
        .from('plans')
        .select(WEEK_PLAN_SELECT)
        .eq('organization_id', orgId)
        .in('status', ['assigned', 'confirmed'])
        .lte('start_time', t.toISOString())
        .gt('end_time', lookback)
        .order('start_time'),
      supabase
        .from('time_entries')
        .select('id, employee_id, plan_id, start_time, end_time, employee:profiles!employee_id(full_name)')
        .eq('organization_id', orgId)
        .eq('is_planned', false)
        .or(`end_time.is.null,start_time.gte.${lookback}`),
    ])
    setPlans((planRes.data ?? []) as Plan[])
    setEntries((entryRes.data ?? []) as unknown as EntryLite[])
    setLoading(false)
  }, [orgId])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    if (!orgId) return () => clearInterval(interval)
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueChannelName(`on-duty-${orgId}-${suffix.current}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_entries', filter: `organization_id=eq.${orgId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `organization_id=eq.${orgId}` }, () => load())
      .subscribe()
    return () => {
      clearInterval(interval)
      try {
        supabase.removeChannel(channel)
      } catch {}
    }
  }, [load, orgId])

  const rows = useMemo(() => {
    const matchEntry = (p: Plan) =>
      entries.find((e) => e.plan_id === p.id) ??
      entries.find(
        (e) =>
          e.employee_id === p.employee_id &&
          new Date(e.start_time).getTime() >= new Date(p.start_time).getTime() - 3 * 3_600_000 &&
          new Date(e.start_time) < new Date(p.end_time),
      )
    return plans
      .map((p) => {
        const entry = matchEntry(p)
        const active = new Date(p.start_time) <= now && new Date(p.end_time) > now
        return { plan: p, entry, status: dutyStatus(p, entry ?? null, now), active }
      })
      .filter((r) => r.active || r.status === 'overrun')
  }, [plans, entries, now])

  const unplanned = useMemo(() => {
    const covered = new Set(rows.map((r) => r.entry?.id).filter(Boolean))
    return entries.filter((e) => !e.end_time && !covered.has(e.id))
  }, [rows, entries])

  const counts = rows.reduce<Record<DutyStatus, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { not_checked_in: 0, checked_in: 0, finished: 0, overrun: 0 },
  )

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Radio size={16} color="#059669" />
          <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '800', color: '#0F172A', flexShrink: 1 }}>
            {L('Laut Planung aktuell im Einsatz', 'On duty right now (per plan)')}
          </Text>
          <View style={{ marginLeft: 6, borderRadius: 999, backgroundColor: '#0064E0', paddingHorizontal: 7, paddingVertical: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFFFFF' }}>{String(rows.length)}</Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/(tabs)/live' as any)} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Live-Karte', 'Live map')}</Text>
        </Pressable>
      </View>

      {rows.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {(Object.keys(counts) as DutyStatus[])
            .filter((k) => counts[k] > 0)
            .map((k) => (
              <View key={k} style={{ borderRadius: 6, borderWidth: 1, borderColor: STATUS_COLORS[k].border, backgroundColor: STATUS_COLORS[k].bg, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: STATUS_COLORS[k].fg }}>
                  {counts[k]} {dutyStatusLabel(k, locale).toUpperCase()}
                </Text>
              </View>
            ))}
        </View>
      )}

      {loading ? (
        <View style={{ height: 96, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#0064E0" />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#94A3B8', textAlign: 'center' }}>{L('Laut Planung ist gerade niemand im Einsatz.', 'Nobody is scheduled right now.')}</Text>
        </View>
      ) : (
        rows.map(({ plan, entry, status }) => {
          const c = STATUS_COLORS[status]
          const from = plan.start_location?.short_code || plan.start_location?.name
          const to = plan.destination_location?.short_code || plan.destination_location?.name
          return (
            <Pressable key={plan.id} onPress={() => router.push(`/dashboard?date=${localDateKey(new Date(plan.start_time))}` as any)}>
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A', flex: 1 }} numberOfLines={1}>
                    {plan.employee?.full_name ?? L('Unbesetzt', 'Unassigned')}
                  </Text>
                  <View style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8 }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: c.fg }}>{dutyStatusLabel(status, locale).toUpperCase()}</Text>
                  </View>
                </View>
                <Text style={{ marginTop: 3, fontSize: 12, fontWeight: '700', color: '#475569' }}>
                  {L('Plan', 'Plan')} {formatShiftRange(plan.start_time, plan.end_time, locale)}
                  {entry ? (
                    <Text style={{ color: '#94A3B8' }}>
                      {' '}· {L('erfasst seit', 'clocked since')} {formatTimeOfDay(entry.start_time)}
                      {entry.end_time ? `–${formatTimeOfDay(entry.end_time)}` : ''}
                    </Text>
                  ) : null}
                </Text>
                {(plan.shift_name || plan.route || plan.customer?.name) ? (
                  <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: '#0064E0' }} numberOfLines={1}>
                    {[plan.shift_name || plan.route, plan.customer?.name].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                {from || to ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <MapPin size={11} color="#64748B" />
                    <Text style={{ marginLeft: 3, fontSize: 11, fontWeight: '600', color: '#64748B' }}>{from || '?'} → {to || '?'}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )
        })
      )}

      {unplanned.length > 0 && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 4 }}>
          {L('Eingecheckt ohne aktuelle Planung:', 'Clocked in without a current plan:')}{' '}
          {unplanned.map((e) => `${e.employee?.full_name ?? '—'} (${L('seit', 'since')} ${formatTimeOfDay(e.start_time)})`).join(', ')}
        </Text>
      )}
    </View>
  )
}
