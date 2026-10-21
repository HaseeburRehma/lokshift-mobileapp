/**
 * Zeitkonto building blocks shared by /account (employee view) and
 * /account/employee/[id] (admin drill-in) — native port of the webapp's
 * TimeAccountOverview: 4 stat cards + "Monatsübersicht" card with
 * pagination (6 months per page).
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronRight } from 'lucide-react-native'

import { C, Pagination } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { monthLabel } from '@/lib/time/format'
import type { MonthlyTimeData } from '@/hooks/useTimeAccount'

const MONTHS_SHORT_DE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.']
const MONTHS_SHORT_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10" → "Okt." / "Oct" (web: toLocaleDateString({ month: 'short' })). */
export function shortMonth(key: string | null | undefined, locale: 'de' | 'en'): string {
  if (!key) return 'N/A'
  const m = Number(key.split('-')[1])
  if (!m || m < 1 || m > 12) return key
  return (locale === 'de' ? MONTHS_SHORT_DE : MONTHS_SHORT_EN)[m - 1]
}

/** +12.5Std. / -3.0Std. — same formatting as the webapp's account pages. */
export function signed(n: number, hr: string, plusOnZero = true): string {
  const v = Number(n) || 0
  return `${v > 0 || (plusOnZero && v === 0) ? '+' : ''}${v.toFixed(1)}${hr}`
}

/** `bg-white border border-slate-200 rounded-2xl p-5` stat card. */
export function StatCard({ value, label, color = C.slate900, size = 28 }: { value: string; label: string; color?: string; size?: number }) {
  return (
    <View style={{ flex: 1, minWidth: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.slate200, borderRadius: 16, padding: 18 }}>
      <Text style={{ fontSize: size, fontWeight: '700', color, letterSpacing: -0.6, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 12, color: C.slate500 }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

/** Stundensaldo · Bezahlte Überstunden · Gesamtstunden (latest month) · Arbeitstage. */
export function FourStatsGrid({
  totalBalance,
  overtimePaid,
  latest,
}: {
  totalBalance: number
  overtimePaid: number
  latest: MonthlyTimeData | null
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const latestLabel = shortMonth(latest?.key, locale)
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCard
          value={signed(totalBalance, hr, false)}
          label={L('Stundensaldo (lfd. Jahr)', 'Hours Balance (YTD)')}
          color={totalBalance >= 0 ? C.emerald500 : C.red500}
        />
        <StatCard value={`${overtimePaid.toFixed(1)}${hr}`} label={L('Bezahlte Überstunden', 'Overtime Paid')} color={C.blue600} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatCard
          value={`${(latest?.actualHours ?? 0).toFixed(1)}${hr}`}
          label={L(`Gesamtstunden (${latestLabel})`, `Total Hours (${latestLabel})`)}
          color={C.blue600}
        />
        <StatCard value={String(latest?.workingDays ?? 0)} label={L('Arbeitstage', 'Working Days')} color={C.blue600} />
      </View>
    </View>
  )
}

const MONTHS_PER_PAGE = 6

/** "Monatsübersicht" card — one row per month, tap → daily breakdown. */
export function MonthlyBreakdownCard({ data, onMonthPress }: { data: MonthlyTimeData[]; onMonthPress: (key: string) => void }) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(data.length / MONTHS_PER_PAGE))
  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])
  const rows = data.slice((page - 1) * MONTHS_PER_PAGE, page * MONTHS_PER_PAGE)

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.slate200, borderRadius: 16, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.slate100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: C.slate900 }}>{L('Monatsübersicht', 'Monthly Breakdown')}</Text>
        {data.length > MONTHS_PER_PAGE ? (
          <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400 }}>
            {`${(page - 1) * MONTHS_PER_PAGE + 1}–${Math.min(page * MONTHS_PER_PAGE, data.length)} ${L('von', 'of')} ${data.length}`}
          </Text>
        ) : null}
      </View>

      {data.length === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate400 }}>{L('Keine Zeiteinträge gefunden.', 'No time records found.')}</Text>
        </View>
      ) : (
        rows.map((m, idx) => {
          const positive = m.difference >= 0
          return (
            <Pressable key={m.key} onPress={() => onMonthPress(m.key)} accessibilityRole="button" accessibilityLabel={monthLabel(m.key, locale)}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: C.slate100,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: C.slate900 }} numberOfLines={1}>
                    {monthLabel(m.key, locale)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: C.slate400 }} numberOfLines={1}>
                    {`${m.workingDays} ${L('Arbeitstage', 'working days')} · ${m.actualHours.toFixed(1)} / ${m.targetHours.toFixed(1)} ${hr}`}
                  </Text>
                </View>
                <Text style={{ marginLeft: 8, fontSize: 15, fontWeight: '600', color: positive ? C.emerald500 : C.red500, fontVariant: ['tabular-nums'] }}>
                  {signed(m.difference, hr)}
                </Text>
                <ChevronRight size={16} color={C.slate300} style={{ marginLeft: 6 }} />
              </View>
            </Pressable>
          )
        })
      )}

      {totalPages > 1 ? (
        <View style={{ paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.slate100, backgroundColor: 'rgba(248,250,252,0.5)' }}>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} labels={{ prev: L('Zurück', 'Previous'), next: L('Weiter', 'Next') }} />
        </View>
      ) : null}
    </View>
  )
}
