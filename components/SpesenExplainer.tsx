/**
 * Explains the two Spesen sources (Kundenfeedback Punkt 13) and shows the
 * automatic Verpflegungsmehraufwand of the current month next to the
 * manual claims, so both are understood as one flow. Same content as the
 * webapp's components/perdiem/SpesenExplainer (stacked for phone width;
 * the link card opens the Monatsnachweis screen).
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Info, ArrowRight } from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { useOrgRules } from '@/hooks/useOrgRules'
import { formatEuro } from '@/lib/time/format'
import { localDateKey } from '@/lib/time/shift-hours'

export function SpesenExplainer({ manager }: { manager: boolean }) {
  const router = useRouter()
  const { session, profile } = useUser()
  const myId = session?.user?.id
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { spesenRates } = useOrgRules()
  const [auto, setAuto] = useState<{ amount: number; days: number } | null>(null)

  useEffect(() => {
    if (!profile?.organization_id || !myId) return
    const now = new Date()
    const start = localDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const end = localDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    let q = getSupabase()
      .from('time_entries')
      .select('employee_id, date, meal_allowance')
      .eq('organization_id', profile.organization_id)
      .eq('is_planned', false)
      .gt('meal_allowance', 0)
      .gte('date', start)
      .lte('date', end)
      .limit(10000)
    if (!manager) q = q.eq('employee_id', myId)
    let alive = true
    q.then(({ data }: { data: Array<{ employee_id: string; date: string; meal_allowance: number }> | null }) => {
      // Once per employee and calendar day — same rule as the Monatsnachweis.
      const perDay = new Map<string, number>()
      for (const r of data ?? []) {
        const k = `${r.employee_id}:${r.date}`
        perDay.set(k, Math.max(perDay.get(k) ?? 0, Number(r.meal_allowance) || 0))
      }
      if (alive) setAuto({ amount: [...perDay.values()].reduce((s, v) => s + v, 0), days: perDay.size })
    })
    return () => {
      alive = false
    }
  }, [profile?.organization_id, myId, manager])

  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#F5F9FF', padding: 20, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Info size={16} color="#0064E0" />
        <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '900', color: '#0064E0', flex: 1 }}>
          {L('So funktionieren Spesen (Verpflegungsmehraufwand)', 'How per diem works')}
        </Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: '#334155', marginBottom: 6 }}>
        <Text style={{ fontWeight: '800' }}>{L('1. Automatisch aus den Schichten: ', '1. Automatically from shifts: ')}</Text>
        {L(
          `Für jeden Arbeitstag mit mehr als 8 Std. Arbeitszeit (ohne Pause) gibt es ${formatEuro(spesenRates.partial, 'de')}, mit Übernachtung ${formatEuro(spesenRates.full, 'de')} – je Kalendertag einmal. Diese Beträge entstehen beim Absenden der Schicht und stehen im Monatsnachweis.`,
          `Each working day with more than 8 h working time (excluding breaks) earns ${formatEuro(spesenRates.partial, 'en')}, with overnight stay ${formatEuro(spesenRates.full, 'en')} – once per calendar day. They are created when the shift is submitted and appear in the monthly statement.`,
        )}
      </Text>
      <Text style={{ fontSize: 13, lineHeight: 19, color: '#334155' }}>
        <Text style={{ fontWeight: '800' }}>{L('2. Zusätzliche Spesenanträge (hier): ', '2. Additional claims (here): ')}</Text>
        {L(
          'Nur für Fälle, die nicht aus einer Schicht entstehen – z. B. mehrtägige Einsätze, Auslandssätze oder Sonderfälle. Disposition oder Admin genehmigt; genehmigte Anträge erscheinen ebenfalls im Monatsnachweis. Fallen Antrag und Schicht-Spesen auf denselben Tag, wird das dort markiert.',
          'Only for cases not covered by a shift – e.g. multi-day trips, foreign rates or special cases. Dispatch or admin approves; approved claims also appear in the monthly statement. If a claim and shift per diem fall on the same day, it is flagged there.',
        )}
      </Text>

      {/* Web: link card to the Monatsnachweis — here /reports/monthly. */}
      <Pressable onPress={() => router.push('/reports/monthly')} style={{ marginTop: 14 }}>
        <View style={{ borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DBEAFE', paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: '#94A3B8' }}>
            {(manager ? L('Automatisch (alle, dieser Monat)', 'Automatic (all, this month)') : L('Automatisch (dieser Monat)', 'Automatic (this month)')).toUpperCase()}
          </Text>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#0064E0', marginTop: 2, fontVariant: ['tabular-nums'] }}>
            {auto ? formatEuro(auto.amount, locale) : '…'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
            {auto ? L(`${auto.days} Tag(e) mit Spesen`, `${auto.days} day(s) with per diem`) : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>{L('Zum Monatsnachweis', 'Monthly statement')}</Text>
            <ArrowRight size={14} color="#2563EB" style={{ marginLeft: 4 }} />
          </View>
        </View>
      </Pressable>
    </View>
  )
}
