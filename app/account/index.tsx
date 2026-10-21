/**
 * Zeitkonto — mobile replica of the webapp's /dashboard/time-account:
 *
 *   ① Personnel view (admin / dispatcher) — PersonnelTimeAccounts
 *      - Title + search + PDF export
 *      - Employee chips with each balance inline
 *      - Stats: Organisations-/Mitarbeiter-Saldo (dark), Mitarbeiter
 *        insgesamt / Tatsächliche Stunden, Compliance / Sollstunden
 *      - Inline monthly panel for the selected employee ("Gesamte Details
 *        ansehen" → /account/employee/[id])
 *      - Personal-Liste card with pagination (10 per page)
 *
 *   ② Overview view (employee personal) — TimeAccountOverview
 *      - 4 stat cards + Monatsübersicht (each tap → /account/[month])
 *      - admin drill-in lives at /account/employee/[id]
 *
 *   ③ Monthly view — /account/[month].
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowRight, Calendar as CalendarIcon, ChevronDown, ChevronRight, Clock, Download, Search, TrendingUp, Users as UsersIcon } from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { C, Pagination } from '@/components/time/ui'
import { FourStatsGrid, MonthlyBreakdownCard, signed } from '@/components/time/account'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeAccount } from '@/hooks/useTimeAccount'
import { useOrganizationTimeAccounts, type OrgTimeAccount } from '@/hooks/useOrgTimeAccounts'
import { exportTimeAccountsPdf } from '@/lib/pdf/reports'
import { monthLabel } from '@/lib/time/format'

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

const ITEMS_PER_PAGE = 10

function PersonnelView() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const router = useRouter()
  const { accounts, loading, refetch } = useOrganizationTimeAccounts()

  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [search])

  const filtered = useMemo(
    () => accounts.filter((a) => a.full_name.toLowerCase().includes(search.toLowerCase())),
    [accounts, search],
  )
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  const selected: OrgTimeAccount | null = useMemo(
    () => (selectedId ? accounts.find((a) => a.employee_id === selectedId) ?? null : null),
    [accounts, selectedId],
  )

  const orgTotal = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts])
  const compliantCount = useMemo(() => accounts.filter((a) => a.balance >= 0).length, [accounts])

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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={C.brand} />}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title={L('Personal-Zeitkonten', 'Personnel Accounts')}
          subtitle={L('Zeitsalden aller Mitarbeiter überwachen', 'Monitor time balances across your workforce')}
        />

        {/* Search + PDF */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: -8 }}>
          <View
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: C.slate50,
              borderWidth: 1,
              borderColor: C.slate200,
              borderRadius: 12,
              paddingHorizontal: 12,
              height: 40,
            }}
          >
            <Search size={16} color={C.slate400} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={L('Mitarbeiter suchen…', 'Search employees…')}
              placeholderTextColor={C.slate400}
              style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '500', color: C.slate700 }}
              autoCapitalize="none"
              returnKeyType="search"
            />
          </View>
          <Pressable onPress={onExportPdf} disabled={exporting} accessibilityRole="button" accessibilityLabel="PDF">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                height: 40,
                opacity: exporting ? 0.6 : 1,
              }}
            >
              {exporting ? <ActivityIndicator size="small" color={C.slate600} /> : <Download size={14} color="#4B5563" />}
              <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '600', color: '#4B5563' }}>PDF</Text>
            </View>
          </Pressable>
        </View>

        {/* Employee filter chips */}
        {accounts.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
            <FilterChip
              label={L('Alle Mitarbeiter', 'All Employees')}
              selected={selectedId === null}
              onPress={() => setSelectedId(null)}
              leadingIcon={<UsersIcon size={14} color={selectedId === null ? '#FFFFFF' : C.slate500} />}
              variant="all"
            />
            {accounts.map((a) => {
              const isSelected = selectedId === a.employee_id
              return (
                <FilterChip
                  key={a.employee_id}
                  label={a.full_name.split(' ')[0] ?? a.full_name}
                  value={signed(a.balance, hr)}
                  selected={isSelected}
                  positive={a.balance >= 0}
                  onPress={() => setSelectedId(isSelected ? null : a.employee_id)}
                />
              )
            })}
          </View>
        ) : null}

        {/* Stats row (stacked on phones) */}
        <View style={{ gap: 12, marginTop: 24 }}>
          <View style={{ backgroundColor: C.slate900, borderRadius: 16, padding: 24, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center', opacity: 0.07 }} pointerEvents="none">
              <Clock size={96} color="#60A5FA" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: '#60A5FA' }}>
              {selected ? L('Mitarbeiter-Saldo', 'Employee Balance') : L('Organisations-Saldo', 'Organisation Balance')}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12 }}>
              <Text
                style={{ fontSize: 36, fontWeight: '700', color: heroPositive ? '#60A5FA' : C.red400, letterSpacing: -0.8, fontVariant: ['tabular-nums'], flexShrink: 1 }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {heroPositive ? `+${heroBalance.toFixed(1)}` : heroBalance.toFixed(1)}
              </Text>
              <Text style={{ marginLeft: 4, fontSize: 20, fontWeight: '500', color: C.slate500 }}>{hr}</Text>
            </View>
            <Text style={{ marginTop: 12, fontSize: 12, lineHeight: 18, color: C.slate400, maxWidth: 220 }}>
              {selected
                ? L(`Angesammelte Zeitguthaben für ${selected.full_name}.`, `Accumulated time credits for ${selected.full_name}.`)
                : L('Angesammelte Zeitguthaben der gesamten Organisation.', 'Accumulated time credits across the entire unit.')}
            </Text>
          </View>

          <StatPanel
            label={selected ? L('Tatsächliche Stunden', 'Actual Hours') : L('Mitarbeiter insgesamt', 'Total Employees')}
            value={<Text style={{ fontSize: 36, fontWeight: '700', color: C.slate900, fontVariant: ['tabular-nums'] }}>{selected ? `${selected.actual_hours.toFixed(1)}${hr}` : String(accounts.length)}</Text>}
            icon={<UsersIcon size={14} color={C.blue600} />}
            iconBg={C.blue50}
            hint={selected ? L('Geleistete Stunden', 'Hours worked') : L('Aktive Belegschaft', 'Operational workforce')}
          />
          <StatPanel
            label={selected ? L('Sollstunden', 'Target Hours') : L('Zeitkonto-Compliance', 'Time Account Compliance')}
            value={
              selected ? (
                <Text style={{ fontSize: 36, fontWeight: '700', color: C.blue600, fontVariant: ['tabular-nums'] }}>{`${selected.target_hours.toFixed(1)}${hr}`}</Text>
              ) : (
                <Text style={{ fontSize: 36, fontWeight: '700', color: C.emerald500, fontVariant: ['tabular-nums'] }}>
                  {String(compliantCount)}
                  <Text style={{ fontSize: 20, fontWeight: '500', color: C.slate300 }}>{`/${accounts.length}`}</Text>
                </Text>
              )
            }
            icon={<TrendingUp size={14} color={C.emerald600} />}
            iconBg={C.emerald50}
            hint={selected ? L('Lfd. Jahr', 'Year to date') : L('Sollstunden erreicht', 'Meeting target hours')}
          />
        </View>

        {/* Inline monthly panel when an employee is selected */}
        {selected ? (
          <View style={{ marginTop: 24 }}>
            <EmployeeMonthlyPanel
              employeeId={selected.employee_id}
              employeeName={selected.full_name}
              onViewFull={() => router.push(`/account/employee/${selected.employee_id}` as any)}
            />
          </View>
        ) : null}

        {/* Personnel list (always visible) */}
        <View style={{ marginTop: 24, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.slate200, borderRadius: 16, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.slate100, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: C.slate900 }}>
              {selected ? L('Gesamtes Personal', 'All Personnel') : L('Personal-Liste', 'Personnel List')}
            </Text>
            {filtered.length > ITEMS_PER_PAGE ? (
              <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400 }}>
                {`${(safePage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(safePage * ITEMS_PER_PAGE, filtered.length)} ${L('von', 'of')} ${filtered.length}`}
              </Text>
            ) : null}
          </View>

          {filtered.length === 0 ? (
            <View style={{ paddingVertical: 56, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate400 }}>{L('Keine Mitarbeiter gefunden.', 'No employees found.')}</Text>
            </View>
          ) : (
            paginated.map((a, idx) => {
              const isActive = selectedId === a.employee_id
              const positive = a.balance >= 0
              return (
                <Pressable key={a.employee_id} onPress={() => setSelectedId(isActive ? null : a.employee_id)} accessibilityState={{ selected: isActive }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: C.slate100,
                      backgroundColor: isActive ? 'rgba(239,246,255,0.6)' : '#FFFFFF',
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isActive ? C.blue100 : C.slate100, alignItems: 'center', justifyContent: 'center' }}>
                      <UsersIcon size={20} color={isActive ? C.blue600 : C.slate400} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: isActive ? C.blue600 : C.slate900 }} numberOfLines={1}>
                        {a.full_name}
                      </Text>
                      <Text style={{ fontSize: 12, color: C.slate400 }} numberOfLines={1}>
                        {`${L('Soll', 'Target')}: ${a.target_hours.toFixed(1)}${hr} · ${a.actual_hours.toFixed(1)} ${L('Std. geleistet', 'hrs worked')}`}
                      </Text>
                    </View>
                    <View style={{ marginLeft: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: positive ? C.emerald50 : C.red50 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: positive ? C.emerald600 : C.red500, fontVariant: ['tabular-nums'] }}>{signed(a.balance, hr)}</Text>
                    </View>
                    <View style={{ marginLeft: 6 }}>
                      {isActive ? <ChevronDown size={16} color="#60A5FA" /> : <ChevronRight size={16} color={C.slate300} />}
                    </View>
                  </View>
                </Pressable>
              )
            })
          )}

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

