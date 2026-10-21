/**
 * Wochenplanung (Kundenfeedback Punkte 7 + 8) — admin & dispatch.
 * Mobile replica of the webapp's app/dashboard/plans/week/page.tsx.
 *
 * Employees in rows, Monday–Sunday side by side. Shifts appear on the day
 * they start (local calendar day); night shifts show "+1" on the card and
 * a "↳ bis 06:00" continuation chip on the next day. Vacation / sick days
 * are drawn into the cells, unassigned shifts get their own row. The
 * employee column and the day header row stay visible while scrolling:
 * the name column lives outside the horizontal ScrollView, the day header
 * is a sticky header of the vertical ScrollView whose content follows the
 * grid's horizontal offset (native-driven Animated value).
 *
 *   Tap empty cell        → /plans/new with employee + date prefilled
 *   Tap shift             → /plans/[id] detail
 *   Long-press shift      → quick-action sheet (Reassign, Move date, Delete)
 *   Web                   → drag a shift onto another employee / day
 *
 * Reassigning shows old → new with warnings (overlap, absence, expired
 * documents, already started) and notifies both drivers; started shifts
 * are locked unless confirmed. Week switch: ‹ KW › arrows, "Heute" and
 * "Woche wählen" (KW or date).
 *
 * Admin / dispatcher only. Employees see /plans/my-week instead.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Linking,
  Alert,
  Animated,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Calendar as CalendarIcon,
  CalendarDays,
  Users as UsersIcon,
  Plus,
  Edit2,
  Move,
  Trash2,
  X,
  Mail,
  Phone,
  Briefcase,
  ExternalLink,
  Lock,
  Moon,
  Check,
} from 'lucide-react-native'
import { addWeeks, format, isSameDay } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useProfiles } from '@/hooks/useProfiles'
import { usePlanningWeek } from '@/hooks/usePlanningWeek'
import { useOrgRules } from '@/hooks/useOrgRules'
import { getSupabase } from '@/lib/supabase/client'
import { WEEK_PLAN_SELECT } from '@/hooks/usePlanningWeek'
import {
  absenceOn,
  hasStarted,
  isoWeek,
  planEndDay,
  planStartDay,
  reassignWarnings,
  weekDays,
  weekStartOf,
} from '@/lib/plans/week'
import { addDays, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, weekdayName } from '@/lib/time/format'
import { publicHolidayName } from '@/lib/time/zuschlag'
import { describePlan, notifyPlanCancelled, notifyPlanChanged } from '@/lib/plans/notify'
import { dbErrorMessage } from '@/lib/times/entry-status'
import { useSafeBack } from '@/lib/use-safe-back'
import { canCreatePlans } from '@/lib/rbac/permissions'
import type { Plan, Profile } from '@/lib/types'
import { ReassignSheet, UNASSIGNED, warningText } from '@/components/plans/ReassignSheet'
import { WeekPickerSheet } from '@/components/plans/WeekPickerSheet'
import { Chip, PLAN_STATUS, ABSENCE_STYLE } from '@/components/plans/planStatus'
import {
  DAY_COL_W,
  EMP_COL_W,
  GRID,
  HEADER_H,
  ROW_MIN_H,
  TOTALS_H,
  WeekGridRow,
  weekCellHeight,
  type WeekGridHandlers,
  type WeekRowModel,
} from '@/components/plans/WeekGrid'

const EMPTY_PLANS: Plan[] = []

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export default function DashboardScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const goBack = useSafeBack('/plans')
  const router = useRouter()
  const { role, ready } = useUser()
  const params = useLocalSearchParams<{ date?: string }>()
  const { surchargeRules } = useOrgRules()

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => {
    const d = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null
    if (!d) return new Date()
    return dateFromKey(d)
  })
  const weekStart = useMemo(() => weekStartOf(localDateKey(weekAnchor)), [weekAnchor])
  const [reassignTarget, setReassignTarget] = useState<string | null | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [onlyWithShifts, setOnlyWithShifts] = useState(false)
  const [showAllRoles, setShowAllRoles] = useState(false)
  const [weekPickerOpen, setWeekPickerOpen] = useState(false)
  const [actionPlan, setActionPlan] = useState<Plan | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [moveDateOpen, setMoveDateOpen] = useState(false)
  // Employee info card. Web: hover on the name. Mobile: tap on the name.
  const [hoveredEmployee, setHoveredEmployee] = useState<Profile | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Web drag-and-drop state — ref avoids stale-closure in onDrop
  const dragRef = useRef<{ planId: string; employeeId: string; date: string } | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  // Horizontal offset of the grid body — drives the sticky day header.
  const scrollX = useRef(new Animated.Value(0)).current

  // Every member of the org is loaded (active + inactive) so a shift of
  // an inactive member never disappears from the grid.
  const { profiles, loading: loadingProfiles, error: profilesError } =
    useProfiles(true)
  const {
    plans,
    employees: planningEmployees,
    absences,
    qualifications,
    loading: loadingPlans,
    refetch,
    reassign,
  } = usePlanningWeek(weekStart)

  const today = localDateKey()
  const dayKeys = useMemo(() => weekDays(weekStart), [weekStart])
  // Days in the visible week (Date objects for the move-date sheet).
  const days = useMemo(() => dayKeys.map(dateFromKey), [dayKeys])

  // Customer options from the visible plans — keeps the dropdown small
  // and contextual to what's actually scheduled this week.
  const customerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of plans) {
      if (p.customer?.id && p.customer?.name) map.set(p.customer.id, p.customer.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [plans])

  const visiblePlans = useMemo(
    () => (customerFilter === 'all' ? plans : plans.filter((p) => p.customer?.id === customerFilter)),
    [plans, customerFilter],
  )

  // Local calendar day decides the column (a shift belongs to the day it
  // starts). Key: `${employeeId | UNASSIGNED}|YYYY-MM-DD`. Night shifts
  // from earlier days are indexed as continuations of the following days.
  const cellIndex = useMemo(() => {
    const starts = new Map<string, Plan[]>()
    const conts = new Map<string, Plan[]>()
    const inWeek = new Set(dayKeys)
    const push = (m: Map<string, Plan[]>, k: string, p: Plan) => {
      const arr = m.get(k)
      if (arr) arr.push(p)
      else m.set(k, [p])
    }
    for (const p of visiblePlans) {
      const row = p.employee_id ?? UNASSIGNED
      const s = planStartDay(p)
      if (inWeek.has(s)) push(starts, `${row}|${s}`, p)
      const e = planEndDay(p)
      if (e > s) for (const d of dayKeys) if (d > s && d <= e) push(conts, `${row}|${d}`, p)
    }
    return { starts, conts }
  }, [visiblePlans, dayKeys])

  const weekPlans = useMemo(() => {
    const inWeek = new Set(dayKeys)
    return visiblePlans.filter((p) => inWeek.has(planStartDay(p)))
  }, [visiblePlans, dayKeys])
  const unassignedPlans = useMemo(() => weekPlans.filter((p) => !p.employee_id), [weekPlans])

  const phoneById = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const e of planningEmployees) m.set(e.id, e.phone)
    return m
  }, [planningEmployees])

  // Rows like the web: active drivers (employee / technician), plus anyone
  // with a shift in the loaded range; "auch Admin/Disposition" adds the
  // office roles, "nur mit Schichten" hides rows without a shift this week.
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    const withPlans = new Set<string>()
    for (const p of visiblePlans) if (p.employee_id) withPlans.add(p.employee_id)
    const withWeekPlans = new Set<string>()
    for (const p of weekPlans) if (p.employee_id) withWeekPlans.add(p.employee_id)
    return profiles
      .filter((p) => {
        if (withPlans.has(p.id)) return true
        if (p.is_active === false) return false
        const r = String(p.role ?? '').toLowerCase()
        return showAllRoles || r === 'employee' || r === 'technician'
      })
      .filter((p) => !q || (p.full_name ?? '').toLowerCase().includes(q))
      .filter((p) => !onlyWithShifts || withWeekPlans.has(p.id))
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'de'))
  }, [profiles, search, showAllRoles, onlyWithShifts, visiblePlans, weekPlans])

  const rows = useMemo(() => {
    const build = (key: string, employeeId: string | null, inactive?: boolean): WeekRowModel => {
      let height = ROW_MIN_H
      let weekCount = 0
      const cells = dayKeys.map((day) => {
        const cell = {
          day,
          plans: cellIndex.starts.get(`${key}|${day}`) ?? EMPTY_PLANS,
          conts: cellIndex.conts.get(`${key}|${day}`) ?? EMPTY_PLANS,
          absence: employeeId ? absenceOn(absences, employeeId, day) : undefined,
        }
        weekCount += cell.plans.length
        height = Math.max(height, weekCellHeight(cell))
        return cell
      })
      return { key, employeeId, cells, height, weekCount, inactive }
    }
    const out: { model: WeekRowModel; profile: Profile | null }[] = []
    if (unassignedPlans.length > 0) out.push({ model: build(UNASSIGNED, null), profile: null })
    for (const emp of filteredEmployees) out.push({ model: build(emp.id, emp.id, emp.is_active === false), profile: emp })
    return out
  }, [dayKeys, cellIndex, absences, unassignedPlans.length, filteredEmployees])

  const dayTotals = useMemo(
    () => dayKeys.map((_, i) => rows.reduce((s, r) => s + (r.model.cells[i]?.plans.length ?? 0), 0)),
    [rows, dayKeys],
  )

  const holidays = useMemo(() => dayKeys.map((d) => publicHolidayName(d, surchargeRules)), [dayKeys, surchargeRules])

  const weekLabel = `KW ${isoWeek(weekStart)} · ${formatDateDE(weekStart).slice(0, 6)}–${formatDateDE(addDays(weekStart, 6))}`

  const onPrev = () => setWeekAnchor((d) => addWeeks(d, -1))
  const onNext = () => setWeekAnchor((d) => addWeeks(d, 1))
  const onToday = () => setWeekAnchor(new Date())
  const jumpTo = (date: string) => {
    setWeekAnchor(dateFromKey(date))
    setWeekPickerOpen(false)
  }

  const closeActions = () => {
    setActionPlan(null)
    setReassignOpen(false)
    setMoveDateOpen(false)
    setReassignTarget(undefined)
  }

  /** Asks before touching a shift that already started (Punkt 8). */
  const confirmStarted = (plan: Plan, what: string): Promise<boolean> =>
    new Promise((resolve) => {
      if (!hasStarted(plan)) return resolve(true)
      Alert.alert(
        L('Schicht hat bereits begonnen', 'Shift already started'),
        L(
          `${describePlan(plan)}\n\nBegonnene oder abgeschlossene Schichten sind gesperrt. ${what} nur in Ausnahmefällen.`,
          `Started or finished shifts are locked. ${what} only in exceptional cases.`,
        ),
        [
          { text: L('Abbrechen', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: L('Trotzdem', 'Continue anyway'), style: 'destructive', onPress: () => resolve(true) },
        ],
      )
    })

  const doMoveDate = async (newDay: Date, target: Plan | null = actionPlan) => {
    const plan = target
    if (!plan) return
    // Preserve the time portion and the duration; shift the calendar day only.
    const oldStart = new Date(plan.start_time)
    const duration = new Date(plan.end_time).getTime() - oldStart.getTime()
    const newStart = new Date(newDay)
    newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
    const newEnd = new Date(newStart.getTime() + duration)
    if (localDateKey(newStart) === planStartDay(plan)) {
      closeActions()
      return
    }
    if (!(await confirmStarted(plan, L('Verschieben', 'Moving')))) return
    const moved = { ...plan, start_time: newStart.toISOString(), end_time: newEnd.toISOString() }
    const warnings = plan.employee_id
      ? reassignWarnings(moved, plan.employee_id, { plans, absences, qualifications }).filter((w) => w.kind !== 'started')
      : []
    if (warnings.length) {
      const ok = await new Promise<boolean>((resolve) =>
        Alert.alert(
          L('Hinweise zum neuen Tag', 'Warnings for the new day'),
          warnings.map((w) => `• ${warningText(w, locale)}`).join('\n'),
          [
            { text: L('Abbrechen', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: L('Trotzdem verschieben', 'Move anyway'), onPress: () => resolve(true) },
          ],
        ),
      )
      if (!ok) return
    }
    const { data, error } = await getSupabase()
      .from('plans')
      .update({
        start_time: moved.start_time,
        end_time: moved.end_time,
        // A moved shift has to be confirmed again.
        status: plan.employee_id ? 'assigned' : plan.status,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', plan.id)
      .select(WEEK_PLAN_SELECT)
      .single()
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Verschieben fehlgeschlagen', 'Move failed')))
      return
    }
    if (plan.employee_id) void notifyPlanChanged(data as Plan, plan.employee_id, plan)
    toast.success(
      L(
        `Schicht auf ${format(newDay, 'EEEE, dd.MM.', { locale: dateLocale })} verschoben${plan.employee_id ? ' – Mitarbeiter benachrichtigt' : ''}`,
        `Shift moved to ${format(newDay, 'EEE, dd.MM.', { locale: dateLocale })}${plan.employee_id ? ' – employee notified' : ''}`,
      ),
    )
    closeActions()
    refetch(true)
  }

  const doDelete = () => {
    const plan = actionPlan
    if (!plan) return
    Alert.alert(
      L('Schicht löschen?', 'Delete shift?'),
      `${describePlan(plan)}${hasStarted(plan) ? L('\n\nAchtung: Die Schicht hat bereits begonnen.', '\n\nNote: the shift already started.') : ''}${plan.employee_id ? L('\n\nDer Mitarbeiter wird benachrichtigt.', '\n\nThe employee will be notified.') : ''}`,
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Löschen', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await getSupabase().from('plans').delete().eq('id', plan.id)
            if (error) {
              toast.error(dbErrorMessage(error, locale, L('Löschen fehlgeschlagen', 'Delete failed')))
              return
            }
            if (plan.employee_id && new Date(plan.end_time) > new Date()) void notifyPlanCancelled(plan, plan.employee_id)
            toast.success(L('Schicht gelöscht', 'Shift deleted'))
            closeActions()
            refetch(true)
          },
        },
      ],
    )
  }

  // ── Web drag-and-drop handlers ──────────────────────────────────────────
  const handleDrop = async (targetEmpId: string, targetDate: string) => {
    const src = dragRef.current
    dragRef.current = null
    setDragOverKey(null)
    if (!src || (src.employeeId === targetEmpId && src.date === targetDate)) return
    const plan = plans.find((p) => p.id === src.planId)
    if (!plan) return
    if (src.employeeId !== targetEmpId && src.date !== targetDate) {
      toast.error(L('Bitte entweder den Tag oder den Mitarbeiter ändern – nicht beides zugleich.', 'Change either the day or the employee – not both at once.'))
      return
    }
    if (src.employeeId !== targetEmpId) {
      // Same day, other employee → reassign sheet with the target preselected.
      setActionPlan(plan)
      setReassignTarget(targetEmpId === UNASSIGNED ? null : targetEmpId)
      setReassignOpen(true)
    } else {
      void doMoveDate(dateFromKey(targetDate), plan)
    }
  }
  // Latest drop implementation behind a stable callback, so the memoized
  // grid rows don't re-render on every parent render.
  const dropRef = useRef(handleDrop)
  dropRef.current = handleDrop

  const onPlanPress = useCallback((p: Plan) => router.push(`/plans/${p.id}` as any), [router])
  const onPlanLongPress = useCallback((p: Plan) => setActionPlan(p), [])
  const onEmptyPress = useCallback(
    (employeeId: string | null, day: string) =>
      router.push((employeeId ? `/plans/new?employeeId=${employeeId}&date=${day}` : `/plans/new?date=${day}`) as any),
    [router],
  )
  const onDragStart = useCallback((planId: string, empId: string, d: string) => {
    dragRef.current = { planId, employeeId: empId, date: d }
  }, [])
  const onDragOver = useCallback((empId: string, d: string) => setDragOverKey(`${empId}|${d}`), [])
  const onDragEnd = useCallback(() => {
    dragRef.current = null
    setDragOverKey(null)
  }, [])
  const onDrop = useCallback((empId: string, d: string) => {
    void dropRef.current(empId, d)
  }, [])
  const handlers: WeekGridHandlers = useMemo(
    () => ({ onPlanPress, onPlanLongPress, onEmptyPress, onDragStart, onDragOver, onDragEnd, onDrop }),
    [onPlanPress, onPlanLongPress, onEmptyPress, onDragStart, onDragOver, onDragEnd, onDrop],
  )

  const onGridScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: Platform.OS !== 'web' }),
    [scrollX],
  )
  const headerShift = useMemo(() => Animated.multiply(scrollX, -1), [scrollX])

  // Permission gate — after all hooks so the hook order never changes.
  // Employees never reach this route (link hidden) but on a deep link they
  // see a friendly notice. Guard with `ready` so it doesn't fire early.
  if (ready && !canCreatePlans(role)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <AppHeader />
        <Screen className="px-6 items-center justify-center" noTapToDismiss>
          <Text className="text-gray-400 dark:text-slate-500 text-center">
            {L(
              'Nur Admins oder Disponenten dürfen die Wochenplanung öffnen.',
              'Only admins or dispatchers can open the weekly planning.',
            )}
          </Text>
        </Screen>
      </View>
    )
  }

  const loading = loadingPlans || loadingProfiles
  const createDate = dayKeys.includes(today) ? today : weekStart
  const customerLabel =
    customerFilter === 'all'
      ? L('Alle Kunden', 'All customers')
      : customerOptions.find((c) => c.id === customerFilter)?.name ?? '—'

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          stickyHeaderIndices={[1]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              tintColor="#0064E0"
            />
          }
        >
          {/* [0] Title, week switcher, filters, legend */}
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, backgroundColor: '#FFFFFF' }}>
            <PageHeader
              showBack
              title={L('Wochenplanung', 'Weekly planning')}
              subtitle={L(
                'Schicht lange drücken zum Umverteilen – beide Mitarbeiter werden benachrichtigt.',
                'Long-press a shift to reassign – both employees are notified.',
              )}
              onBack={goBack}
            />

            {/* ‹ KW 43 · 20.10.–26.10.2026 ›  ·  Heute */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: GRID.border, backgroundColor: '#FFFFFF' }}>
                <Pressable onPress={onPrev} hitSlop={6} accessibilityLabel={L('Vorwoche', 'Previous week')} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={18} color="#334155" />
                </Pressable>
                <Pressable onPress={() => setWeekPickerOpen(true)} style={{ flex: 1 }} accessibilityLabel={L('Woche wählen', 'Pick week')}>
                  <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '900', color: '#1E293B' }} numberOfLines={1} adjustsFontSizeToFit>
                    {weekLabel}
                  </Text>
                </Pressable>
                <Pressable onPress={onNext} hitSlop={6} accessibilityLabel={L('Folgewoche', 'Next week')} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight size={18} color="#334155" />
                </Pressable>
              </View>
              <Pressable onPress={onToday}>
                <View style={{ height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: GRID.border, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{L('Heute', 'Today')}</Text>
                </View>
              </Pressable>
            </View>

            {/* Woche/Datum wählen  ·  + Schicht anlegen */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Pressable onPress={() => setWeekPickerOpen(true)} style={{ flex: 1 }} accessibilityLabel={L('Woche wählen', 'Pick week')}>
                <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: GRID.border, backgroundColor: '#FFFFFF' }}>
                  <CalendarDays size={16} color="#94A3B8" />
                  <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '700', color: '#334155', flex: 1 }} numberOfLines={1}>
                    {formatDateDE(weekStart)}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#0064E0' }}>{L('KW / Datum', 'CW / date')}</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => router.push(`/plans/new?date=${createDate}` as any)}>
                <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#0064E0' }}>
                  <Plus size={16} color="#FFFFFF" />
                  <Text style={{ marginLeft: 4, fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>{L('Schicht anlegen', 'Add shift')}</Text>
                </View>
              </Pressable>
            </View>

            {/* Search */}
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 12, borderWidth: 1, borderColor: GRID.border, backgroundColor: '#FFFFFF', paddingHorizontal: 12, marginBottom: 8 }}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={L('Mitarbeiter suchen …', 'Search employee …')}
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#0F172A' }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search ? (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <X size={14} color="#94A3B8" />
                </Pressable>
              ) : null}
            </View>

            {/* Customer select + toggles */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => setCustomerPickerOpen((v) => !v)}>
                <View
                  style={{
                    height: 36,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: customerFilter === 'all' ? GRID.border : '#0064E0',
                    backgroundColor: customerFilter === 'all' ? '#FFFFFF' : '#EFF6FF',
                    maxWidth: 220,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: customerFilter === 'all' ? '#334155' : '#0064E0' }} numberOfLines={1}>
                    {customerLabel}
                  </Text>
                  <ChevronDown size={14} color={customerFilter === 'all' ? '#94A3B8' : '#0064E0'} style={{ marginLeft: 6 }} />
                </View>
              </Pressable>
              <ToggleChip label={L('nur mit Schichten', 'only with shifts')} value={onlyWithShifts} onChange={setOnlyWithShifts} />
              <ToggleChip
                label={L('auch Admin/Disposition', 'include admin/dispatch')}
                value={showAllRoles}
                onChange={setShowAllRoles}
                icon={<UsersIcon size={13} color="#475569" />}
              />
            </View>

            {customerPickerOpen ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                <FilterPill
                  label={L('Alle Kunden', 'All customers')}
                  active={customerFilter === 'all'}
                  onPress={() => {
                    setCustomerFilter('all')
                    setCustomerPickerOpen(false)
                  }}
                />
                {customerOptions.map((c) => (
                  <FilterPill
                    key={c.id}
                    label={c.name}
                    active={customerFilter === c.id}
                    onPress={() => {
                      setCustomerFilter(c.id)
                      setCustomerPickerOpen(false)
                    }}
                  />
                ))}
              </View>
            ) : null}

            {/* Legend */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12 }}>
              {(['assigned', 'confirmed', 'rejected'] as const).map((s) => (
                <Chip key={s} label={locale === 'de' ? PLAN_STATUS[s].de : PLAN_STATUS[s].en} bg={PLAN_STATUS[s].bg} fg={PLAN_STATUS[s].fg} border={PLAN_STATUS[s].border} />
              ))}
              <Chip label={L('Unbesetzt', 'Unassigned')} bg="#FFFBEB" fg="#B45309" border="#FDE68A" dashed />
              <LegendIcon icon={<Lock size={10} color="#64748B" />} label={L('begonnen', 'started')} />
              <LegendIcon icon={<Moon size={10} color="#4338CA" />} label={L('+1 Folgetag', '+1 next day')} fg="#4338CA" bg="#EEF2FF" />
              <Chip label={L('Urlaub', 'Vacation')} bg={ABSENCE_STYLE.vacation.bg} fg={ABSENCE_STYLE.vacation.fg} />
              <Chip label={L('Krank', 'Sick')} bg={ABSENCE_STYLE.sick.bg} fg={ABSENCE_STYLE.sick.fg} />
            </View>
          </View>

          {/* [1] Sticky day header — corner stays put, days follow the grid */}
          <View style={{ flexDirection: 'row', height: HEADER_H, backgroundColor: GRID.chrome, borderTopWidth: 1, borderBottomWidth: 1, borderColor: GRID.border }}>
            <View style={{ width: EMP_COL_W, paddingHorizontal: 10, justifyContent: 'center', borderRightWidth: 1, borderColor: GRID.border, backgroundColor: GRID.chrome, zIndex: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }} numberOfLines={1}>
                {L('Mitarbeiter', 'Employee')}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: '#CBD5E1', marginTop: 1 }}>{filteredEmployees.length}</Text>
            </View>
            <View style={{ flex: 1, overflow: 'hidden' }}>
              <Animated.View style={{ flexDirection: 'row', width: DAY_COL_W * 7, transform: [{ translateX: headerShift }] }}>
                {dayKeys.map((d, i) => {
                  const isTodayCol = d === today
                  const holiday = holidays[i]
                  return (
                    <View
                      key={d}
                      style={{
                        width: DAY_COL_W,
                        height: HEADER_H - 2,
                        paddingHorizontal: 8,
                        justifyContent: 'center',
                        borderLeftWidth: 1,
                        borderColor: GRID.border,
                        backgroundColor: isTodayCol ? GRID.today : GRID.chrome,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '900', color: isTodayCol ? '#0064E0' : '#1E293B' }} numberOfLines={1}>
                        {weekdayName(d, locale, true)} {formatDateDE(d).slice(0, 6)}
                      </Text>
                      {holiday ? (
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#B45309', marginTop: 1 }} numberOfLines={1}>
                          {holiday}
                        </Text>
                      ) : isTodayCol ? (
                        <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#0064E0', marginTop: 1, textTransform: 'uppercase' }}>
                          {L('Heute', 'Today')}
                        </Text>
                      ) : null}
                    </View>
                  )
                })}
              </Animated.View>
            </View>
          </View>

          {/* [2] Grid body — pinned name column + horizontally scrolling days */}
          {rows.length === 0 ? (
            <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
              {loading ? (
                <ActivityIndicator color="#0064E0" />
              ) : profilesError?.kind === 'missing_org' ? (
                <>
                  <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '900', textAlign: 'center' }}>
                    {L('Ihr Konto ist keiner Organisation zugeordnet.', 'Your account is not linked to an organization.')}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748B', textAlign: 'center', maxWidth: 320 }}>{profilesError.message}</Text>
                </>
              ) : search.trim().length > 0 ? (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#94A3B8' }}>
                  {L(`Keine Mitarbeiter passen zu „${search}".`, `No employees match "${search}".`)}
                </Text>
              ) : profiles.length === 0 ? (
                <>
                  <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '800', textAlign: 'center' }}>
                    {L('Noch keine Mitarbeiter in dieser Organisation.', 'No employees in this organization yet.')}
                  </Text>
                  <Pressable onPress={() => router.push('/users' as any)}>
                    <View style={{ marginTop: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#0064E0' }}>
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>{L('Mitarbeiter einladen', 'Invite members')}</Text>
                    </View>
                  </Pressable>
                </>
              ) : (
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#94A3B8' }}>{L('Keine Mitarbeiter gefunden.', 'No employees found.')}</Text>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              {/* Pinned employee column */}
              <View style={{ width: EMP_COL_W, borderRightWidth: 1, borderColor: GRID.border, backgroundColor: '#FFFFFF', zIndex: 2 }}>
                {rows.map(({ model, profile }) =>
                  profile ? (
                    <Pressable
                      key={model.key}
                      onPress={() => setHoveredEmployee({ ...profile, phone: profile.phone ?? phoneById.get(profile.id) ?? null })}
                      onHoverIn={() => {
                        if (Platform.OS !== 'web') return
                        if (hoverTimer.current) clearTimeout(hoverTimer.current)
                        hoverTimer.current = setTimeout(
                          () => setHoveredEmployee({ ...profile, phone: profile.phone ?? phoneById.get(profile.id) ?? null }),
                          120,
                        )
                      }}
                      onHoverOut={() => {
                        if (Platform.OS !== 'web') return
                        if (hoverTimer.current) clearTimeout(hoverTimer.current)
                      }}
                      style={{
                        height: model.height,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderBottomWidth: 1,
                        borderColor: GRID.borderSoft,
                        opacity: model.inactive ? 0.75 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A' }} numberOfLines={2}>
                        {profile.full_name || profile.email || '—'}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2 }} numberOfLines={2}>
                        {phoneById.get(profile.id) ? `${phoneById.get(profile.id)} · ` : ''}
                        {model.weekCount} {L('Schicht(en)', 'shift(s)')}
                        {model.inactive ? ` · ${L('inaktiv', 'inactive')}` : ''}
                      </Text>
                    </Pressable>
                  ) : (
                    <View
                      key={model.key}
                      style={{ height: model.height, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderColor: '#FDE68A' }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '900', color: '#92400E' }}>{L('Unbesetzt', 'Unassigned')}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#B45309', marginTop: 2 }}>
                        {unassignedPlans.length} {L('Schicht(en)', 'shift(s)')}
                      </Text>
                    </View>
                  ),
                )}
                <View style={{ height: TOTALS_H, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: GRID.chrome, borderTopWidth: 1, borderColor: GRID.border }}>
                  <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8' }} numberOfLines={2}>
                    {L('Schichten / Tag', 'Shifts / day')}
                  </Text>
                </View>
              </View>

              {/* Scrolling day columns */}
              <Animated.ScrollView
                horizontal
                showsHorizontalScrollIndicator
                onScroll={onGridScroll}
                scrollEventThrottle={16}
                style={{ flex: 1 }}
              >
                <View style={{ width: DAY_COL_W * 7 }}>
                  {rows.map(({ model }) => (
                    <WeekGridRow
                      key={model.key}
                      row={model}
                      today={today}
                      locale={locale}
                      dragOverDay={dragOverKey && dragOverKey.startsWith(`${model.key}|`) ? dragOverKey.slice(model.key.length + 1) : null}
                      handlers={handlers}
                    />
                  ))}
                  <View style={{ flexDirection: 'row', height: TOTALS_H, backgroundColor: GRID.chrome, borderTopWidth: 1, borderColor: GRID.border }}>
                    {dayKeys.map((d, i) => (
                      <View
                        key={`total-${d}`}
                        style={{ width: DAY_COL_W, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderColor: GRID.border, backgroundColor: d === today ? GRID.today : 'transparent' }}
                      >
                        <Text style={{ fontSize: 15, fontWeight: '900', color: dayTotals[i] > 0 ? '#0F172A' : '#CBD5E1' }}>{dayTotals[i]}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Animated.ScrollView>
            </View>
          )}

          {/* [3] Summary + help */}
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 32, gap: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B' }}>
              {weekPlans.length} {L('Schicht(en) in KW', 'shift(s) in CW')} {isoWeek(weekStart)}
              {unassignedPlans.length ? (
                <Text style={{ color: '#B45309', fontWeight: '800' }}>
                  {' · '}
                  {unassignedPlans.length} {L('unbesetzt', 'unassigned')}
                </Text>
              ) : null}
            </Text>
            <View style={{ backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: GRID.border, borderRadius: 16, padding: 12 }}>
              <Text style={{ fontSize: 12, color: '#475569', lineHeight: 17 }}>
                {L(
                  'Leere Zelle antippen: Schicht anlegen (Mitarbeiter und Datum vorausgefüllt). Schicht antippen: Details. Schicht lange drücken (Web: ziehen): umverteilen, verschieben, löschen – mit Warnungen und Benachrichtigung der Mitarbeiter.',
                  'Tap an empty cell to create a shift (employee and date prefilled). Tap a shift for details. Long-press a shift (web: drag) to reassign, move or delete – with warnings and employee notifications.',
                )}
              </Text>
            </View>
          </View>
        </ScrollView>
      </Screen>

      {/* Quick-action sheet */}
      <ActionSheet
        plan={actionPlan}
        visible={!!actionPlan && !reassignOpen && !moveDateOpen}
        onClose={closeActions}
        onView={() => {
          if (!actionPlan) return
          const id = actionPlan.id
          closeActions()
          router.push(`/plans/${id}` as any)
        }}
        onEdit={() => {
          if (!actionPlan) return
          const id = actionPlan.id
          closeActions()
          router.push(`/plans/edit/${id}` as any)
        }}
        onReassign={() => setReassignOpen(true)}
        onMoveDate={() => setMoveDateOpen(true)}
        onDelete={doDelete}
      />

      <ReassignSheet
        visible={reassignOpen}
        plan={actionPlan}
        initialTarget={reassignTarget}
        employees={planningEmployees}
        plans={plans}
        absences={absences}
        qualifications={qualifications}
        onConfirm={async (plan, target, notify) => {
          const ok = await reassign(plan, target, notify)
          if (ok) closeActions()
          return ok
        }}
        onClose={() => {
          setReassignOpen(false)
          setReassignTarget(undefined)
          // Opened by drag & drop: close the whole flow.
          if (reassignTarget !== undefined) setActionPlan(null)
        }}
      />

      <MoveDateSheet
        visible={moveDateOpen}
        days={days}
        currentDate={actionPlan ? new Date(actionPlan.start_time) : null}
        onPick={(d) => {
          void doMoveDate(d)
        }}
        onClose={() => setMoveDateOpen(false)}
      />

      <WeekPickerSheet
        visible={weekPickerOpen}
        weekStart={weekStart}
        onPick={jumpTo}
        onClose={() => setWeekPickerOpen(false)}
      />

      <EmployeeCard
        profile={hoveredEmployee}
        visible={!!hoveredEmployee}
        onClose={() => setHoveredEmployee(null)}
      />
    </View>
  )
}

