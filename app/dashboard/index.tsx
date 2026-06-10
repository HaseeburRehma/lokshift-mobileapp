/**
 * Unified Shift Dashboard — Wilson SaaS-style week grid.
 *
 * Issue 5 in the client bug brief. Renders all employees as rows and
 * the seven days of the selected week as columns. Each cell shows the
 * latest plan for (employee, date) or an empty slot. Admin actions:
 *
 *   Tap empty cell        → /plans/new with employee + date prefilled
 *   Tap filled cell       → /plans/[id] detail
 *   Long-press filled     → quick-action sheet (Reassign, Move date, Delete)
 *
 * Drag-and-drop on a 3-inch wide screen is fiddly; the long-press
 * action sheet is what mobile users expect for "move this elsewhere"
 * and is functionally identical. The two-step Reassign sheet (pick
 * employee, pick day) is faster than drag-aim-drop with a thumb.
 *
 * Admin / dispatcher only. Employees see /plans personal view instead.
 */

import React, { useMemo, useRef, useState } from 'react'
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
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Calendar as CalendarIcon,
  Users as UsersIcon,
  Plus,
  Edit2,
  Move,
  Trash2,
  X,
  AlertTriangle,
  Mail,
  Phone,
  Briefcase,
  ExternalLink,
} from 'lucide-react-native'
import {
  addDays,
  addWeeks,
  format,
  startOfWeek,
  isSameDay,
  isToday,
} from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { Card } from '@/components/Card'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useProfiles } from '@/hooks/useProfiles'
import { useDashboardWeek } from '@/hooks/useDashboardWeek'
import { useSafeBack } from '@/lib/use-safe-back'
import { safeFormatTime } from '@/lib/safe-format'
import { canCreatePlans } from '@/lib/rbac/permissions'
import type { Plan, Profile } from '@/lib/types'

const DAY_COL_W = 130
const EMP_COL_W = 150
const ROW_H = 84

// Wilson-inspired palette — soft teal for assigned shifts, slate for chrome.
const C = {
  bg: '#FFFFFF',
  chrome: '#F8FAFC',
  border: '#E2E8F0',
  borderSoft: '#F1F5F9',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',

  shiftBg: '#E6FAF5',          // pale mint cell background
  shiftAccent: '#0F766E',      // teal text
  shiftBorder: '#A7F3D0',
  shiftCodeBg: '#FBFEFD',      // header pill inside cell
  warning: '#DC2626',          // red triangle

  cancelledBg: '#FEE2E2',
  cancelledText: '#7F1D1D',

  todayBg: '#E0F2FE',
  todayText: '#0369A1',

  dragTargetBg: '#BFDBFE',
  dragTargetBorder: '#3B82F6',
}