// ─── Employee personal view (own data) ────────────────────────────────────

function EmployeePersonalView() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { monthlyData, totalBalance, loading, refetch } = useTimeAccount()

  if (loading && monthlyData.length === 0) {
    return <LoadingSpinner label={L('Zeitkonto wird geladen…', 'Loading time account…')} />
  }

  const overtimePaid = monthlyData.reduce((s, m) => s + (m.difference > 0 ? m.difference : 0), 0)

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={C.brand} />}
      >
        <PageHeader
          title={L('Zeitkonten', 'Time Accounts')}
          subtitle={L('Überstunden und Konto-Salden verfolgen', 'Track overtime and account balances')}
        />
        <FourStatsGrid totalBalance={totalBalance} overtimePaid={overtimePaid} latest={monthlyData[0] ?? null} />
        <View style={{ marginTop: 24 }}>
          <MonthlyBreakdownCard data={monthlyData} onMonthPress={(key) => router.push(`/account/${key}` as any)} />
        </View>
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
    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.blue200, borderRadius: 16, overflow: 'hidden' }}>
      {/* Panel header */}
      <View
        style={{
          backgroundColor: 'rgba(239,246,255,0.4)',
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderColor: C.blue100,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: C.blue100, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <CalendarIcon size={16} color={C.blue600} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: C.slate900 }} numberOfLines={1}>{employeeName}</Text>
          <Text style={{ fontSize: 12, color: C.slate400, marginTop: 2 }} numberOfLines={1}>
            {L('Monatliche Zeitkonto-Aufschlüsselung', 'Monthly time account breakdown')}
          </Text>
        </View>
      </View>
      <Pressable onPress={onViewFull} accessibilityRole="button">
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.slate100 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: C.blue600 }}>{L('Gesamte Details ansehen', 'View Full Detail')}</Text>
          <ArrowRight size={14} color={C.blue600} style={{ marginLeft: 6 }} />
        </View>
      </Pressable>

      {/* Body */}
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
          <ActivityIndicator color={C.blue600} />
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate400, marginLeft: 12 }}>{L('Aufschlüsselung wird geladen…', 'Loading breakdown…')}</Text>
        </View>
      ) : first6.length === 0 ? (
        <View style={{ paddingVertical: 40, paddingHorizontal: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate400, textAlign: 'center' }}>
            {L('Keine Zeiteinträge für diesen Mitarbeiter gefunden.', 'No time records found for this employee.')}
          </Text>
        </View>
      ) : (
        first6.map((month, idx) => {
          const positive = month.difference >= 0
          return (
            <Pressable key={month.key} onPress={() => router.push(`/account/${month.key}?employeeId=${employeeId}` as any)}>
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderColor: C.slate100,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: C.slate900 }} numberOfLines={1}>{monthLabel(month.key, locale)}</Text>
                  <Text style={{ fontSize: 12, color: C.slate400, marginTop: 2 }} numberOfLines={1}>
                    {`${month.workingDays} ${L('Tage', 'days')} · ${month.actualHours.toFixed(1)}${hr} ${L('tatsächlich', 'actual')}`}
                  </Text>
                </View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: positive ? C.emerald500 : C.red500, marginLeft: 8, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                  {signed(month.difference, hr)}
                </Text>
              </View>
            </Pressable>
          )
        })
      )}

      {hasMore ? (
        <Pressable onPress={onViewFull}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderColor: C.slate100, backgroundColor: 'rgba(248,250,252,0.3)', flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: C.blue600 }}>
              {L(`Alle ${monthlyData.length} Monate anzeigen`, `View all ${monthlyData.length} months`)}
            </Text>
            <ArrowRight size={14} color={C.blue600} style={{ marginLeft: 6 }} />
          </View>
        </Pressable>
      ) : null}
    </View>
  )
}