// ─── Toggle chip (web: checkbox) ──────────────────────────────────────────

function ToggleChip({
  label,
  value,
  onChange,
  icon,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  icon?: React.ReactNode
}) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }}>
      <View style={{ height: 36, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            borderWidth: 1.5,
            borderColor: value ? '#0064E0' : '#CBD5E1',
            backgroundColor: value ? '#0064E0' : '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {value ? <Check size={12} color="#FFFFFF" strokeWidth={3} /> : null}
        </View>
        {icon ? <View style={{ marginLeft: 6 }}>{icon}</View> : null}
        <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#475569' }}>{label}</Text>
      </View>
    </Pressable>
  )
}

function LegendIcon({ icon, label, fg = '#64748B', bg = '#F8FAFC' }: { icon: React.ReactNode; label: string; fg?: string; bg?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, borderColor: bg === '#F8FAFC' ? '#E2E8F0' : bg, backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2 }}>
      {icon}
      <Text style={{ marginLeft: 3, fontSize: 10, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: fg }}>{label}</Text>
    </View>
  )
}

// ─── Filter pill ──────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? '#0064E0' : '#E5E7EB',
          backgroundColor: active ? '#0064E0' : '#FFFFFF',
          maxWidth: 220,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: active ? '#FFFFFF' : '#475569',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

