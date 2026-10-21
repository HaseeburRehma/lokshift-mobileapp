/**
 * Calendar tab — mobile port of the webapp's /dashboard/calendar
 * (CalendarHeader + CalendarGrid + CalendarEventList).
 *
 * Header:
 *   "Oktober 2026" (capitalised month, black slate-900)
 *   segmented ‹ Heute › control
 *   "Ereignis hinzufügen" (+ "Schicht anlegen" for admin/dispatch)
 *
 * Grid (Sunday-first like the web): white rounded card, SO…SA header row,
 * 6 rows of day cells, today = filled blue circle, selected = blue ring,
 * other-month days dimmed, a blue dot when the day has entries.
 *
 * List: "20. Oktober 2026" + "N Termine" pill, then shifts (pink, like
 * the web's mapped plans) and calendar events as tinted rows with type
 * icon, title, reminder bell, location, members and the time column.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, RefreshControl, Image } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft, ChevronRight, Plus, MapPin, Clock, Bell, Users as UsersIcon, CalendarDays,
} from 'lucide-react-native'
import {
  addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { localDateKey } from '@/lib/time/shift-hours'
import { EVENT_COLORS, type Plan, type CalendarEvent } from '@/lib/types'

type MemberLite = { id: string; full_name: string | null; avatar_url: string | null }

/** One row of the selected-day list — a calendar event or a shift. */
interface DayItem {
  key: string
  kind: 'plan' | 'event'
  id: string
  title: string
  color: string
  eventType: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  reminder: boolean
  members: MemberLite[]
}

