/**
 * Monthly daily breakdown — drill-in target from /account.
 *
 * Mirrors the webapp's MonthlyBreakdown view of /dashboard/time-account:
 *   - Back nav bar with the month name (web mobile layout)
 *   - Title + "Tägliche Einsatzdaten"
 *   - 4 stat cards: Geplante Stunden · Tatsächliche Stunden · Differenz ·
 *     Bezahlte Überstunden (hours above 8 per worked day)
 *   - "Tägliche Übersicht" card, one row per day (Geplant · Tatsächlich ·
 *     Differenz), weekends muted, 10 days per page
 *
 * Data:
 *   - Scheduled hours per day come from `plans` rows that start on the
 *     date (an overnight plan counts to its start day).
 *   - Actual hours per day come from `time_entries` rows (uses
 *     `net_hours`, identical to the time engines).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { parse, format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, isWeekend } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { BackNavBar, C, Pagination } from '@/components/time/ui'
import { StatCard } from '@/components/time/account'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

interface DayRow {
  date: Date
  scheduled: number
  actual: number
}

const DAYS_PER_PAGE = 10

export default function MonthlyDetailScreen() {
  const { month, employeeId } = useLocalSearchParams<{ month: string; employeeId?: string }>()
  const goBack = useSafeBack('/account')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const hrs = L('Std.', 'hrs')

  const targetEmployeeId = employeeId ?? session?.user?.id ?? null

  const [days, setDays] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [page, setPage] = useState(1)

  const monthName = useMemo(() => {
    if (!month) return ''
    try {
      return format(parse(month, 'yyyy-MM', new Date()), 'MMMM yyyy', { locale: dateLocale })
    } catch {
      return month
    }
  }, [month, dateLocale])

  useEffect(() => {
    let alive = true
    if (!month || !targetEmployeeId) {
      setLoading(false)
      setNotFound(true)
      return
    }
    let parsed: Date
    try {
      parsed = parse(month, 'yyyy-MM', new Date())
      if (isNaN(parsed.getTime())) throw new Error('invalid')
    } catch {
      setNotFound(true)
      setLoading(false)
      return
    }
    const start = startOfMonth(parsed)
    const end = endOfMonth(parsed)
    const startStr = format(start, 'yyyy-MM-dd')
    const endStr = format(end, 'yyyy-MM-dd')
    ;(async () => {
      setLoading(true)
      const supabase = getSupabase()
      const [entriesRes, plansRes] = await Promise.all([
        supabase
          .from('time_entries')
          .select('date, net_hours')
          .eq('employee_id', targetEmployeeId)
          .gte('date', startStr)
          .lte('date', endStr),
        supabase
          .from('plans')
          .select('start_time, end_time, status')
          .eq('employee_id', targetEmployeeId)
          .gte('start_time', `${startStr}T00:00:00`)
          .lte('start_time', `${endStr}T23:59:59`)
          .neq('status', 'cancelled')
          .neq('status', 'rejected'),
      ])

      if (!alive) return

      if (entriesRes.error) console.warn('[account/month] entries fetch failed:', entriesRes.error.message)
      if (plansRes.error) console.warn('[account/month] plans fetch failed:', plansRes.error.message)

      const allDays = eachDayOfInterval({ start, end })
      const built: DayRow[] = allDays.map((d) => {
        const actual = (entriesRes.data ?? [])
          .filter((e: any) => {
            try {
              return isSameDay(new Date(`${e.date}T00:00:00`), d)
            } catch {
              return false
            }
          })
          .reduce((s: number, e: any) => s + (Number(e.net_hours) || 0), 0)

        const scheduled = (plansRes.data ?? [])
          .filter((p: any) => {
            try {
              return isSameDay(new Date(p.start_time), d)
            } catch {
              return false
            }
          })
          .reduce((s: number, p: any) => {
            try {
              const ms = new Date(p.end_time).getTime() - new Date(p.start_time).getTime()
              return s + Math.max(0, ms) / 3_600_000
            } catch {
              return s
            }
          }, 0)

        return { date: d, scheduled, actual }
      })

      setDays(built)
      setPage(1)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [month, targetEmployeeId])

  const totals = useMemo(() => {
    const scheduled = days.reduce((s, r) => s + r.scheduled, 0)
    const actual = days.reduce((s, r) => s + r.actual, 0)
    // Paid overtime = hours above 8 per worked day (same rule as the web view).
    const paidOvertime = days.reduce((s, r) => s + (r.actual > 8 ? r.actual - 8 : 0), 0)
    return { scheduled, actual, difference: actual - scheduled, paidOvertime }
  }, [days])

  if (notFound) {
    return (
      <Screen background="#FFFFFF" className="px-6 items-center justify-center" noTapToDismiss>
        <Text style={{ color: C.slate400, textAlign: 'center', fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>
          {L('Daten nicht verfügbar', 'Data no longer available')}
        </Text>
        <Pressable onPress={goBack} style={{ marginTop: 16 }}>
          <Text style={{ color: C.blue600, fontWeight: '800' }}>{L('Zurück', 'Back')}</Text>
        </Pressable>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color={C.blue600} />
      </Screen>
    )
  }

  const totalPages = Math.max(1, Math.ceil(days.length / DAYS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pageDays = days.slice((safePage - 1) * DAYS_PER_PAGE, safePage * DAYS_PER_PAGE)
  const signedHrs = (n: number) => (n > 0 ? `+${n.toFixed(1)} ${hrs}` : `${n.toFixed(1)} ${hrs}`)

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <BackNavBar title={monthName} onBack={goBack} backLabel={L('Zurück zur Übersicht', 'Back to Overview')} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }}>
        {/* Title */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: C.slate900, letterSpacing: -0.5, lineHeight: 30 }}>{monthName}</Text>
          <Text style={{ fontSize: 13, color: C.slate500, marginTop: 4 }}>{L('Tägliche Einsatzdaten', 'Daily operational records')}</Text>
        </View>

        {/* Summary stats */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard size={22} label={L('Geplante Stunden', 'Scheduled Hours')} value={`${totals.scheduled.toFixed(1)} ${hrs}`} />
            <StatCard size={22} label={L('Tatsächliche Stunden', 'Actual Hours')} value={`${totals.actual.toFixed(1)} ${hrs}`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <StatCard
              size={22}
              label={L('Differenz', 'Difference')}
              value={totals.difference >= 0 ? `+${totals.difference.toFixed(1)} ${hrs}` : `${totals.difference.toFixed(1)} ${hrs}`}
              color={totals.difference >= 0 ? C.emerald500 : C.red500}
            />
            <StatCard size={22} label={L('Bezahlte Überstunden', 'Paid Overtime')} value={`${totals.paidOvertime.toFixed(1)} ${hrs}`} />
          </View>
        </View>

        {/* Daily breakdown */}
        <View style={{ marginTop: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.slate200, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.slate100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.slate900 }}>{L('Tägliche Übersicht', 'Daily Breakdown')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400 }}>
              {`${L('Tage', 'Days')} ${(safePage - 1) * DAYS_PER_PAGE + 1}–${Math.min(safePage * DAYS_PER_PAGE, days.length)} ${L('von', 'of')} ${days.length}`}
            </Text>
          </View>

          {pageDays.map((d, idx) => {
            const weekend = isWeekend(d.date)
            const diff = d.actual - d.scheduled
            const diffColor = diff > 0 ? C.emerald500 : diff < 0 ? C.red500 : C.slate400
            const diffText = diff === 0 ? `0 ${hrs}` : signedHrs(diff)
            let dayLabel = ''
            try {
              dayLabel = format(d.date, locale === 'de' ? 'EEE, dd. MMM' : 'EEE, MMM d', { locale: dateLocale })
            } catch {}
            return (
              <View
                key={d.date.toISOString()}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: C.slate100,
                  backgroundColor: weekend ? 'rgba(248,250,252,0.6)' : '#FFFFFF',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <View style={{ width: 4, height: 28, borderRadius: 2, marginRight: 10, backgroundColor: diff > 0 ? '#34D399' : diff < 0 ? C.red400 : C.slate200 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '600', color: weekend ? C.slate400 : C.slate900 }} numberOfLines={1}>{dayLabel}</Text>
                      {weekend ? <Text style={{ fontSize: 11, color: C.slate300, marginTop: 1 }}>{L('Wochenende', 'Weekend')}</Text> : null}
                    </View>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: diffColor, fontVariant: ['tabular-nums'], marginLeft: 8 }}>{diffText}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 24, marginTop: 10, marginLeft: 14 }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400 }}>{L('Geplant', 'Scheduled')}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate700, fontVariant: ['tabular-nums'] }}>{`${d.scheduled.toFixed(1)} ${hrs}`}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400 }}>{L('Tatsächlich', 'Actual')}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: C.slate900, fontVariant: ['tabular-nums'] }}>{`${d.actual.toFixed(1)} ${hrs}`}</Text>
                  </View>
                </View>
              </View>
            )
          })}

          {totalPages > 1 ? (
            <View style={{ paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.slate100, backgroundColor: 'rgba(248,250,252,0.5)' }}>
              <Pagination page={safePage} totalPages={totalPages} onChange={setPage} labels={{ prev: L('Zurück', 'Previous'), next: L('Weiter', 'Next') }} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  )
}