export default function DashboardScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const goBack = useSafeBack('/plans')
  const router = useRouter()
  const { role, ready } = useUser()

  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date())
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [actionPlan, setActionPlan] = useState<Plan | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [moveDateOpen, setMoveDateOpen] = useState(false)
  // Wilson-style employee hover card. Web: opens on mouse-enter of the
  // employee column. Mobile: opens on tap of the avatar/name.
  const [hoveredEmployee, setHoveredEmployee] = useState<Profile | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Web drag-and-drop state — ref avoids stale-closure in onDrop
  const dragRef = useRef<{ planId: string; employeeId: string; date: string } | null>(null)
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)

  // Wilson dashboard shows every member of the org (active + inactive)
  // so dispatchers can see the full roster, including people on leave.
  // Pass `true` so inactive profiles are NOT filtered out.
  const { profiles, loading: loadingProfiles, error: profilesError } =
    useProfiles(true)
  const {
    plans,
    byCell,
    loading: loadingPlans,
    range,
    refetch,
    updatePlanField,
    deletePlan,
  } = useDashboardWeek(weekAnchor)

  // Permission gate — employees never reach this route (link is hidden
  // on plans list) but if they deep-link here, show a friendly notice.
  // Guard with `ready` so we don't false-fire before the profile loads.
  if (ready && !canCreatePlans(role)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <AppHeader />
        <Screen className="px-6 items-center justify-center" noTapToDismiss>
          <Text className="text-gray-400 dark:text-slate-500 text-center">
            {L(
              'Nur Admins oder Disponenten dürfen das Dashboard öffnen.',
              'Only admins or dispatchers can open the dashboard.',
            )}
          </Text>
        </Screen>
      </View>
    )
  }

  // Days in the visible week.
  const days = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [weekAnchor])

  // Filtered employee list (by search). Inactive profiles already excluded.
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles
      .filter((p) => (p.full_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''))
  }, [profiles, search])

  // Customer options from the visible plans — keeps the dropdown small
  // and contextual to what's actually scheduled this week.
  const customerOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of plans) {
      if (p.customer?.id && p.customer?.name) map.set(p.customer.id, p.customer.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [plans])

  // Customer filter applied to cell lookups.
  const planMatchesFilter = (p: Plan): boolean => {
    if (customerFilter === 'all') return true
    return p.customer?.id === customerFilter
  }

  const cellPlans = (employeeId: string, day: Date): Plan[] => {
    const key = `${employeeId}|${format(day, 'yyyy-MM-dd')}`
    return (byCell.get(key) ?? []).filter(planMatchesFilter)
  }

  const weekLabel = useMemo(() => {
    const start = days[0]
    const end = days[6]
    if (!start || !end) return ''
    if (start.getMonth() === end.getMonth()) {
      return `${format(start, 'd.', { locale: dateLocale })} – ${format(end, 'd. MMMM yyyy', { locale: dateLocale })}`
    }
    return `${format(start, 'd. MMM', { locale: dateLocale })} – ${format(end, 'd. MMM yyyy', { locale: dateLocale })}`
  }, [days, dateLocale])

  const onPrev = () => setWeekAnchor((d) => addWeeks(d, -1))
  const onNext = () => setWeekAnchor((d) => addWeeks(d, 1))
  const onToday = () => setWeekAnchor(new Date())

  const onCellTap = (employeeId: string, day: Date, plans: Plan[]) => {
    if (plans.length === 0) {
      const date = format(day, 'yyyy-MM-dd')
      router.push(`/plans/new?employeeId=${employeeId}&date=${date}` as any)
      return
    }
    // One plan → straight to detail. Multiple → open detail of the first
    // (admin can then navigate). Listing multiples inside a 100×72 cell
    // doesn't read on mobile.
    router.push(`/plans/${plans[0].id}` as any)
  }

  const onCellLongPress = (plans: Plan[]) => {
    if (plans.length === 0) return
    setActionPlan(plans[0])
  }

  const closeActions = () => {
    setActionPlan(null)
    setReassignOpen(false)
    setMoveDateOpen(false)
  }

  const doReassign = async (newEmployeeId: string) => {
    if (!actionPlan) return
    try {
      await updatePlanField(actionPlan.id, { employee_id: newEmployeeId })
      const newName = filteredEmployees.find((e) => e.id === newEmployeeId)?.full_name ?? '—'
      toast.success(
        L(`Plan an ${newName} übertragen`, `Plan reassigned to ${newName}`),
      )
      closeActions()
    } catch (err: any) {
      toast.error(err?.message ?? L('Übertragung fehlgeschlagen', 'Reassign failed'))
    }
  }

  const doMoveDate = async (newDay: Date) => {
    if (!actionPlan) return
    try {
      // Preserve the time portion; shift the calendar day only.
      const oldStart = new Date(actionPlan.start_time)
      const oldEnd = new Date(actionPlan.end_time)
      const newStart = new Date(newDay)
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
      const newEnd = new Date(newDay)
      newEnd.setHours(oldEnd.getHours(), oldEnd.getMinutes(), 0, 0)
      // Preserve overnight roll-over.
      if (newEnd.getTime() <= newStart.getTime()) {
        newEnd.setDate(newEnd.getDate() + 1)
      }
      await updatePlanField(actionPlan.id, {
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
      })
      toast.success(
        L(
          `Plan auf ${format(newDay, 'EEEE, dd.MM.', { locale: dateLocale })} verschoben`,
          `Plan moved to ${format(newDay, 'EEE, dd.MM.', { locale: dateLocale })}`,
        ),
      )
      closeActions()
    } catch (err: any) {
      toast.error(err?.message ?? L('Verschieben fehlgeschlagen', 'Move failed'))
    }
  }

  const doDelete = async () => {
    if (!actionPlan) return
    try {
      await deletePlan(actionPlan.id)
      toast.success(L('Plan gelöscht', 'Plan deleted'))
      closeActions()
    } catch (err: any) {
      toast.error(err?.message ?? L('Löschen fehlgeschlagen', 'Delete failed'))
    }
  }

  // ── Web drag-and-drop handlers ──────────────────────────────────────────
  const handleDragStart = (planId: string, empId: string, d: string) => {
    dragRef.current = { planId, employeeId: empId, date: d }
  }
  const handleDragOver = (empId: string, d: string) => {
    setDragOverKey(`${empId}|${d}`)
  }
  const handleDragEnd = () => {
    dragRef.current = null
    setDragOverKey(null)
  }
  const handleDrop = async (targetEmpId: string, targetDate: string) => {
    const src = dragRef.current
    dragRef.current = null
    setDragOverKey(null)
    if (!src || (src.employeeId === targetEmpId && src.date === targetDate)) return
    try {
      const patch: { employee_id?: string; start_time?: string; end_time?: string } = {}
      if (src.employeeId !== targetEmpId) patch.employee_id = targetEmpId
      if (src.date !== targetDate) {
        const plan = plans.find((p) => p.id === src.planId)
        if (plan) {
          const oldStart = new Date(plan.start_time)
          const oldEnd = new Date(plan.end_time)
          const [yr, mo, dy] = targetDate.split('-').map(Number)
          const newStart = new Date(yr, mo - 1, dy, oldStart.getHours(), oldStart.getMinutes(), 0, 0)
          const newEnd = new Date(yr, mo - 1, dy, oldEnd.getHours(), oldEnd.getMinutes(), 0, 0)
          if (newEnd.getTime() <= newStart.getTime()) newEnd.setDate(newEnd.getDate() + 1)
          patch.start_time = newStart.toISOString()
          patch.end_time = newEnd.toISOString()
        }
      }
      await updatePlanField(src.planId, patch)
      const newEmpName = filteredEmployees.find((e) => e.id === targetEmpId)?.full_name ?? '—'
      const sameEmp = src.employeeId === targetEmpId
      toast.success(
        sameEmp
          ? L(`Plan auf ${targetDate} verschoben`, `Plan moved to ${targetDate}`)
          : L(`Plan an ${newEmpName} übertragen`, `Plan reassigned to ${newEmpName}`),
      )
    } catch (err: any) {
      toast.error(err?.message ?? L('Drag fehlgeschlagen', 'Drag failed'))
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          stickyHeaderIndices={[0]}
          refreshControl={
            <RefreshControl
              refreshing={loadingPlans || loadingProfiles}
              onRefresh={refetch}
              tintColor="#0064E0"
            />
          }
        >
          <View style={{ backgroundColor: '#FFFFFF', zIndex: 10 }}>
            <View className="px-5 pt-2 pb-3">
              <PageHeader
                showBack
                title={L('Dashboard', 'Dashboard')}
                subtitle={L('Wöchentliche Übersicht aller Schichten', 'Weekly view of all shifts')}
                onBack={goBack}
              />

              {/* Toolbar — Wilson-style: PERIOD label · date · navigation · summary chip */}
              <View
                className="flex-row items-center mb-3"
                style={{
                  backgroundColor: C.chrome,
                  borderWidth: 1,
                  borderColor: C.border,
                  borderRadius: 14,
                  padding: 8,
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={onPrev}
                  style={({ pressed }: { pressed: boolean }) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: C.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel={L('Vorherige Woche', 'Previous week')}
                >
                  <ChevronLeft size={16} color={C.textMuted} />
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '900',
                      color: C.textFaint,
                      letterSpacing: 1.2,
                      textTransform: 'uppercase',
                    }}
                  >
                    {L('Zeitraum', 'Period')}
                  </Text>
                  <Text
                    style={{ fontSize: 13, fontWeight: '900', color: C.text, marginTop: 1 }}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {weekLabel}
                  </Text>
                </View>

                <Pressable
                  onPress={onToday}
                  style={({ pressed }: { pressed: boolean }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: '#0064E0',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF' }}>
                    {L('Heute', 'Today')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onNext}
                  style={({ pressed }: { pressed: boolean }) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: C.border,
                    backgroundColor: C.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel={L('Nächste Woche', 'Next week')}
                >
                  <ChevronRight size={16} color={C.textMuted} />
                </Pressable>
              </View>

              {/* Search + customer filter */}
              <View className="flex-row gap-2 mb-2">
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    height: 40,
                  }}
                >
                  <Search size={14} color="#94A3B8" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={L('Mitarbeiter suchen…', 'Search employees…')}
                    placeholderTextColor="#94A3B8"
                    style={{ flex: 1, marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#0F172A' }}
                    autoCapitalize="none"
                  />
                </View>
                <Pressable
                  onPress={() => setCustomerPickerOpen((v) => !v)}
                  style={({ pressed }: { pressed: boolean }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: customerFilter === 'all' ? '#E5E7EB' : '#0064E0',
                    backgroundColor: customerFilter === 'all' ? '#FFFFFF' : '#EFF6FF',
                    height: 40,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <UsersIcon size={12} color={customerFilter === 'all' ? '#475569' : '#0064E0'} />
                  <Text
                    className="ml-1.5"
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: customerFilter === 'all' ? '#475569' : '#0064E0',
                    }}
                    numberOfLines={1}
                  >
                    {customerFilter === 'all'
                      ? L('Alle Kunden', 'All customers')
                      : (customerOptions.find((c) => c.id === customerFilter)?.name ?? '—').split(' ')[0]}
                  </Text>
                </Pressable>
              </View>

              {customerPickerOpen && (
                <View className="flex-row flex-wrap gap-2 mb-2">
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
              )}
            </View>
          </View>

          {/* Grid — horizontal scroll for days + employee column */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <View>
              {/* Day header row */}
              <View
                style={{
                  flexDirection: 'row',
                  borderBottomWidth: 2,
                  borderColor: C.border,
                  backgroundColor: C.chrome,
                }}
              >
                <View
                  style={{
                    width: EMP_COL_W,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRightWidth: 1,
                    borderColor: C.border,
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: '900',
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      color: C.textFaint,
                    }}
                  >
                    {L('Mitarbeiter', 'User')} · {filteredEmployees.length}
                  </Text>
                </View>
                {days.map((d) => {
                  const today = isToday(d)
                  return (
                    <View
                      key={d.toISOString()}
                      style={{
                        width: DAY_COL_W,
                        paddingVertical: 8,
                        paddingHorizontal: 6,
                        alignItems: 'center',
                        backgroundColor: today ? C.todayBg : C.chrome,
                        borderRightWidth: 1,
                        borderColor: C.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '900',
                          color: today ? C.todayText : C.text,
                          letterSpacing: -0.2,
                        }}
                      >
                        {format(d, 'dd.MM.')}
                      </Text>
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '900',
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          color: today ? C.todayText : C.textMuted,
                          marginTop: 2,
                        }}
                      >
                        {format(d, 'EEE', { locale: dateLocale })}
                      </Text>
                      {/* Time tick row — 00:00 · 08:00 · 16:00 — Wilson's
                          time-subdivision markers. Slightly larger so they
                          stay legible at 130px column width. */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          width: '100%',
                          marginTop: 6,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            color: today ? C.todayText : C.textMuted,
                            fontWeight: '700',
                          }}
                        >
                          00:00
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            color: today ? C.todayText : C.textMuted,
                            fontWeight: '700',
                          }}
                        >
                          08:00
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            color: today ? C.todayText : C.textMuted,
                            fontWeight: '700',
                          }}
                        >
                          16:00
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>

              {/* Employee rows — empty state needs to distinguish three cases:
                   1) profile has no organization_id (broken account)
                   2) org has zero members (fresh org, hint at invites)
                   3) search filtered everyone out (just say so) */}
              {filteredEmployees.length === 0 && !loadingProfiles ? (
                <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
                  {profilesError?.kind === 'missing_org' ? (
                    <>
                      <Text
                        style={{
                          fontSize: 13,
                          color: C.warning,
                          fontWeight: '900',
                          textAlign: 'center',
                        }}
                      >
                        {L(
                          'Ihr Konto ist keiner Organisation zugeordnet.',
                          'Your account is not linked to an organization.',
                        )}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.textMuted,
                          textAlign: 'center',
                          maxWidth: 320,
                        }}
                      >
                        {profilesError.message}
                      </Text>
                    </>
                  ) : search.trim().length > 0 ? (
                    <Text style={{ fontSize: 13, color: C.textFaint }}>
                      {L(
                        `Keine Mitarbeiter passen zu „${search}".`,
                        `No employees match "${search}".`,
                      )}
                    </Text>
                  ) : profiles.length === 0 ? (
                    <>
                      <Text
                        style={{
                          fontSize: 13,
                          color: C.textMuted,
                          fontWeight: '800',
                          textAlign: 'center',
                        }}
                      >
                        {L(
                          'Noch keine Mitarbeiter in dieser Organisation.',
                          'No employees in this organization yet.',
                        )}
                      </Text>
                      <Pressable
                        onPress={() => router.push('/users' as any)}
                        style={({ pressed }: { pressed: boolean }) => ({
                          marginTop: 4,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 10,
                          backgroundColor: '#0064E0',
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>
                          {L('Mitarbeiter einladen', 'Invite members')}
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Text style={{ fontSize: 13, color: C.textFaint }}>
                      {L('Keine Mitarbeiter gefunden.', 'No employees found.')}
                    </Text>
                  )}
                </View>
              ) : null}

              {filteredEmployees.map((emp, rowIdx) => {
                const initials = (emp.full_name ?? emp.email ?? '?')
                  .split(' ')
                  .map((w) => w[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
                return (
                  <View
                    key={emp.id}
                    style={{
                      flexDirection: 'row',
                      borderBottomWidth: 1,
                      borderColor: C.borderSoft,
                      // Wilson uses an alternating pale teal band so the eye
                      // can track each employee's row across the seven-day
                      // grid. Inactive members get desaturated.
                      backgroundColor: !emp.is_active
                        ? '#F8FAFC'
                        : rowIdx % 2 === 0
                          ? C.bg
                          : '#F0FBF7',
                      opacity: emp.is_active ? 1 : 0.75,
                    }}
                  >
                    <Pressable
                      // Wilson-style: hover over the employee chip on web,
                      // tap on mobile, to reveal a small info card with
                      // email / phone / profession. On web we use the
                      // onHoverIn/Out hooks that RNW exposes on Pressable.
                      onPress={() => setHoveredEmployee(emp)}
                      onHoverIn={() => {
                        if (Platform.OS !== 'web') return
                        if (hoverTimer.current) clearTimeout(hoverTimer.current)
                        hoverTimer.current = setTimeout(
                          () => setHoveredEmployee(emp),
                          120,
                        )
                      }}
                      onHoverOut={() => {
                        if (Platform.OS !== 'web') return
                        if (hoverTimer.current) clearTimeout(hoverTimer.current)
                      }}
                      style={{
                        width: EMP_COL_W,
                        height: ROW_H,
                        paddingHorizontal: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'transparent',
                        borderRightWidth: 1,
                        borderColor: C.border,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 999,
                          backgroundColor: '#EEF2FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8,
                        }}
                      >
                        <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 11 }}>
                          {initials}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontSize: 12, fontWeight: '900', color: C.text }}
                          numberOfLines={1}
                        >
                          {emp.full_name}
                        </Text>
                        <Text
                          style={{ fontSize: 10, color: C.textFaint, marginTop: 1 }}
                          numberOfLines={1}
                        >
                          {emp.role}
                        </Text>
                      </View>
                    </Pressable>
                    {days.map((d) => {
                      const cell = cellPlans(emp.id, d)
                      const cellDate = format(d, 'yyyy-MM-dd')
                      const todayCol = isToday(d)
                      return (
                        <DashboardCell
                          key={`${emp.id}|${d.toISOString()}`}
                          plans={cell}
                          employeeId={emp.id}
                          date={cellDate}
                          isToday={todayCol}
                          onTap={() => onCellTap(emp.id, d, cell)}
                          onLongPress={() => onCellLongPress(cell)}
                          isDragTarget={dragOverKey === `${emp.id}|${cellDate}`}
                          onDragStart={handleDragStart}
                          onDragOver={handleDragOver}
                          onDragEnd={handleDragEnd}
                          onDrop={handleDrop}
                        />
                      )
                    })}
                  </View>
                )
              })}

              {(loadingPlans || loadingProfiles) && filteredEmployees.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color="#0064E0" />
                </View>
              ) : null}

              {/* Per-day totals row (Wilson-style footer) */}
              {filteredEmployees.length > 0 && (
                <View
                  style={{
                    flexDirection: 'row',
                    borderTopWidth: 2,
                    borderBottomWidth: 1,
                    borderColor: C.border,
                    backgroundColor: C.chrome,
                  }}
                >
                  <View
                    style={{
                      width: EMP_COL_W,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRightWidth: 1,
                      borderColor: C.border,
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: '900',
                        letterSpacing: 1.4,
                        textTransform: 'uppercase',
                        color: C.textFaint,
                      }}
                    >
                      {L('Schichten / Tag', 'Shifts / day')}
                    </Text>
                  </View>
                  {days.map((d) => {
                    const key = format(d, 'yyyy-MM-dd')
                    let count = 0
                    for (const emp of filteredEmployees) {
                      count += (byCell.get(`${emp.id}|${key}`) ?? []).filter(planMatchesFilter)
                        .length
                    }
                    const todayCol = isToday(d)
                    return (
                      <View
                        key={`total-${key}`}
                        style={{
                          width: DAY_COL_W,
                          paddingVertical: 12,
                          alignItems: 'center',
                          backgroundColor: todayCol ? C.todayBg : 'transparent',
                          borderRightWidth: 1,
                          borderColor: C.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: '900',
                            color: count > 0 ? '#D97706' : C.textFaint,
                          }}
                        >
                          {count}
                        </Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Summary strip + help text — Wilson's right-rail collapsed for mobile */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 24,
              flexDirection: 'row',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <View
              style={{
                flex: 1,
                minWidth: 140,
                backgroundColor: C.chrome,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '900',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: C.textFaint,
                }}
              >
                {range.startDate} – {range.endDate}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: C.textMuted,
                  fontWeight: '700',
                  marginTop: 4,
                }}
              >
                {L('Sichtbarer Zeitraum', 'Visible period')}
              </Text>
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 140,
                backgroundColor: C.chrome,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '900',
                  letterSpacing: 1.4,
                  textTransform: 'uppercase',
                  color: C.textFaint,
                }}
              >
                {L('Schichten gesamt', 'Total shifts')}
              </Text>
              <Text
                style={{
                  fontSize: 18,
                  color: C.text,
                  fontWeight: '900',
                  marginTop: 2,
                }}
              >
                {plans.filter(planMatchesFilter).length}
              </Text>
            </View>
            <View
              style={{
                width: '100%',
                marginTop: 6,
                backgroundColor: '#FFFBEB',
                borderWidth: 1,
                borderColor: '#FEF3C7',
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 11, color: '#92400E', lineHeight: 16 }} numberOfLines={4}>
                {L(
                  'Tippen Sie auf eine leere Zelle, um eine Schicht anzulegen. Tippen Sie auf eine bestehende für Details. Langes Drücken (oder Drag-and-Drop auf Web): Verschieben, Übertragen, Löschen.',
                  'Tap an empty cell to assign a shift. Tap an existing cell for detail. Long-press (or drag on web): move, reassign, delete.',
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
        employees={filteredEmployees}
        currentEmployeeId={actionPlan?.employee_id ?? null}
        onPick={(id) => {
          void doReassign(id)
        }}
        onClose={() => setReassignOpen(false)}
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

      <EmployeeCard
        profile={hoveredEmployee}
        visible={!!hoveredEmployee}
        onClose={() => setHoveredEmployee(null)}
      />
    </View>
  )
}

// ─── Cell ─────────────────────────────────────────────────────────────────

function DashboardCell({
  plans,
  employeeId,
  date,
  isToday: isTodayCol,
  onTap,
  onLongPress,
  isDragTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  plans: Plan[]
  employeeId: string
  date: string
  isToday: boolean
  onTap: () => void
  onLongPress: () => void
  isDragTarget: boolean
  onDragStart: (planId: string, empId: string, d: string) => void
  onDragOver: (empId: string, d: string) => void
  onDragEnd: () => void
  onDrop: (empId: string, d: string) => void
}) {
  const has = plans.length > 0
  const first = plans[0]
  // Shift code (Wilson reference shows codes like "TB-KAW 70200"). Prefer
  // an explicit start-location short_code; fall back to customer name; then
  // free-text location.
  const shiftCode =
    first?.start_location?.short_code ??
    first?.customer?.name ??
    first?.location ??
    '—'
  // Secondary location codes — start → destination short codes,
  // e.g. "DE_K… → DE_R…". Falls back to free-text location.
  const startLoc = first?.start_location?.short_code ?? ''
  const destLoc = first?.destination_location?.short_code ?? ''
  const locLine =
    startLoc && destLoc && startLoc !== destLoc
      ? `${startLoc} → ${destLoc}`
      : startLoc || destLoc || first?.location || ''
  const time = first
    ? `${safeFormatTime(first.start_time)}–${safeFormatTime(first.end_time)}`
    : ''
  const status = first?.status ?? ''
  const isCancelled = status === 'cancelled' || status === 'rejected'
  // Surface a quick conflict signal: overnight shift, missing location, or
  // an "issue" tag on the plan. Drives the warning triangle.
  const hasWarning = (() => {
    if (!first) return false
    if (isCancelled) return false
    if (!first.start_location_id && !first.location) return true
    // Heuristic: end before start without overnight flag → bad data.
    try {
      const s = new Date(first.start_time).getTime()
      const e = new Date(first.end_time).getTime()
      if (e <= s) return true
    } catch {}
    return false
  })()

  // HTML5 drag-and-drop (web only). RNW forwards unrecognised props to the DOM.
  const webDragProps =
    Platform.OS === 'web'
      ? {
          draggable: has || undefined,
          onDragStart: has
            ? (e: any) => {
                e.dataTransfer?.setData('text/plain', first!.id)
                onDragStart(first!.id, employeeId, date)
              }
            : undefined,
          onDragOver: (e: any) => {
            e.preventDefault()
            onDragOver(employeeId, date)
          },
          onDrop: (e: any) => {
            e.preventDefault()
            onDrop(employeeId, date)
          },
          onDragEnd,
        }
      : {}

  // Cell chrome colours derived from C palette. Today's column gets a
  // faint sky tint when empty so the vertical "today" line stays visible
  // even in rows with no shifts.
  const cellBg = isDragTarget
    ? C.dragTargetBg
    : has
      ? isCancelled
        ? C.cancelledBg
        : C.shiftBg
      : isTodayCol
        ? '#F0F9FF'
        : C.bg
  const cellBorder = isDragTarget ? C.dragTargetBorder : C.borderSoft

  return (
    <Pressable
      onPress={onTap}
      onLongPress={onLongPress}
      delayLongPress={350}
      {...(webDragProps as any)}
      style={({ pressed }: { pressed: boolean }) => ({
        width: DAY_COL_W,
        height: ROW_H,
        padding: 5,
        backgroundColor: cellBg,
        borderRightWidth: 1,
        borderColor: cellBorder,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {has ? (
        // Wilson cell — top header bar with warning + shift code, then two
        // location codes side-by-side, then start | end times row.
        <View
          style={{
            flex: 1,
            backgroundColor: isCancelled ? '#FECACA' : '#D1FAE5',
            borderRadius: 6,
            borderWidth: 1,
            borderColor: isCancelled ? '#F87171' : '#6EE7B7',
            overflow: 'hidden',
          }}
        >
          {/* Header — warning triangle + shift code */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 4,
              paddingTop: 3,
              paddingBottom: 1,
              gap: 3,
            }}
          >
            {hasWarning ? (
              <AlertTriangle size={9} color={C.warning} fill={C.warning} />
            ) : null}
            <Text
              style={{
                flex: 1,
                fontSize: 10,
                fontWeight: '900',
                letterSpacing: -0.2,
                color: isCancelled ? C.cancelledText : '#0F172A',
                textDecorationLine: isCancelled ? 'line-through' : 'none',
              }}
              numberOfLines={1}
            >
              {shiftCode}
            </Text>
            {plans.length > 1 ? (
              <View
                style={{
                  backgroundColor: C.shiftAccent,
                  borderRadius: 999,
                  paddingHorizontal: 4,
                  paddingVertical: 0,
                }}
              >
                <Text style={{ fontSize: 7, color: '#FFFFFF', fontWeight: '900' }}>
                  +{plans.length - 1}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Two location codes side-by-side — the Wilson signature row */}
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: 4,
              gap: 4,
              marginTop: 1,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 8.5,
                fontWeight: '800',
                color: isCancelled ? '#991B1B' : '#0E7490',
                letterSpacing: 0.1,
              }}
              numberOfLines={1}
            >
              {startLoc || '—'}
            </Text>
            <Text
              style={{
                flex: 1,
                fontSize: 8.5,
                fontWeight: '800',
                color: isCancelled ? '#991B1B' : '#0E7490',
                letterSpacing: 0.1,
                textAlign: 'right',
              }}
              numberOfLines={1}
            >
              {destLoc || (startLoc ? '' : '—')}
            </Text>
          </View>

          {/* Time row — start | end */}
          <View
            style={{
              marginTop: 'auto',
              flexDirection: 'row',
              paddingHorizontal: 4,
              paddingVertical: 2,
              gap: 4,
              backgroundColor: isCancelled ? '#FCA5A5' : '#A7F3D0',
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 9,
                fontWeight: '900',
                color: isCancelled ? '#7F1D1D' : '#064E3B',
              }}
              numberOfLines={1}
            >
              {safeFormatTime(first!.start_time)}
            </Text>
            <Text
              style={{
                flex: 1,
                fontSize: 9,
                fontWeight: '900',
                color: isCancelled ? '#7F1D1D' : '#064E3B',
                textAlign: 'right',
              }}
              numberOfLines={1}
            >
              {safeFormatTime(first!.end_time)}
            </Text>
          </View>
        </View>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: C.border,
            backgroundColor: '#FCFCFD',
          }}
        >
          <Plus size={14} color={C.textFaint} />
        </View>
      )}
    </Pressable>
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
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? '#0064E0' : '#E5E7EB',
        backgroundColor: active ? '#0064E0' : '#FFFFFF',
        opacity: pressed ? 0.85 : 1,
        maxWidth: 220,
      })}
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
  const title =
    plan.customer?.name ??
    plan.start_location?.short_code ??
    plan.location ??
    L('Schicht', 'Shift')

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
            <Text className="text-[16px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
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
          <SheetAction
            icon={<UsersIcon size={18} color="#0064E0" />}
            label={L('An anderen Mitarbeiter übertragen', 'Reassign to another employee')}
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
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderColor: '#F1F5F9',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text
        className="ml-3"
        style={{
          fontSize: 14,
          fontWeight: '700',
          color: destructive ? '#DC2626' : '#0F172A',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function ReassignSheet({
  visible,
  employees,
  currentEmployeeId,
  onPick,
  onClose,
}: {
  visible: boolean
  employees: { id: string; full_name: string | null; role: string }[]
  currentEmployeeId: string | null
  onPick: (id: string) => void
  onClose: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable
          className="w-full bg-white dark:bg-slate-900 rounded-t-3xl p-5"
          onPress={(e) => e.stopPropagation()}
          style={{ maxWidth: 520, maxHeight: '80%' }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[16px] font-black text-gray-900 dark:text-white">
              {L('Übertragen an…', 'Reassign to…')}
            </Text>
            <Pressable onPress={onClose} className="p-1">
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 400 }}>
            {employees.map((e) => {
              const active = e.id === currentEmployeeId
              return (
                <Pressable
                  key={e.id}
                  onPress={() => onPick(e.id)}
                  style={({ pressed }: { pressed: boolean }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderBottomWidth: 1,
                    borderColor: '#F1F5F9',
                    opacity: pressed ? 0.7 : 1,
                    backgroundColor: active ? '#EFF6FF' : 'transparent',
                  })}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active ? '900' : '700',
                      color: active ? '#0064E0' : '#0F172A',
                    }}
                    numberOfLines={1}
                  >
                    {e.full_name ?? '—'}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 }}
                    numberOfLines={1}
                  >
                    {e.role}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
                style={({ pressed }: { pressed: boolean }) => ({
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  borderBottomWidth: 1,
                  borderColor: '#F1F5F9',
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: active ? '#EFF6FF' : 'transparent',
                })}
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
    <Pressable
      onPress={onPress}
      disabled={!interactive}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: '#F1F5F9',
        opacity: pressed && interactive ? 0.6 : 1,
      })}
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
