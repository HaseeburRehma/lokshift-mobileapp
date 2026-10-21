/**
 * One row of the Gesamtauswertung / Mehrmonatsreport table as a phone
 * card. Same columns, labels and colours as the webapp's OverviewTable:
 * Soll · Arbeitszeit · Gastfahrt (violet) · Ist (black) · Differenz
 * (amber when negative, emerald otherwise) · Urlaub · Krank · Arbeitstage
 * · Offen (amber when > 0) · Fehler (red when > 0). The totals row
 * (`variant="total"`) mirrors the slate-100 table footer.
 */

import React from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { ChevronRight } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { formatHours, formatSignedHours } from '@/lib/time/format'
import type { OverviewRow, OverviewTotals } from '@/lib/reports/overview-report'

interface OverviewRowCardProps {
  label: string
  values: OverviewRow | OverviewTotals
  variant?: 'row' | 'total'
  onPress?: () => void
  busy?: boolean
}

function CountChip({ label, count, tone }: { label: string; count: number; tone: 'amber' | 'red' }) {
  const active = count > 0
  const palette = !active
    ? { bg: '#F8FAFC', border: '#E2E8F0', text: '#94A3B8' }
    : tone === 'amber'
      ? { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' }
      : { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' }
  return (
    <View
      style={{
        borderRadius: 6,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.bg,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginRight: 6,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: palette.text }}>
        {`${label} ${count}`}
      </Text>
    </View>
  )
}

function Cell({ label, value, color, weight }: { label: string; value: string; color?: string; weight?: '600' | '700' | '900' }) {
  return (
    <View style={{ width: '33.33%', paddingRight: 6 }}>
      <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: '#94A3B8' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 14, fontWeight: weight ?? '700', color: color ?? '#0F172A', marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  )
}

export function OverviewRowCard({ label, values, variant = 'row', onPress, busy }: OverviewRowCardProps) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const isTotal = variant === 'total'
  const h = (n: number | null) => (n == null ? '–' : formatHours(n, locale))
  const diff = values.differenceHours
  const diffColor = isTotal ? '#0F172A' : diff == null ? '#94A3B8' : diff < 0 ? '#B45309' : '#047857'

  const body = (
    <View
      style={{
        backgroundColor: isTotal ? '#F1F5F9' : '#FFFFFF',
        borderWidth: 1,
        borderColor: isTotal ? '#CBD5E1' : '#E2E8F0',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 15, fontWeight: isTotal ? '900' : '800', color: '#0F172A' }}
        >
          {label}
        </Text>
        {busy ? (
          <ActivityIndicator size="small" color="#0064E0" />
        ) : onPress ? (
          <ChevronRight size={16} color="#CBD5E1" />
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        <CountChip label={L('Offen', 'Open')} count={values.openEntries} tone="amber" />
        <CountChip label={L('Fehler', 'Issues')} count={values.issueCount} tone="red" />
      </View>

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <Cell label={L('Soll', 'Target')} value={h(values.targetHours)} weight={isTotal ? '900' : '600'} />
        <Cell label={L('Arbeitszeit', 'Working time')} value={h(values.workHours)} weight={isTotal ? '900' : '700'} />
        <Cell label="Gastfahrt" value={h(values.gastfahrtHours)} color={isTotal ? '#0F172A' : '#6D28D9'} weight={isTotal ? '900' : '600'} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginTop: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: isTotal ? '#FFFFFF' : '#F8FAFC',
          borderWidth: 1,
          borderColor: isTotal ? '#E2E8F0' : '#F1F5F9',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: '#94A3B8' }}>
            {L('Ist', 'Actual')}
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', marginTop: 1, fontVariant: ['tabular-nums'] }}>
            {h(values.actualHours)}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: '#94A3B8' }}>
            {L('Differenz', 'Difference')}
          </Text>
          <Text style={{ fontSize: 17, fontWeight: '900', color: diffColor, marginTop: 1, fontVariant: ['tabular-nums'] }}>
            {diff == null ? '–' : formatSignedHours(diff, locale)}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <Cell label={L('Urlaub (Tage)', 'Vacation (days)')} value={String(values.vacationDays)} weight={isTotal ? '900' : '600'} />
        <Cell label={L('Krank (Tage)', 'Sick (days)')} value={String(values.sickDays)} weight={isTotal ? '900' : '600'} />
        <Cell label={L('Arbeitstage', 'Working days')} value={String(values.workingDays)} weight={isTotal ? '900' : '600'} />
      </View>
    </View>
  )

  if (!onPress) return body
  return (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  )
}
