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

import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
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
import type { Plan } from '@/lib/types'

const DAY_COL_W = 110
const EMP_COL_W = 130
const ROW_H = 72

export default function DashboardScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const goBack = useSafeBack('/plans')
  const router = useRouter()
  const { role } = useUser()

  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date())
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [actionPlan, setActionPlan] = useState<Plan | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [moveDateOpen, setMoveDateOpen] = useState(false)

  const { profiles, loading: loadingProfiles } = useProfiles(false)
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
  if (!canCreatePlans(role)) {
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

              {/* Week navigator */}
              <View className="flex-row items-center justify-between mb-3">
                <Pressable
                  onPress={onPrev}
                  style={({ pressed }: { pressed: boolean }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel={L('Vorherige Woche', 'Previous week')}
                >
                  <ChevronLeft size={18} color="#475569" />
                </Pressable>
                <View className="flex-1 items-center mx-2">
                  <Text
                    className="text-[14px] font-black text-gray-900 dark:text-white"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {weekLabel}
                  </Text>
                  <Pressable onPress={onToday}>
                    <Text className="text-[11px] font-bold text-[#0064E0] mt-0.5">
                      {L('Heute', 'Today')}
                    </Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={onNext}
                  style={({ pressed }: { pressed: boolean }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                  })}
                  accessibilityLabel={L('Nächste Woche', 'Next week')}
                >
                  <ChevronRight size={18} color="#475569" />
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
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            <View>
              {/* Day header row */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
                <View
                  style={{
                    width: EMP_COL_W,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    backgroundColor: '#F8FAFC',
                    borderRightWidth: 1,
                    borderColor: '#E5E7EB',
                    justifyContent: 'center',
                  }}
                >
                  <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    {L('Mitarbeiter', 'Employee')}
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
                        backgroundColor: today ? '#EFF6FF' : '#F8FAFC',
                        borderRightWidth: 1,
                        borderColor: '#E5E7EB',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '900',
                          letterSpacing: 1.2,
                          textTransform: 'uppercase',
                          color: today ? '#0064E0' : '#94A3B8',
                        }}
                      >
                        {format(d, 'EEE', { locale: dateLocale })}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '900',
                          color: today ? '#0064E0' : '#0F172A',
                          marginTop: 2,
                        }}
                      >
                        {format(d, 'd.')}
                      </Text>
                    </View>
                  )
                })}
              </View>

              {/* Employee rows */}
              {filteredEmployees.length === 0 && !loadingProfiles ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text className="text-[13px] text-gray-400">
                    {L('Keine Mitarbeiter gefunden.', 'No employees found.')}
                  </Text>
                </View>
              ) : null}

              {filteredEmployees.map((emp) => (
                <View
                  key={emp.id}
                  style={{
                    flexDirection: 'row',
                    borderBottomWidth: 1,
                    borderColor: '#F1F5F9',
                  }}
                >
                  <View
                    style={{
                      width: EMP_COL_W,
                      height: ROW_H,
                      paddingHorizontal: 8,
                      justifyContent: 'center',
                      backgroundColor: '#FFFFFF',
                      borderRightWidth: 1,
                      borderColor: '#E5E7EB',
                    }}
                  >
                    <Text
                      className="text-[12px] font-black text-gray-900 dark:text-white"
                      numberOfLines={1}
                    >
                      {emp.full_name}
                    </Text>
                    <Text
                      className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5"
                      numberOfLines={1}
                    >
                      {emp.role}
                    </Text>
                  </View>
                  {days.map((d) => {
                    const cell = cellPlans(emp.id, d)
                    return (
                      <DashboardCell
                        key={`${emp.id}|${d.toISOString()}`}
                        plans={cell}
                        onTap={() => onCellTap(emp.id, d, cell)}
                        onLongPress={() => onCellLongPress(cell)}
                      />
                    )
                  })}
                </View>
              ))}

              {(loadingPlans || loadingProfiles) && filteredEmployees.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color="#0064E0" />
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500" numberOfLines={3}>
              {L(
                'Tippen Sie auf eine leere Zelle, um eine Schicht anzulegen. Tippen Sie auf eine bestehende Zelle für Details. Langes Drücken öffnet Verschieben / Übertragen / Löschen.',
                'Tap an empty cell to assign a shift. Tap an existing cell for details. Long-press for move / reassign / delete.',
              )}
            </Text>
            <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-2">
              {range.startDate} – {range.endDate}
            </Text>
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
    </View>
  )
}

// ─── Cell ─────────────────────────────────────────────────────────────────

function DashboardCell({
  plans,
  onTap,
  onLongPress,
}: {
  plans: Plan[]
  onTap: () => void
  onLongPress: () => void
}) {
  const has = plans.length > 0
  const first = plans[0]
  const label =
    first?.customer?.name ??
    first?.start_location?.short_code ??
    first?.location ??
    '—'
  const time = first
    ? `${safeFormatTime(first.start_time)}–${safeFormatTime(first.end_time)}`
    : ''
  const status = first?.status ?? ''
  const isCancelled = status === 'cancelled' || status === 'rejected'

  return (
    <Pressable
      onPress={onTap}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }: { pressed: boolean }) => ({
        width: DAY_COL_W,
        height: ROW_H,
        padding: 6,
        backgroundColor: has ? (isCancelled ? '#FEE2E2' : '#EFF6FF') : '#FFFFFF',
        borderRightWidth: 1,
        borderColor: '#F1F5F9',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {has ? (
        <View
          style={{
            flex: 1,
            backgroundColor: isCancelled ? '#FECACA' : '#DBEAFE',
            borderRadius: 8,
            paddingHorizontal: 6,
            paddingVertical: 4,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '900',
              color: isCancelled ? '#7F1D1D' : '#1E3A8A',
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
          <Text
            style={{
              fontSize: 9,
              fontWeight: '700',
              color: isCancelled ? '#991B1B' : '#1E40AF',
              marginTop: 1,
            }}
            numberOfLines={1}
          >
            {time}
          </Text>
          {plans.length > 1 ? (
            <Text style={{ fontSize: 9, color: '#475569', fontWeight: '800', marginTop: 1 }}>
              +{plans.length - 1}
            </Text>
          ) : null}
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
            borderColor: '#E5E7EB',
          }}
        >
          <Plus size={14} color="#CBD5E1" />
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
