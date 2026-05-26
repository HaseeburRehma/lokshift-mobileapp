/**
 * Time Account screen — faithful port of the web
 * `/dashboard/time-account/page.tsx` three-view flow:
 *
 *   ① Personnel view (admin / dispatcher)
 *      - Search + PDF export
 *      - Filter chips with each employee's balance inline
 *      - Hero saldo card (org-total OR selected-employee balance)
 *      - 3 stats tiles
 *      - Inline EmployeeMonthlyPanel — shown when an employee is selected,
 *        ends with a "Gesamte Details ansehen" CTA that drills into the
 *        per-employee overview screen at /account/employee/[id]
 *      - Personnel table — full list (avatar · name · target · balance pill
 *        · chevron). Tap row = same toggle behaviour as the chips.
 *
 *   ② Overview view (employee personal OR admin drill-in)
 *      - Lives at /account/employee/[id] (admin) or this screen for an
 *        employee viewing their own data.
 *      - 4 stats + monthly cards (each tap → /account/[month])
 *
 *   ③ Monthly view — already lives at /account/[month].
 */

import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Search,
  Users as UsersIcon,
  Clock,
  Download,
  Calendar as CalendarIcon,
  ArrowRight,
} from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeAccount } from '@/hooks/useTimeAccount'
import { useOrganizationTimeAccounts, type OrgTimeAccount } from '@/hooks/useOrgTimeAccounts'
import { exportTimeAccountsPdf } from '@/lib/pdf/reports'

// ─── Screen entry ─────────────────────────────────────────────────────────

export default function TimeAccountScreen() {
  const { isAdmin, isDispatcher } = useUser()
  const managerial = isAdmin || isDispatcher

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      {managerial ? <PersonnelView /> : <EmployeePersonalView />}
    </View>
  )
}

// ─── Personnel view ───────────────────────────────────────────────────────