// ─── Shared pieces ────────────────────────────────────────────────────────

function LoadingSpinner({ label }: { label: string }) {
  return (
    <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
      <ActivityIndicator color={C.blue600} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400, marginTop: 16 }}>{label}</Text>
    </Screen>
  )
}

function StatPanel({ label, value, icon, iconBg, hint }: { label: string; value: React.ReactNode; icon: React.ReactNode; iconBg: string; hint: string }) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.slate200, borderRadius: 16, padding: 24 }}>
      <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase', color: C.slate400 }}>{label}</Text>
      <View style={{ marginTop: 16 }}>{value}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: '500', color: C.slate400 }}>{hint}</Text>
      </View>
    </View>
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
  const bgSelected = variant === 'all' ? C.slate900 : C.blue600
  return (
    <Pressable onPress={onPress} accessibilityState={{ selected }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: selected ? bgSelected : C.slate200,
          backgroundColor: selected ? bgSelected : '#FFFFFF',
          maxWidth: 240,
        }}
      >
        {leadingIcon ? <View style={{ marginRight: 8 }}>{leadingIcon}</View> : null}
        <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#FFFFFF' : C.slate500, flexShrink: 1 }} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={{ fontSize: 11, fontWeight: '700', marginLeft: 8, color: selected ? C.blue200 : positive ? C.emerald500 : C.red400, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}
