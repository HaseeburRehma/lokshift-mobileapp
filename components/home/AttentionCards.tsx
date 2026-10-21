/**
 * Compact "Handlungsbedarf" for dispatch/admin (Kundenfeedback Punkt 10,
 * Empfehlung): open approvals, unassigned / rejected upcoming shifts and
 * deadlines that expire soon. Same counts, labels and tones as the
 * webapp's AttentionCards.
 *
 * The current-week strip the webapp renders below these cards lives in
 * WeekPlanningGlance on mobile — the home screen shows it right after
 * "Laut Planung aktuell im Einsatz", before these cards.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { AlertTriangle, IdCard, ShieldCheck, UserX } from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { addDays, localDateKey } from '@/lib/time/shift-hours'

interface Counts {
  approvals: number
  corrections: number
  unassigned: number
  rejected: number
  expiring: number
  expired: number
}

type Tone = 'ok' | 'warn' | 'alert'
const TONE: Record<Tone, { border: string; icon: string }> = {
  ok: { border: '#F1F5F9', icon: '#059669' },
  warn: { border: '#FDE68A', icon: '#D97706' },
  alert: { border: '#FECACA', icon: '#DC2626' },
}

export function AttentionCards() {
  const router = useRouter()
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [c, setC] = useState<Counts | null>(null)

  const load = useCallback(async () => {
    if (!orgId) return
    const supabase = getSupabase()
    const now = new Date().toISOString()
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString()
    const today = localDateKey()
    const in30 = addDays(today, 30)
    const [a, b, u, r, e1, e2] = await Promise.all([
      supabase.from('time_entries').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_verified', false).eq('is_planned', false).not('submitted_at', 'is', null),
      supabase.from('time_entry_corrections').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
      supabase.from('plans').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('employee_id', null).neq('status', 'cancelled').gte('start_time', now).lte('start_time', in14),
      supabase.from('plans').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'rejected').gte('start_time', now),
      supabase.from('qualifications').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('archived_at', null).gte('expires_at', today).lte('expires_at', in30),
      supabase.from('qualifications').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('archived_at', null).lt('expires_at', today),
    ])
    setC({
      approvals: a.count ?? 0,
      corrections: b.count ?? 0,
      unassigned: u.count ?? 0,
      rejected: r.count ?? 0,
      expiring: e1.count ?? 0,
      expired: e2.count ?? 0,
    })
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])
  // Refresh when the user comes back to the home tab.
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // Skeleton while loading — same 2x2 placeholder as the web.
  if (!c) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexBasis: '47%', flexGrow: 1, height: 92, borderRadius: 16, backgroundColor: '#F8FAFC' }} />
        ))}
      </View>
    )
  }

  const cards: { href: string; Icon: any; value: number; label: string; sub: string; tone: Tone }[] = [
    {
      href: '/times/verify',
      Icon: ShieldCheck,
      value: c.approvals + c.corrections,
      label: L('Offene Freigaben', 'Pending approvals'),
      sub: c.corrections ? L(`davon ${c.corrections} Korrekturanträge`, `${c.corrections} correction requests`) : L('abgesendete Zeiten', 'submitted times'),
      tone: c.approvals + c.corrections > 0 ? 'warn' : 'ok',
    },
    {
      href: '/dashboard',
      Icon: UserX,
      value: c.unassigned,
      label: L('Unbesetzte Schichten', 'Unassigned shifts'),
      sub: L('nächste 14 Tage', 'next 14 days'),
      tone: c.unassigned > 0 ? 'warn' : 'ok',
    },
    {
      href: '/dashboard',
      Icon: AlertTriangle,
      value: c.rejected,
      label: L('Abgelehnte Schichten', 'Rejected shifts'),
      sub: L('neu zuweisen', 'reassign'),
      tone: c.rejected > 0 ? 'alert' : 'ok',
    },
    {
      href: '/qualifications',
      Icon: IdCard,
      value: c.expiring + c.expired,
      label: L('Fristen', 'Deadlines'),
      sub: c.expired
        ? L(`${c.expired} abgelaufen · ${c.expiring} in 30 Tagen`, `${c.expired} expired · ${c.expiring} within 30 days`)
        : L(`${c.expiring} laufen in 30 Tagen ab`, `${c.expiring} expire within 30 days`),
      tone: c.expired > 0 ? 'alert' : c.expiring > 0 ? 'warn' : 'ok',
    },
  ]

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
      {cards.map(({ href, Icon, value, label, sub, tone }) => (
        <Pressable key={label} onPress={() => router.push(href as any)} style={{ flexBasis: '47%', flexGrow: 1 }}>
          <View style={{ borderRadius: 16, borderWidth: 1, borderColor: TONE[tone].border, backgroundColor: '#FFFFFF', padding: 14, minHeight: 96 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Icon size={20} color={TONE[tone].icon} />
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A' }}>{String(value)}</Text>
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '900', color: '#1E293B' }}>{label}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>{sub}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}