function PersonnelView() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const router = useRouter()
  const { accounts, loading, refetch } = useOrganizationTimeAccounts()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const filtered = useMemo(
    () => accounts.filter((a) => a.full_name.toLowerCase().includes(search.toLowerCase())),
    [accounts, search],
  )

  const selected: OrgTimeAccount | null = useMemo(
    () => (selectedId ? accounts.find((a) => a.employee_id === selectedId) ?? null : null),
    [accounts, selectedId],
  )

  const orgTotal = useMemo(
    () => accounts.reduce((s, a) => s + a.balance, 0),
    [accounts],
  )
  const compliantCount = useMemo(
    () => accounts.filter((a) => a.balance >= 0).length,
    [accounts],
  )

  const heroBalance = selected ? selected.balance : orgTotal
  const heroPositive = heroBalance >= 0

  const onExportPdf = async () => {
    const data = filtered
    if (data.length === 0) {
      toast.error(L('Keine Mitarbeiter zum Exportieren.', 'No employees to export.'))
      return
    }
    setExporting(true)
    try {
      await exportTimeAccountsPdf(data, {
        title: L('Zeitkonten-Übersicht', 'Time Account Overview'),
        subtitle: L(
          `Stand ${format(new Date(), 'dd.MM.yyyy')}`,
          `As of ${format(new Date(), 'yyyy-MM-dd')}`,
        ),
        filename: `zeitkonten_${format(new Date(), 'yyyy-MM-dd')}`,
        locale,
      })
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  // First-load spinner — mirrors the web's <Loader2/> wait state.
  if (loading && accounts.length === 0) {
    return <LoadingSpinner label={L('Personal wird geladen…', 'Loading personnel…')} />
  }

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        {/* Title */}
        <View className="mb-4 px-1">
          <Text className="text-[26px] font-black text-[#0064E0] tracking-tight leading-tight">
            {L('Personal-Zeitkonten', 'Personnel Accounts')}
          </Text>
          <Text className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">
            {L('Zeitsalden aller Mitarbeiter überwachen', 'Monitor time balances across your workforce')}
          </Text>
        </View>

        {/* Search + PDF */}
        <View className="flex-row gap-2 mb-4">
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
              borderWidth: 1,
              borderColor: '#E5E7EB',
              borderRadius: 14,
              paddingHorizontal: 12,
              height: 44,
            }}
          >
            <Search size={16} color="#94A3B8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={L('Mitarbeiter suchen…', 'Search employees…')}
              placeholderTextColor="#94A3B8"
              style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#0F172A' }}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
          <Pressable
            onPress={onExportPdf}
            disabled={exporting}
            style={({ pressed }: { pressed: boolean }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#E5E7EB',
              backgroundColor: '#FFFFFF',
              height: 44,
              opacity: exporting ? 0.6 : pressed ? 0.85 : 1,
            })}
          >
            <Download size={14} color="#0064E0" />
            <Text className="text-[12px] font-black text-gray-700 dark:text-white ml-1.5">
              {exporting ? '…' : 'PDF'}
            </Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <View className="flex-row flex-wrap gap-2 mb-5">
          <FilterChip
            label={L('Alle Mitarbeiter', 'All Employees')}
            selected={selectedId === null}
            onPress={() => setSelectedId(null)}
            leadingIcon={<UsersIcon size={12} color={selectedId === null ? '#fff' : '#64748B'} />}
            variant="all"
          />
          {filtered.map((a) => {
            const isSelected = selectedId === a.employee_id
            const firstName = a.full_name.split(' ')[0] ?? a.full_name
            const value = `${a.balance >= 0 ? '+' : ''}${a.balance.toFixed(1)}${hr}`
            return (
              <FilterChip
                key={a.employee_id}
                label={firstName}
                value={value}
                selected={isSelected}
                positive={a.balance >= 0}
                onPress={() => setSelectedId(isSelected ? null : a.employee_id)}
              />
            )
          })}
        </View>

        {/* Hero saldo */}
        <View
          style={{
            backgroundColor: '#0F172A',
            borderRadius: 28,
            padding: 24,
            marginBottom: 16,
            overflow: 'hidden',
          }}
        >
          <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#60A5FA' }}>
            {selected
              ? L('Mitarbeiter-Saldo', 'Employee Balance')
              : L('Organisations-Saldo', 'Organisation Balance')}
          </Text>
          <View className="flex-row items-baseline mt-3">
            <Text
              style={{
                fontSize: 44,
                fontWeight: '900',
                color: heroPositive ? '#60A5FA' : '#F87171',
                letterSpacing: -1,
              }}
            >
              {heroPositive ? '+' : ''}
              {heroBalance.toFixed(1)}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#94A3B8', marginLeft: 6 }}>
              {hr}
            </Text>
          </View>
          <Text style={{ color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 280 }}>
            {selected
              ? L(
                  `Angesammelte Zeitguthaben für ${selected.full_name}.`,
                  `Accumulated time credits for ${selected.full_name}.`,
                )
              : L(
                  'Angesammelte Zeitguthaben der gesamten Organisation.',
                  'Accumulated time credits across the entire workforce.',
                )}
          </Text>
        </View>

        {/* Stats tiles */}
        {selected ? (
          <View className="flex-row gap-3 mb-5">
            <StatTile
              label={L('Ist-Stunden', 'Actual hours')}
              value={`${selected.actual_hours.toFixed(1)}${hr}`}
              iconBg="#DBEAFE"
              icon={<Clock size={14} color="#0064E0" />}
            />
            <StatTile
              label={L('Soll-Stunden', 'Target hours')}
              value={`${selected.target_hours.toFixed(1)}${hr}`}
              iconBg="#DCFCE7"
              icon={<TrendingUp size={14} color="#10B981" />}
            />
          </View>
        ) : (
          <View className="flex-row gap-3 mb-5">
            <StatTile
              label={L('Mitarbeiter', 'Employees')}
              value={String(accounts.length)}
              iconBg="#DBEAFE"
              icon={<UsersIcon size={14} color="#0064E0" />}
            />
            <StatTile
              label={L('Compliant', 'Compliant')}
              value={`${compliantCount}/${accounts.length}`}
              iconBg="#DCFCE7"
              icon={<TrendingUp size={14} color="#10B981" />}
            />
          </View>
        )}

        {/* Inline monthly panel when an employee is selected */}
        {selected && (
          <EmployeeMonthlyPanel
            employeeId={selected.employee_id}
            employeeName={selected.full_name}
            onViewFull={() => router.push(`/account/employee/${selected.employee_id}` as any)}
          />
        )}

        {/* Personnel table (always visible) */}
        <View className="mt-4">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
            {selected ? L('Gesamtes Personal', 'All Personnel') : L('Personal-Liste', 'Personnel List')}
          </Text>
          {filtered.length === 0 ? (
            <Card className="items-center py-10">
              <Text className="text-[14px] text-gray-400 dark:text-slate-500">
                {L('Keine Mitarbeiter gefunden.', 'No employees found.')}
              </Text>
            </Card>
          ) : (
            filtered.map((a) => {
              const isActive = selectedId === a.employee_id
              const positive = a.balance >= 0
              return (
                <Pressable
                  key={a.employee_id}
                  onPress={() => setSelectedId(isActive ? null : a.employee_id)}
                >
                  <Card
                    className={`mb-2 flex-row items-center ${
                      isActive ? 'bg-blue-50/60 dark:bg-blue-900/30' : ''
                    }`}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 14,
                        backgroundColor: isActive ? '#DBEAFE' : '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <UsersIcon size={18} color={isActive ? '#2563EB' : '#94A3B8'} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className={`text-[14px] font-black ${
                          isActive ? 'text-blue-600' : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {a.full_name}
                      </Text>
                      <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
                        {L('Soll', 'Target')}: {a.target_hours.toFixed(1)}
                        {hr}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 10,
                        backgroundColor: positive ? '#DCFCE7' : '#FEE2E2',
                        marginRight: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: positive ? '#059669' : '#DC2626',
                        }}
                      >
                        {positive ? '+' : ''}
                        {a.balance.toFixed(1)}
                        {hr}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={isActive ? '#60A5FA' : '#D1D5DB'} />
                  </Card>
                </Pressable>
              )
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

// ─── Employee personal view (own data) ────────────────────────────────────

function EmployeePersonalView() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const router = useRouter()
  const { monthlyData, totalBalance, loading, refetch } = useTimeAccount()

  if (loading && monthlyData.length === 0) {
    return <LoadingSpinner label={L('Zeitkonto wird geladen…', 'Loading time account…')} />
  }

  const overtimePaid = monthlyData.reduce(
    (s, m) => s + (m.difference > 0 ? m.difference : 0),
    0,
  )
  const latest = monthlyData[0]

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        <View className="mb-4 px-1">
          <Text className="text-[26px] font-black text-[#0064E0] tracking-tight leading-tight">
            {L('Mein Zeitkonto', 'My Time Account')}
          </Text>
          <Text className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">
            {L('Überstunden und Konto-Salden verfolgen', 'Track overtime and account balances')}
          </Text>
        </View>

        <FourStatsGrid
          totalBalance={totalBalance}
          overtimePaid={overtimePaid}
          latestActual={latest?.actualHours ?? 0}
          latestMonthLabel={latest?.label ?? '—'}
          workingDays={latest?.workingDays ?? 0}
          hr={hr}
        />

        <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1 mt-2">
          {L('Monatsübersicht', 'Monthly Breakdown')}
        </Text>

        {monthlyData.length === 0 && !loading ? (
          <Card className="items-center py-10">
            <Text className="text-[14px] text-gray-400 dark:text-slate-500">
              {L('Keine Zeiteinträge gefunden.', 'No time records found.')}
            </Text>
          </Card>
        ) : null}

        {monthlyData.map((m) => (
          <MonthRow
            key={m.key}
            monthLabel={m.label}
            workingDays={m.workingDays}
            actualHours={m.actualHours}
            targetHours={m.targetHours}
            difference={m.difference}
            hr={hr}
            onPress={() => router.push(`/account/${m.key}` as any)}
          />
        ))}
      </ScrollView>
    </Screen>
  )
}

