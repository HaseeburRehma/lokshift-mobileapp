/**
 * Calendar tab — full month grid with day-event dots, mirroring the
 * webapp's mobile-responsive calendar screen.
 *
 * Header:
 *   "Mai 2026" (current month, 26px bold)
 *   ← / Heute / → controls
 *   + Ereignis hinzufügen (admin/dispatcher only — links to /plans/new)
 *
 * Grid:
 *   7-column Su…Sa header (slate-400 9px caps),
 *   6 rows of day cells (auto-padded with prev/next month days at the
 *   edges, dimmed), today highlighted with a blue circle, dots under
 *   day numbers that have plans.
 *
 * Tapping a day filters the list below the grid to that day's plans.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft, ChevronRight, Plus, Briefcase, MapPin, ArrowRight, CalendarPlus,
} from 'lucide-react-native'
import {
  addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import type { Plan, CalendarEvent } from '@/lib/types'

export default function CalendarScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const router = useRouter()
  const { profile, session, role, isAdmin, isDispatcher } = useUser()
  const canCreate = canCreatePlans(role)

  const [cursor, setCursor] = useState<Date>(new Date())
  const [selectedDay, setSelectedDay] = useState<Date>(new Date())
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)

  // Generic events shown alongside plans on the same day grid.
  const monthStartIso = useMemo(() => startOfMonth(cursor).toISOString(), [cursor])
  const monthEndIso = useMemo(() => endOfMonth(cursor).toISOString(), [cursor])
  const { events: calendarEvents } = useCalendarEvents(monthStartIso, monthEndIso)

  const fetchPlans = async () => {
    if (!profile?.organization_id || !session?.user?.id) return
    setLoading(true)
    const start = startOfMonth(cursor).toISOString()
    const end = endOfMonth(cursor).toISOString()
    let q = getSupabase()
      .from('plans')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name)')
      .eq('organization_id', profile.organization_id)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: true })
    if (!(isAdmin || isDispatcher)) q = q.eq('employee_id', session.user.id)
    const { data } = await q
    setPlans((data ?? []) as Plan[])
    setLoading(false)
  }

  useEffect(() => {
    fetchPlans()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.organization_id, session?.user?.id, cursor.getFullYear(), cursor.getMonth()])

  // Compose the 6-row grid: every day from the first Sunday of the
  // displayed week-of-month-start to the last Saturday after month-end.
  const grid = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
    const days: Date[] = []
    const cursorDay = new Date(gridStart)
    while (cursorDay <= gridEnd) {
      days.push(new Date(cursorDay))
      cursorDay.setDate(cursorDay.getDate() + 1)
    }
    // Pad to multiples of 7 (always 42 cells for visual consistency)
    while (days.length < 42) {
      days.push(new Date(days[days.length - 1].getTime() + 86_400_000))
    }
    return days
  }, [cursor])

  const plansByDay = useMemo(() => {
    const m = new Map<string, Plan[]>()
    for (const p of plans) {
      const key = p.start_time.slice(0, 10)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return m
  }, [plans])

  // Expand multi-day events into a per-day map so a vacation that spans
  // a week shows up on each day's list, not only on the start day.
  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of calendarEvents) {
      const start = parseISO(e.start_time)
      const end = parseISO(e.end_time)
      const day = new Date(start)
      while (day <= end) {
        const key = format(day, 'yyyy-MM-dd')
        if (!m.has(key)) m.set(key, [])
        m.get(key)!.push(e)
        day.setDate(day.getDate() + 1)
      }
    }
    return m
  }, [calendarEvents])

  const selectedDayKey = format(selectedDay, 'yyyy-MM-dd')
  const dayPlans = plansByDay.get(selectedDayKey) ?? []
  const dayEvents = eventsByDay.get(selectedDayKey) ?? []
  const dayItemCount = dayPlans.length + dayEvents.length

  const weekdays = locale === 'de'
    ? ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
    : ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

  const today = new Date()

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPlans} tintColor="#0064E0" />}
      >
        {/* Header row — month label + nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text style={{ fontSize: 26, fontWeight: '900', color: '#0F172A', letterSpacing: -0.5 }}>
            {format(cursor, 'MMMM yyyy', { locale: dateLocale })}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderRadius: 999, padding: 4 }}>
            <Pressable onPress={() => setCursor(addMonths(cursor, -1))} hitSlop={6} style={{ padding: 6 }}>
              <ChevronLeft size={16} color="#0F172A" />
            </Pressable>
            <Pressable
              onPress={() => { setCursor(new Date()); setSelectedDay(new Date()) }}
              style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFFFFF' }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                {L('Heute', 'Today')}
              </Text>
            </Pressable>
            <Pressable onPress={() => setCursor(addMonths(cursor, 1))} hitSlop={6} style={{ padding: 6 }}>
              <ChevronRight size={16} color="#0F172A" />
            </Pressable>
          </View>
        </View>

        {/* Add row — anyone can add a calendar event; managerial roles
            also get a "Plan" pill. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {canCreate && (
            <Pressable
              onPress={() => router.push('/plans/new')}
              style={({ pressed }: { pressed: boolean }) => ({
                backgroundColor: '#0064E0', borderRadius: 999,
                paddingHorizontal: 16, paddingVertical: 9,
                flexDirection: 'row', alignItems: 'center', gap: 6,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 }}>
                {L('Plan', 'Plan')}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() =>
              router.push(
                `/calendar-events/new?date=${format(selectedDay, 'yyyy-MM-dd')}` as any,
              )
            }
            style={({ pressed }: { pressed: boolean }) => ({
              backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1.5, borderColor: '#0064E0',
              paddingHorizontal: 16, paddingVertical: 9,
              flexDirection: 'row', alignItems: 'center', gap: 6,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <CalendarPlus size={14} color="#0064E0" />
            <Text style={{ color: '#0064E0', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 }}>
              {L('Termin', 'Event')}
            </Text>
          </Pressable>
        </View>

        {/* Weekday headers */}
        <View style={{ flexDirection: 'row', marginBottom: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 8 }}>
          {weekdays.map((wd) => (
            <View key={wd} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2 }}>
                {wd}
              </Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        <View style={{ borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 12, overflow: 'hidden' }}>
          {Array.from({ length: 6 }).map((_, row) => (
            <View key={row} style={{ flexDirection: 'row', borderBottomWidth: row === 5 ? 0 : 1, borderBottomColor: '#F1F5F9' }}>
              {grid.slice(row * 7, row * 7 + 7).map((day, col) => {
                const inMonth = isSameMonth(day, cursor)
                const isToday = isSameDay(day, today)
                const isSelected = isSameDay(day, selectedDay)
                const hasEvents = plansByDay.has(format(day, 'yyyy-MM-dd'))
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => setSelectedDay(day)}
                    style={{
                      flex: 1, height: 56, borderRightWidth: col === 6 ? 0 : 1, borderRightColor: '#F1F5F9',
                      alignItems: 'center', justifyContent: 'center', gap: 2,
                    }}
                  >
                    <View
                      style={{
                        width: 28, height: 28, borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isSelected ? '#0064E0' : 'transparent',
                        borderWidth: isToday && !isSelected ? 1.5 : 0,
                        borderColor: '#0064E0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13, fontWeight: isSelected || isToday ? '900' : '700',
                          color: isSelected
                            ? '#FFFFFF'
                            : isToday
                              ? '#0064E0'
                              : inMonth
                                ? '#0F172A'
                                : '#CBD5E1',
                        }}
                      >
                        {format(day, 'd')}
                      </Text>
                    </View>
                    {(() => {
                      const dayKey = format(day, 'yyyy-MM-dd')
                      const hasPlan = plansByDay.has(dayKey)
                      const hasEvent = eventsByDay.has(dayKey)
                      if (!hasPlan && !hasEvent) return null
                      if (isSelected) return null
                      return (
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {hasPlan && (
                            <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#0064E0' }} />
                          )}
                          {hasEvent && (
                            <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: '#F59E0B' }} />
                          )}
                        </View>
                      )
                    })()}
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>

        {/* Selected day's plans */}
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
            {format(selectedDay, locale === 'de' ? 'EEEE, d. MMMM' : 'EEEE, MMMM d', { locale: dateLocale })}
          </Text>

          {dayItemCount === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28 } as any}>
              <Text style={{ color: '#94A3B8', fontSize: 13 }}>
                {L('Keine Pläne oder Termine an diesem Tag.', 'No plans or events on this day.')}
              </Text>
            </Card>
          ) : (
            <>
              {dayPlans.map((p) => (
                <Pressable key={`plan-${p.id}`} onPress={() => router.push(`/plans/${p.id}` as any)}>
                  <Card style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center' } as any}>
                    <View style={{
                      width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF',
                      alignItems: 'center', justifyContent: 'center', marginRight: 12,
                    }}>
                      <Briefcase size={18} color="#0064E0" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>
                        {p.customer?.name ?? L('Einsatz', 'Shift')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                        {format(parseISO(p.start_time), 'HH:mm')} – {format(parseISO(p.end_time), 'HH:mm')}
                      </Text>
                      {p.location && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                          <MapPin size={11} color="#94A3B8" />
                          <Text style={{ fontSize: 11, color: '#94A3B8' }}>{p.location}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <StatusBadge status={p.status} />
                      <ArrowRight size={14} color="#CBD5E1" style={{ marginTop: 6 }} />
                    </View>
                  </Card>
                </Pressable>
              ))}
              {dayEvents.map((e) => {
                const color = e.color || '#0064E0'
                return (
                  <Pressable
                    key={`event-${e.id}`}
                    onPress={() => router.push(`/calendar-events/${e.id}` as any)}
                  >
                    <Card style={{ marginBottom: 8, flexDirection: 'row', alignItems: 'center' } as any}>
                      <View
                        style={{
                          width: 40, height: 40, borderRadius: 12,
                          backgroundColor: `${color}22`,
                          alignItems: 'center', justifyContent: 'center', marginRight: 12,
                        }}
                      >
                        <CalendarPlus size={18} color={color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>
                          {e.title}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                          {e.is_all_day
                            ? L('Ganztägig', 'All day')
                            : `${format(parseISO(e.start_time), 'HH:mm')} – ${format(parseISO(e.end_time), 'HH:mm')}`}
                        </Text>
                        {e.location && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
                            <MapPin size={11} color="#94A3B8" />
                            <Text style={{ fontSize: 11, color: '#94A3B8' }}>{e.location}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                        <View
                          style={{
                            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                            backgroundColor: `${color}1F`,
                          }}
                        >
                          <Text
                            style={{
                              color, fontSize: 9, fontWeight: '900',
                              letterSpacing: 0.8, textTransform: 'uppercase',
                            }}
                          >
                            {e.event_type}
                          </Text>
                        </View>
                        <ArrowRight size={14} color="#CBD5E1" style={{ marginTop: 6 }} />
                      </View>
                    </Card>
                  </Pressable>
                )
              })}
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}