const TYPE_EMOJI: Record<string, string> = {
  birthday: '🎂',
  meeting: '👥',
  sick_leave: '🏥',
  event: '📅',
  holiday: '📅',
  other: '📅',
}

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

  // Local day of the shift start (not the UTC date of the ISO string).
  const plansByDay = useMemo(() => {
    const m = new Map<string, Plan[]>()
    for (const p of plans) {
      const key = localDateKey(new Date(p.start_time))
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

  // Same order as the web list: calendar events and shifts by start time.
  const dayItems: DayItem[] = useMemo(() => {
    const out: DayItem[] = []
    for (const p of plansByDay.get(selectedDayKey) ?? []) {
      out.push({
        key: `plan-${p.id}`,
        kind: 'plan',
        id: p.id,
        title: p.route || p.shift_name || p.customer?.name || L('Schicht', 'Work Shift'),
        color: EVENT_COLORS.shift,
        eventType: 'shift',
        start: p.start_time,
        end: p.end_time,
        allDay: false,
        location: p.location || null,
        reminder: false,
        members: p.employee ? [p.employee] : [],
      })
    }
    for (const e of eventsByDay.get(selectedDayKey) ?? []) {
      out.push({
        key: `event-${e.id}`,
        kind: 'event',
        id: e.id,
        title: e.title,
        color: e.color || EVENT_COLORS.event,
        eventType: e.event_type,
        start: e.start_time,
        end: e.end_time,
        allDay: !!e.is_all_day,
        location: e.location || null,
        reminder: e.reminder_minutes_before != null,
        members: ((e as any).members ?? [])
          .map((m: any) => m?.user)
          .filter((u: any): u is MemberLite => !!u && !!u.id),
      })
    }
    return out.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansByDay, eventsByDay, selectedDayKey, locale])

  const weekdays = locale === 'de'
    ? ['SO', 'MO', 'DI', 'MI', 'DO', 'FR', 'SA']
    : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  const today = new Date()
  // date-fns instead of toLocaleString — Hermes' Intl coverage varies.
  const monthYear = format(cursor, 'LLLL yyyy', { locale: dateLocale })
  const monthLabel = monthYear.charAt(0).toUpperCase() + monthYear.slice(1)
  const dateHeading = format(selectedDay, locale === 'de' ? 'd. MMMM yyyy' : 'MMMM d, yyyy', { locale: dateLocale })
  const count = dayItems.length

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPlans} tintColor="#0064E0" />}
      >
        {/* Header — month label + segmented nav */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', letterSpacing: -0.5, flexShrink: 1 }} numberOfLines={1}>
            {monthLabel}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 16, padding: 4 }}>
            <Pressable onPress={() => setCursor(addMonths(cursor, -1))} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={20} color="#111827" />
            </Pressable>
            <Pressable
              onPress={() => { setCursor(new Date()); setSelectedDay(new Date()) }}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 12, marginHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{L('Heute', 'Today')}</Text>
            </Pressable>
            <Pressable onPress={() => setCursor(addMonths(cursor, 1))} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={20} color="#111827" />
            </Pressable>
          </View>
        </View>

        {/* Actions — "Ereignis hinzufügen" (web) + "Schicht anlegen" for
            admin/dispatch (the web picks the shift type in the same sheet). */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <Pressable onPress={() => router.push(`/calendar-events/new?date=${selectedDayKey}` as any)}>
            <View style={{ height: 44, borderRadius: 12, paddingHorizontal: 18, backgroundColor: '#0064E0', flexDirection: 'row', alignItems: 'center' }}>
              <Plus size={18} color="#FFFFFF" />
              <Text style={{ marginLeft: 6, color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                {L('Ereignis hinzufügen', 'New Event')}
              </Text>
            </View>
          </Pressable>
          {canCreate ? (
            <Pressable onPress={() => router.push(`/plans/new?date=${selectedDayKey}` as any)}>
              <View style={{ height: 44, borderRadius: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center' }}>
                <Clock size={16} color="#4B5563" />
                <Text style={{ marginLeft: 6, color: '#4B5563', fontSize: 13, fontWeight: '700' }}>
                  {L('Schicht anlegen', 'Add shift')}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </View>

        {/* Grid card */}
        <View style={{ borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 28, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', backgroundColor: '#FAFAFB', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
            {weekdays.map((wd) => (
              <View key={wd} style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#9CA3AF', letterSpacing: 1.5 }}>{wd}</Text>
              </View>
            ))}
          </View>
          {Array.from({ length: 6 }).map((_, row) => (
            <View key={row} style={{ flexDirection: 'row', borderBottomWidth: row === 5 ? 0 : 1, borderBottomColor: '#F3F4F6' }}>
              {grid.slice(row * 7, row * 7 + 7).map((day, col) => {
                const inMonth = isSameMonth(day, cursor)
                const isToday = isSameDay(day, today)
                const isSelected = isSameDay(day, selectedDay)
                const dayKey = format(day, 'yyyy-MM-dd')
                const hasItems = plansByDay.has(dayKey) || eventsByDay.has(dayKey)
                return (
                  <Pressable
                    key={day.toISOString()}
                    onPress={() => setSelectedDay(day)}
                    style={{
                      flex: 1, height: 64, paddingTop: 8, alignItems: 'center',
                      borderRightWidth: col === 6 ? 0 : 1, borderRightColor: '#F3F4F6',
                      backgroundColor: isSelected ? 'rgba(239,246,255,0.6)' : inMonth ? '#FFFFFF' : '#FAFAFB',
                      opacity: inMonth ? 1 : 0.4,
                    }}
                  >
                    <View
                      style={{
                        width: 26, height: 26, borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isToday ? '#0064E0' : 'transparent',
                        borderWidth: isSelected && !isToday ? 2 : 0,
                        borderColor: '#0064E0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12, fontWeight: '700',
                          color: isToday ? '#FFFFFF' : isSelected ? '#0064E0' : '#6B7280',
                        }}
                      >
                        {format(day, 'd')}
                      </Text>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 8 }}>
                      {hasItems ? <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#0064E0' }} /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </View>

        {/* Selected day's list */}
        <View style={{ marginTop: 28 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 14, marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827', flexShrink: 1 }} numberOfLines={1}>{dateHeading}</Text>
            <View style={{ backgroundColor: '#F3F4F6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginLeft: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF' }}>
                {count}{' '}
                {locale === 'de' ? (count === 1 ? 'Termin' : 'Termine') : (count === 1 ? 'Event' : 'Events')}
              </Text>
            </View>
          </View>

          {count === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 36 }}>
              <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <CalendarDays size={34} color="#D1D5DB" />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>
                {L('Keine Ereignisse', 'No Events Today')}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#9CA3AF', textAlign: 'center', maxWidth: 220, marginTop: 4, lineHeight: 17 }}>
                {L('Genießen Sie Ihren Tag oder fügen Sie ein neues Ereignis hinzu.', 'Enjoy your day or add a new event using the button above.')}
              </Text>
            </View>
          ) : (
            dayItems.map((it) => (
              <Pressable
                key={it.key}
                onPress={() => router.push((it.kind === 'plan' ? `/plans/${it.id}` : `/calendar-events/${it.id}`) as any)}
              >
                <View
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    padding: 16, marginBottom: 12, borderRadius: 20,
                    backgroundColor: `${it.color}0D`, borderLeftWidth: 5, borderLeftColor: it.color,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        width: 40, height: 40, borderRadius: 16, marginRight: 14,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: `${it.color}26`, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
                      }}
                    >
                      {it.eventType === 'shift' ? (
                        <Clock size={20} color={it.color} />
                      ) : (
                        <Text style={{ fontSize: 18 }}>{TYPE_EMOJI[it.eventType] ?? '📅'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
                          {it.title}
                        </Text>
                        {it.reminder ? <Bell size={12} color="#F59E0B" style={{ marginLeft: 6 }} /> : null}
                      </View>
                      {it.location || it.members.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 8 }}>
                          {it.location ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                              <MapPin size={11} color="#9CA3AF" />
                              <Text style={{ marginLeft: 3, fontSize: 10, fontWeight: '500', color: '#9CA3AF', flexShrink: 1 }} numberOfLines={1}>
                                {it.location}
                              </Text>
                            </View>
                          ) : null}
                          {it.members.length > 0 ? <SharedWith members={it.members} /> : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                    {it.allDay ? (
                      <Text style={{ fontSize: 11, fontWeight: '900', color: '#9CA3AF', letterSpacing: 1, textTransform: 'uppercase' }}>
                        {L('Ganztägig', 'All day')}
                      </Text>
                    ) : (
                      <>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#111827' }}>{format(parseISO(it.start), 'HH:mm')}</Text>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9CA3AF', marginTop: 3 }}>– {format(parseISO(it.end), 'HH:mm')}</Text>
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

/** "Shared with" avatar strip — max 3 faces + overflow, like the web. */
function SharedWith({ members }: { members: MemberLite[] }) {
  const visible = members.slice(0, 3)
  const overflow = members.length - visible.length
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <UsersIcon size={11} color="#9CA3AF" />
      <View style={{ flexDirection: 'row', marginLeft: 4 }}>
        {visible.map((m, i) => (
          <View
            key={m.id}
            style={{
              width: 16, height: 16, borderRadius: 999, marginLeft: i === 0 ? 0 : -5,
              borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#F3F4F6',
              alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}
          >
            {m.avatar_url ? (
              <Image source={{ uri: m.avatar_url }} style={{ width: 16, height: 16 }} />
            ) : (
              <Text style={{ fontSize: 8, fontWeight: '900', color: '#6B7280' }}>{m.full_name?.[0]?.toUpperCase() || '?'}</Text>
            )}
          </View>
        ))}
        {overflow > 0 ? (
          <View style={{ width: 16, height: 16, borderRadius: 999, marginLeft: -5, borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 8, fontWeight: '900', color: '#6B7280' }}>+{overflow}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}
