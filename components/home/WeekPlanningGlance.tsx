/**
 * "Aktuelle Wochenplanung" on the manager home (Kundenfeedback Punkt 10:
 * "Zuerst anzeigen: Laut Planung aktuell im Einsatz und die aktuelle
 * Wochenplanung").
 *
 * Same numbers as the webapp's dashboard week strip (shifts per day,
 * "N offen" for unassigned ones) plus the shifts of every day — employee
 * + time, "Unbesetzt" highlighted — in 7 swipeable day columns. Data
 * comes from the shared usePlanningWeek hook (realtime + app-resume
 * refresh included). Tapping a day opens the weekly dashboard on it.
 */

import React, { useMemo, useRef } from 'react'
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarRange, ChevronRight } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import type { Plan } from '@/lib/types'
import { usePlanningWeek } from '@/hooks/usePlanningWeek'
import { isoWeek, planStartDay, weekDays, weekStartOf } from '@/lib/plans/week'
import { addDays, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatTimeOfDay, weekdayName } from '@/lib/time/format'

const COLUMN_WIDTH = 136
const MAX_PER_DAY = 6

/** Left accent per plan status — same tones as the web PlanCard borders. */
const STATUS_ACCENT: Record<string, string> = {
  confirmed: '#10B981',
  rejected: '#EF4444',
  assigned: '#F59E0B',
  draft: '#94A3B8',
}

export function WeekPlanningGlance() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const today = localDateKey()
  const weekStart = useMemo(() => weekStartOf(today), [today])
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const { plans, loading } = usePlanningWeek(weekStart)
  const scrollRef = useRef<ScrollView | null>(null)
  const didAutoScroll = useRef(false)

  const byDay = useMemo(() => {
    const m = new Map<string, Plan[]>()
    for (const d of days) m.set(d, [])
    for (const p of plans) {
      const d = planStartDay(p)
      const list = m.get(d)
      if (list) list.push(p)
    }
    return m
  }, [plans, days])

  const todayIndex = Math.max(0, days.indexOf(today))
  const openDay = (day: string) => router.push(`/dashboard?date=${day}` as any)

  const range = `${formatDateDE(weekStart).slice(0, 6)} – ${formatDateDE(addDays(weekStart, 6)).slice(0, 6)}`

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <CalendarRange size={16} color="#2563EB" />
          <View style={{ marginLeft: 6, flexShrink: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>
              {L('Aktuelle Wochenplanung', 'This week')}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>
              {L('KW', 'CW')} {isoWeek(weekStart)} · {range}
            </Text>
          </View>
        </View>
        <Pressable onPress={() => router.push('/dashboard' as any)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Wochenplanung', 'Weekly planning')}</Text>
          <ChevronRight size={14} color="#0064E0" />
        </Pressable>
      </View>

      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingVertical: 12 }}>
        {/* Week strip — same as the web dashboard: shifts per day + "offen". */}
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: 12 }}>
          {days.map((d, i) => {
            const list = byDay.get(d) ?? []
            const open = list.filter((p) => !p.employee_id).length
            const isToday = d === today
            return (
              <Pressable
                key={d}
                onPress={() => scrollRef.current?.scrollTo({ x: i * (COLUMN_WIDTH + 8), animated: true })}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  paddingVertical: 6,
                  alignItems: 'center',
                  backgroundColor: isToday ? '#EFF6FF' : '#F8FAFC',
                  borderWidth: 1,
                  borderColor: isToday ? '#BFDBFE' : '#F8FAFC',
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '900', color: '#94A3B8' }}>{weekdayName(d, locale, true).toUpperCase()}</Text>
                <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>{formatDateDE(d).slice(0, 5)}</Text>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>{loading ? '–' : String(list.length)}</Text>
                {open > 0 ? (
                  <Text style={{ fontSize: 8, fontWeight: '900', color: '#B45309' }}>
                    {open} {L('offen', 'open')}
                  </Text>
                ) : null}
              </Pressable>
            )
          })}
        </View>

        <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 }} />

        {/* Shifts per day — horizontally swipeable day columns. */}
        {loading ? (
          <ActivityIndicator color="#0064E0" style={{ marginVertical: 20 }} />
        ) : (
          <ScrollView
            ref={(r) => {
              scrollRef.current = r
            }}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            onContentSizeChange={() => {
              // Start on today's column once; later data refreshes keep
              // whatever the user scrolled to.
              if (didAutoScroll.current) return
              didAutoScroll.current = true
              if (todayIndex > 0) scrollRef.current?.scrollTo({ x: todayIndex * (COLUMN_WIDTH + 8), animated: false })
            }}
          >
            {days.map((d) => {
              const list = byDay.get(d) ?? []
              const isToday = d === today
              const shown = list.slice(0, MAX_PER_DAY)
              const more = list.length - shown.length
              return (
                <Pressable key={d} onPress={() => openDay(d)}>
                  <View
                    style={{
                      width: COLUMN_WIDTH,
                      minHeight: 120,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isToday ? '#BFDBFE' : '#F1F5F9',
                      backgroundColor: isToday ? '#F5F9FF' : '#FFFFFF',
                      padding: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', color: isToday ? '#0064E0' : '#334155' }}>
                        {isToday ? L('Heute', 'Today') : weekdayName(d, locale, true)}, {formatDateDE(d).slice(0, 6)}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8' }}>{String(list.length)}</Text>
                    </View>

                    {list.length === 0 ? (
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#CBD5E1', fontStyle: 'italic', marginTop: 4 }}>
                        {L('Keine Schichten', 'No shifts')}
                      </Text>
                    ) : (
                      shown.map((p) => {
                        const unassigned = !p.employee_id
                        const label = p.shift_name || p.route || p.customer?.name || null
                        return (
                          <View
                            key={p.id}
                            style={{
                              borderRadius: 8,
                              borderLeftWidth: 3,
                              borderLeftColor: unassigned ? '#F59E0B' : STATUS_ACCENT[p.status] ?? '#F59E0B',
                              backgroundColor: unassigned ? '#FFFBEB' : '#F8FAFC',
                              paddingHorizontal: 6,
                              paddingVertical: 4,
                              marginBottom: 4,
                            }}
                          >
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569' }} numberOfLines={1}>
                              {formatTimeOfDay(p.start_time)}–{formatTimeOfDay(p.end_time)}
                            </Text>
                            <Text
                              style={{ fontSize: 11, fontWeight: '900', color: unassigned ? '#B45309' : '#0F172A' }}
                              numberOfLines={1}
                            >
                              {unassigned ? L('Unbesetzt', 'Unassigned') : p.employee?.full_name ?? '—'}
                            </Text>
                            {label ? (
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#0064E0' }} numberOfLines={1}>
                                {label}
                              </Text>
                            ) : null}
                          </View>
                        )
                      })
                    )}
                    {more > 0 ? (
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#0064E0', marginTop: 2 }}>
                        + {more} {L('weitere', 'more')}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            })}
          </ScrollView>
        )}
      </View>
    </View>
  )
}