// ─── Action sheet (long-press menu) ───────────────────────────────────────

function ActionSheet({
  plan,
  visible,
  onClose,
  onView,
  onEdit,
  onReassign,
  onMoveDate,
  onDelete,
}: {
  plan: Plan | null
  visible: boolean
  onClose: () => void
  onView: () => void
  onEdit: () => void
  onReassign: () => void
  onMoveDate: () => void
  onDelete: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  if (!plan) return null
  const title = describePlan(plan)

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 items-center justify-end"
        onPress={onClose}
      >
        <Pressable
          className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5"
          onPress={(e) => e.stopPropagation()}
          style={{ maxWidth: 520 }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[14px] font-black text-gray-900 dark:text-white" numberOfLines={2} style={{ flex: 1, marginRight: 8 }}>
              {title}
            </Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <SheetAction
            icon={<CalendarIcon size={18} color="#0064E0" />}
            label={L('Details ansehen', 'View detail')}
            onPress={onView}
          />
          <SheetAction
            icon={<Edit2 size={18} color="#0064E0" />}
            label={L('Bearbeiten', 'Edit')}
            onPress={onEdit}
          />
          {hasStarted(plan) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 10, marginBottom: 6 }}>
              <Lock size={14} color="#475569" />
              <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: '#475569', flex: 1 }}>
                {L('Schicht hat bereits begonnen – Änderungen nur mit Bestätigung.', 'Shift already started – changes need confirmation.')}
              </Text>
            </View>
          )}
          <SheetAction
            icon={<UsersIcon size={18} color="#0064E0" />}
            label={L('Mitarbeiter ändern (umverteilen)', 'Change employee (reassign)')}
            onPress={onReassign}
          />
          <SheetAction
            icon={<Move size={18} color="#0064E0" />}
            label={L('Auf anderen Tag verschieben', 'Move to another day')}
            onPress={onMoveDate}
          />
          <SheetAction
            icon={<Trash2 size={18} color="#DC2626" />}
            label={L('Löschen', 'Delete')}
            onPress={onDelete}
            destructive
          />
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function SheetAction({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
  destructive?: boolean
}) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderColor: '#F1F5F9',
        }}
      >
        {icon}
        <Text
          style={{
            marginLeft: 12,
            fontSize: 14,
            fontWeight: '700',
            color: destructive ? '#DC2626' : '#0F172A',
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

function MoveDateSheet({
  visible,
  days,
  currentDate,
  onPick,
  onClose,
}: {
  visible: boolean
  days: Date[]
  currentDate: Date | null
  onPick: (d: Date) => void
  onClose: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable
          className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5"
          onPress={(e) => e.stopPropagation()}
          style={{ maxWidth: 520 }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[16px] font-black text-gray-900 dark:text-white">
              {L('Auf welchen Tag?', 'Which day?')}
            </Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>
          {days.map((d) => {
            const active = currentDate ? isSameDay(d, currentDate) : false
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => onPick(d)}
              >
                <View
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 4,
                    borderBottomWidth: 1,
                    borderColor: '#F1F5F9',
                    backgroundColor: active ? '#EFF6FF' : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active ? '900' : '700',
                      color: active ? '#0064E0' : '#0F172A',
                    }}
                  >
                    {format(d, 'EEEE, dd. MMMM', { locale: dateLocale })}
                    {active ? ` · ${L('aktuell', 'current')}` : ''}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Employee hover card (Wilson-style popover) ───────────────────────────

function EmployeeCard({
  profile,
  visible,
  onClose,
}: {
  profile: Profile | null
  visible: boolean
  onClose: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  if (!profile) return null
  const initials = (profile.full_name ?? profile.email ?? '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const openLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      /* no toast — Linking error means the device has no handler */
    })
  }
  const roleLabel: Record<string, string> = {
    admin: L('Administrator', 'Administrator'),
    dispatcher: L('Disponent', 'Dispatcher'),
    employee: L('Mitarbeiter', 'Employee'),
  }
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.40)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={(e: any) => e.stopPropagation?.()}
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            padding: 18,
            shadowColor: '#0F172A',
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 10,
          }}
        >
          {/* Header — avatar + name + close */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 999,
                backgroundColor: '#EEF2FF',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 16 }}>
                {initials}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}
                numberOfLines={1}
              >
                {profile.full_name ?? '—'}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  color: '#64748B',
                  fontWeight: '800',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  marginTop: 2,
                }}
              >
                {roleLabel[profile.role] ?? profile.role}
                {profile.is_active ? '' : ` · ${L('inaktiv', 'inactive')}`}
              </Text>
            </View>
            <Pressable onPress={onClose} style={{ padding: 4 }} hitSlop={8}>
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Email */}
          {profile.email ? (
            <EmployeeCardRow
              icon={<Mail size={14} color="#64748B" />}
              label={L('E-Mail', 'E-mail')}
              value={profile.email}
              onPress={() => openLink(`mailto:${profile.email}`)}
            />
          ) : null}

          {/* Phone */}
          {profile.phone ? (
            <EmployeeCardRow
              icon={<Phone size={14} color="#64748B" />}
              label={L('Telefon', 'Phone')}
              value={profile.phone}
              onPress={() => openLink(`tel:${profile.phone}`)}
            />
          ) : null}

          {/* Profession / role */}
          <EmployeeCardRow
            icon={<Briefcase size={14} color="#64748B" />}
            label={L('Profession', 'Profession')}
            value={roleLabel[profile.role] ?? profile.role}
          />

          {/* Badges — target hours + working-time model */}
          {(profile.target_hours || profile.working_time_model_id) ? (
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                marginTop: 12,
              }}
            >
              {profile.target_hours ? (
                <Badge
                  bg="#FEF3C7"
                  fg="#92400E"
                  label={`${profile.target_hours}h / ${L('Woche', 'week')}`}
                />
              ) : null}
              {profile.working_time_model_id ? (
                <Badge bg="#D1FAE5" fg="#065F46" label={L('Arbeitszeitmodell', 'Time model')} />
              ) : null}
              <Badge
                bg={profile.is_active ? '#DBEAFE' : '#F1F5F9'}
                fg={profile.is_active ? '#1E3A8A' : '#475569'}
                label={profile.is_active ? L('aktiv', 'active') : L('inaktiv', 'inactive')}
              />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function EmployeeCardRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  value: string
  onPress?: () => void
}) {
  const interactive = !!onPress
  return (
    <Pressable onPress={onPress} disabled={!interactive}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderColor: '#F1F5F9',
        }}
      >
        <View style={{ width: 22 }}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 9,
              color: '#94A3B8',
              fontWeight: '900',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: interactive ? '#0064E0' : '#0F172A',
              fontWeight: '700',
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
        {interactive ? <ExternalLink size={12} color="#94A3B8" /> : null}
      </View>
    </Pressable>
  )
}

function Badge({ bg, fg, label }: { bg: string; fg: string; label: string }) {
  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '900', color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