// ─── Inline employee monthly panel (admin · personnel view) ───────────────

function EmployeeMonthlyPanel({
  employeeId,
  employeeName,
  onViewFull,
}: {
  employeeId: string
  employeeName: string
  onViewFull: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const router = useRouter()
  const { monthlyData, loading } = useTimeAccount(employeeId)

  const first6 = monthlyData.slice(0, 6)
  const hasMore = monthlyData.length > 6

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DBEAFE',
        borderRadius: 18,
        overflow: 'hidden',
        marginBottom: 8,
      }}
    >
      {/* Panel header */}
      <View
        style={{
          backgroundColor: 'rgba(219, 234, 254, 0.4)',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: '#DBEAFE',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 12,
            backgroundColor: '#DBEAFE',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <CalendarIcon size={16} color="#2563EB" />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
            {employeeName}
          </Text>
          <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
            {L('Monatliche Zeitkonto-Aufschlüsselung', 'Monthly time account breakdown')}
          </Text>
        </View>
        <Pressable
          onPress={onViewFull}
          style={({ pressed }: { pressed: boolean }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: '#EFF6FF',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text className="text-[11px] font-black text-blue-600 mr-1">
            {L('Details', 'View')}
          </Text>
          <ArrowRight size={12} color="#2563EB" />
        </Pressable>
      </View>

      {/* Body */}
      {loading ? (
        <View style={{ paddingVertical: 32, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
          <ActivityIndicator color="#0064E0" />
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 ml-3">
            {L('Aufschlüsselung wird geladen…', 'Loading breakdown…')}
          </Text>
        </View>
      ) : first6.length === 0 ? (
        <View style={{ paddingVertical: 32, alignItems: 'center' }}>
          <Text className="text-[12px] text-gray-400 dark:text-slate-500">
            {L('Keine Zeiteinträge gefunden.', 'No time records found.')}
          </Text>
        </View>
      ) : (
        first6.map((month) => {
          const positive = month.difference >= 0
          return (
            <Pressable
              key={month.key}
              onPress={() => router.push(`/account/${month.key}?employeeId=${employeeId}` as any)}
              style={({ pressed }: { pressed: boolean }) => ({
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderColor: '#F1F5F9',
                flexDirection: 'row',
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View className="flex-1">
                <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                  {month.label}
                </Text>
                <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                  {month.workingDays} {L('Tage', 'days')} · {month.actualHours.toFixed(1)}
                  {hr} {L('tatsächlich', 'actual')}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: positive ? '#10B981' : '#EF4444',
                }}
              >
                {positive ? '+' : ''}
                {month.difference.toFixed(1)}
                {hr}
              </Text>
            </Pressable>
          )
        })
      )}

      {hasMore && (
        <Pressable
          onPress={onViewFull}
          style={({ pressed }: { pressed: boolean }) => ({
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderColor: '#F1F5F9',
            backgroundColor: '#F8FAFC',
            flexDirection: 'row',
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text className="text-[12px] font-black text-blue-600">
            {L(
              `Alle ${monthlyData.length} Monate anzeigen`,
              `View all ${monthlyData.length} months`,
            )}
          </Text>
          <ArrowRight size={12} color="#2563EB" style={{ marginLeft: 6 }} />
        </Pressable>
      )}
    </View>
  )
}

// ─── Shared pieces ────────────────────────────────────────────────────────

function LoadingSpinner({ label }: { label: string }) {
  return (
    <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
      <ActivityIndicator color="#0064E0" />
      <Text className="text-[12px] font-medium text-gray-400 dark:text-slate-500 mt-3">
        {label}
      </Text>
    </Screen>
  )
}

export function FourStatsGrid({
  totalBalance,
  overtimePaid,
  latestActual,
  latestMonthLabel,
  workingDays,
  hr,
}: {
  totalBalance: number
  overtimePaid: number
  latestActual: number
  latestMonthLabel: string
  workingDays: number
  hr: string
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const balancePositive = totalBalance >= 0
  return (
    <View>
      <View className="flex-row gap-3 mb-3">
        <StatBlock
          label={L('Stundensaldo (lfd. Jahr)', 'Hours Balance (YTD)')}
          value={
            balancePositive
              ? `+${totalBalance.toFixed(1)}${hr}`
              : `${totalBalance.toFixed(1)}${hr}`
          }
          color={balancePositive ? '#10B981' : '#EF4444'}
        />
        <StatBlock
          label={L('Bezahlte Überstunden', 'Overtime Paid')}
          value={`${overtimePaid.toFixed(1)}${hr}`}
          color="#0064E0"
        />
      </View>
      <View className="flex-row gap-3 mb-3">
        <StatBlock
          label={L(`Gesamtstunden (${latestMonthLabel})`, `Total Hours (${latestMonthLabel})`)}
          value={`${latestActual.toFixed(1)}${hr}`}
          color="#0064E0"
        />
        <StatBlock
          label={L('Arbeitstage', 'Working Days')}
          value={String(workingDays)}
          color="#0064E0"
        />
      </View>
    </View>
  )
}

function StatBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        padding: 16,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: '800', color, letterSpacing: -0.5 }}>
        {value}
      </Text>
      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1.5 font-normal" numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

export function MonthRow({
  monthLabel,
  workingDays,
  actualHours,
  targetHours,
  difference,
  hr,
  onPress,
}: {
  monthLabel: string
  workingDays: number
  actualHours: number
  targetHours: number
  difference: number
  hr: string
  onPress: () => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const positive = difference >= 0
  const Icon = positive ? TrendingUp : TrendingDown
  const color = positive ? '#10B981' : '#F97316'
  return (
    <Pressable onPress={onPress}>
      <Card className="mb-2 flex-row items-center">
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center mr-3"
          style={{ backgroundColor: `${color}1A` }}
        >
          <Icon size={20} color={color} />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white">
            {monthLabel}
          </Text>
          <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
            {workingDays} {L('Tage', 'days')} · {actualHours.toFixed(1)}h / {targetHours.toFixed(1)}h
          </Text>
        </View>
        <Text className="text-[16px] font-black mr-2" style={{ color }}>
          {positive ? '+' : ''}
          {difference.toFixed(1)}
          {hr}
        </Text>
        <ChevronRight size={16} color="#D1D5DB" />
      </Card>
    </Pressable>
  )
}

function FilterChip({
  label,
  value,
  selected,
  positive,
  onPress,
  leadingIcon,
  variant = 'employee',
}: {
  label: string
  value?: string
  selected: boolean
  positive?: boolean
  onPress: () => void
  leadingIcon?: React.ReactNode
  variant?: 'employee' | 'all'
}) {
  const bgSelected = variant === 'all' ? '#0F172A' : '#0064E0'
  const borderSelected = variant === 'all' ? '#0F172A' : '#0064E0'
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? borderSelected : '#E5E7EB',
        backgroundColor: selected ? bgSelected : '#FFFFFF',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {leadingIcon ? <View style={{ marginRight: 6 }}>{leadingIcon}</View> : null}
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: selected ? '#FFFFFF' : '#475569',
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={{
            fontSize: 11,
            fontWeight: '800',
            marginLeft: 6,
            color: selected ? '#BFDBFE' : positive ? '#10B981' : '#EF4444',
          }}
        >
          {value}
        </Text>
      ) : null}
    </Pressable>
  )
}

function StatTile({
  label,
  value,
  iconBg,
  icon,
}: {
  label: string
  value: string
  iconBg: string
  icon: React.ReactNode
}) {
  return (
    <Card className="flex-1">
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        {icon}
      </View>
      <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
        {label}
      </Text>
      <Text className="text-[20px] font-black text-gray-900 dark:text-white mt-0.5">
        {value}
      </Text>
    </Card>
  )
}
