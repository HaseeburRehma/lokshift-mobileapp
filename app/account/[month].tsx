/**
 * Monthly daily-breakdown — drill-in target from /account.
 *
 * Mirrors the webapp's /dashboard/time-account/[month] page:
 *   - UPPERCASE italic month-name header with a soft back button
 *   - Summary card: 2×2 grid of Scheduled · Actual · Variance · Status
 *     bar with a coloured progress fill
 *   - Daily Distribution list, one row per day, scheduled vs actual
 *
 * Data:
 *   - Scheduled hours per day come from `plans` rows that overlap the
 *     date (one row may span overnight; we sum the per-day slice).
 *   - Actual hours per day come from `time_entries` rows (uses
 *     `net_hours`, identical to the time engines).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Calendar, ChevronLeft } from 'lucide-react-native'
import {
  parse,
  format,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  isSameDay,
} from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

interface DayRow {
  date: Date
  scheduled: number
  actual: number
}

export default function MonthlyDetailScreen() {
  const { month, employeeId } = useLocalSearchParams<{ month: string; employeeId?: string }>()
  const goBack = useSafeBack('/account')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const dateLocale = locale === 'de' ? deLocale : enUS

  const targetEmployeeId = employeeId ?? session?.user?.id ?? null

  const [days, setDays] = useState<DayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

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
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [month, targetEmployeeId])

  const totals = useMemo(() => {
    const scheduled = days.reduce((s, r) => s + r.scheduled, 0)
    const actual = days.reduce((s, r) => s + r.actual, 0)
    return { scheduled, actual, difference: actual - scheduled }
  }, [days])

  if (notFound) {
    return (
      <Screen background="#FFFFFF" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center font-bold tracking-widest uppercase">
          {L('Daten nicht verfügbar', 'Data no longer available')}
        </Text>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color="#0064E0" />
      </Screen>
    )
  }

  const isPositive = totals.difference >= 0
  // Progress fill: actual / scheduled, capped at 100% so the bar never overshoots.
  // When there's no scheduled time, fall back to fully-filled if any actual exists.
  const progressPct =
    totals.scheduled > 0
      ? Math.min(100, (totals.actual / totals.scheduled) * 100)
      : totals.actual > 0
        ? 100
        : 0

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Navigation Header */}
        <View className="px-6 pt-4 pb-2 flex-row items-center">
          <Pressable
            onPress={goBack}
            style={({ pressed }: { pressed: boolean }) => ({
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? '#F3F4F6' : 'transparent',
            })}
            accessibilityLabel={L('Zurück', 'Back')}
          >
            <ChevronLeft size={24} color="#111827" />
          </Pressable>
          <Text
            className="text-gray-900 dark:text-white ml-2"
            style={{
              fontSize: 26,
              fontWeight: '900',
              letterSpacing: -0.5,
              textTransform: 'uppercase',
              fontStyle: 'italic',
            }}
          >
            {monthName}
          </Text>
        </View>

        {/* Summary card — 2x2 grid */}
        <View className="px-6 mb-8 mt-2">
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#F1F5F9',
              borderRadius: 32,
              padding: 24,
              shadowColor: '#0064E0',
              shadowOpacity: 0.05,
              shadowRadius: 28,
              shadowOffset: { width: 0, height: 18 },
              elevation: 4,
            }}
          >
            <View className="flex-row flex-wrap">
              <View style={{ width: '50%', marginBottom: 20 }}>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Soll', 'Scheduled')}
                </Text>
                <Text className="text-[22px] font-black text-gray-900 dark:text-white mt-1">
                  {totals.scheduled.toFixed(1)} {L('Std.', 'hrs')}
                </Text>
              </View>
              <View style={{ width: '50%', marginBottom: 20, alignItems: 'flex-end' }}>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Ist', 'Actual')}
                </Text>
                <Text className="text-[22px] font-black mt-1" style={{ color: '#0064E0' }}>
                  {totals.actual.toFixed(1)} {L('Std.', 'hrs')}
                </Text>
              </View>
              <View style={{ width: '50%' }}>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Abweichung', 'Variance')}
                </Text>
                <Text
                  className="text-[22px] font-black mt-1"
                  style={{ color: isPositive ? '#059669' : '#DC2626' }}
                >
                  {isPositive ? '+' : ''}
                  {totals.difference.toFixed(1)} {L('Std.', 'hrs')}
                </Text>
              </View>
              <View style={{ width: '50%', alignItems: 'flex-end' }}>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Status', 'Status')}
                </Text>
                <View
                  style={{
                    marginTop: 8,
                    height: 8,
                    width: 96,
                    borderRadius: 999,
                    backgroundColor: '#F1F5F9',
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      backgroundColor: isPositive ? '#10B981' : '#EF4444',
                    }}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Daily Distribution */}
        <View className="px-6 mb-2 flex-row items-center">
          <Text
            className="text-gray-400 dark:text-slate-500"
            style={{
              fontSize: 12,
              fontWeight: '900',
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              fontStyle: 'italic',
            }}
          >
            {L('Tagesübersicht', 'Daily Distribution')}
          </Text>
          <Calendar size={12} color="#94A3B8" style={{ marginLeft: 8, opacity: 0.6 }} />
        </View>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: '#F1F5F9',
          }}
        >
          {days.map((d) => {
            const variance = d.actual - d.scheduled
            const hasData = d.scheduled > 0 || d.actual > 0
            const varianceColor = variance >= 0 ? '#10B981' : '#F97316'
            return (
              <View
                key={d.date.toISOString()}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 24,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderColor: '#F8FAFC',
                }}
              >
                <View style={{ width: 48 }}>
                  <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                    {format(d.date, 'EEE', { locale: dateLocale })}
                  </Text>
                  <Text className="text-[18px] font-black text-gray-900 dark:text-white">
                    {format(d.date, 'd')}
                  </Text>
                </View>
                <View className="flex-1 ml-3">
                  <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
                    {d.scheduled.toFixed(1)} h / {d.actual.toFixed(1)} h
                  </Text>
                  <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 uppercase tracking-widest font-black">
                    {L('Soll · Ist', 'Scheduled · Actual')}
                  </Text>
                </View>
                {hasData && (
                  <Text className="text-[14px] font-black" style={{ color: varianceColor }}>
                    {variance >= 0 ? '+' : ''}
                    {variance.toFixed(1)} h
                  </Text>
                )}
              </View>
            )
          })}
        </View>
      </ScrollView>
    </Screen>
  )
}
