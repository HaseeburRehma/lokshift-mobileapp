/**
 * Auswertungen — Gesamtauswertung + Mehrmonatsreport on screen
 * (Kundenfeedback Punkt 18). Phone replica of the webapp's
 * app/dashboard/reports/overview/page.tsx:
 *
 *   "Alle Lokführer (Monat)" → one card per employee + totals
 *   "Mehrmonatsreport"       → one card per month + totals + charts
 *
 * Values come from the shared report model (`fetchMonthOverview` /
 * `fetchMultiMonthReport`), so they match the Monatsnachweis, the PDF and
 * the Excel export exactly. Tapping a card exports that Monatsnachweis
 * (the webapp opens the monthly statement page instead).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Platform,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronDown, ChevronUp, Download, FileSpreadsheet, Info, Users as UsersIcon, BarChart3 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { MonthStepper, monthKeyFromNow } from '@/components/reports/MonthStepper'
import { OverviewRowCard } from '@/components/reports/OverviewRowCard'
import { BarChart } from '@/components/reports/BarChart'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canGenerateReports } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useOrgRules } from '@/hooks/useOrgRules'
import {
  DRIVER_ROLES,
  fetchMonthOverview,
  fetchMonthlyReports,
  fetchMultiMonthReport,
  fileSlug,
} from '@/lib/reports/fetch'
import { monthsBetween, type MonthOverview, type MultiMonthReport, type OverviewRow } from '@/lib/reports/overview-report'
import { exportMonatsnachweisPdf, exportMonthOverviewPdf, exportMultiMonthPdf } from '@/lib/pdf/monatsnachweis'
import { exportMonatsnachweisXlsx, exportMonthOverviewXlsx, exportMultiMonthXlsx } from '@/lib/excel/monatsnachweis'
import { monthLabel, monthShort } from '@/lib/time/format'
import { captureError } from '@/lib/monitoring'

type Tab = 'month' | 'multi'
const MAX_MONTHS = 24

export default function ReportsOverviewScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ tab?: string }>()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile } = useUser()
  const isManagerial = canGenerateReports(role)
  const orgId = profile?.organization_id ?? null
  const { profiles } = useProfiles(false)
  const { surchargeRules, spesenRates } = useOrgRules()

  const [tab, setTab] = useState<Tab>(params.tab === 'multi' ? 'multi' : 'month')
  const [month, setMonth] = useState(() => monthKeyFromNow(-1))
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01`)
  const [to, setTo] = useState(() => monthKeyFromNow(0))
  const [employeeId, setEmployeeId] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [includeAll, setIncludeAll] = useState(false)
  const [overview, setOverview] = useState<MonthOverview | null>(null)
  const [multi, setMulti] = useState<MultiMonthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const requestId = useRef(0)

  // Same param can arrive after mount when the screen is re-used.
  useEffect(() => {
    if (params.tab === 'multi' || params.tab === 'month') setTab(params.tab)
  }, [params.tab])

  const rangeFrom = from <= to ? from : to
  const rangeTo = from <= to ? to : from
  const monthCount = monthsBetween(rangeFrom, rangeTo).length
  const tooManyMonths = monthCount > MAX_MONTHS

  // Employee select for the multi-month tab — every active profile, like
  // the webapp; defaults to the first Lokführer.
  const allEmployees = useMemo(
    () =>
      profiles
        .filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          name: p.full_name || p.email || '—',
          role: String(p.role ?? 'employee').toLowerCase(),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [profiles],
  )

  useEffect(() => {
    if (employeeId || allEmployees.length === 0) return
    const first = allEmployees.find((e) => DRIVER_ROLES.includes(e.role)) ?? allEmployees[0]
    if (first) setEmployeeId(first.id)
  }, [allEmployees, employeeId])

  const selectedEmployeeName = allEmployees.find((e) => e.id === employeeId)?.name ?? L('Mitarbeiter', 'Employee')

  const load = useCallback(async () => {
    if (!orgId || !isManagerial) return
    if (tab === 'multi' && (!employeeId || tooManyMonths)) return
    const id = ++requestId.current
    setLoading(true)
    setFailed(null)
    const rules = { surchargeRules, spesenRates, locale }
    try {
      if (tab === 'month') {
        const o = await fetchMonthOverview(orgId, month, rules, includeAll)
        if (id === requestId.current) setOverview(o)
      } else {
        const r = await fetchMultiMonthReport(orgId, employeeId, rangeFrom, rangeTo, rules)
        if (id === requestId.current) {
          setMulti(r)
          if (!r) setFailed(L('Mitarbeiter nicht gefunden.', 'Employee not found.'))
        }
      }
    } catch (err) {
      captureError(err, {
        tags: { area: `reports.overview.${tab}` },
        extra: { month, from: rangeFrom, to: rangeTo, includeAll },
        message: 'Overview report failed to load',
      })
      if (id === requestId.current) {
        const msg = L('Auswertung konnte nicht geladen werden', 'Could not load report')
        setFailed(msg)
        toast.error(msg)
      }
    } finally {
      if (id === requestId.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, isManagerial, tab, month, rangeFrom, rangeTo, employeeId, includeAll, tooManyMonths, surchargeRules, spesenRates, locale])

  useEffect(() => {
    load()
  }, [load])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  // Only show data that belongs to the current selection.
  const monthData = tab === 'month' && overview && overview.month === month ? overview : null
  const multiData =
    tab === 'multi' && multi && multi.employee.id === employeeId && multi.from === rangeFrom && multi.to === rangeTo
      ? multi
      : null
  const rows: OverviewRow[] = tab === 'month' ? monthData?.rows ?? [] : multiData?.rows ?? []
  const totals = tab === 'month' ? monthData?.totals : multiData?.totals
  const gastfahrtCountsAsWork =
    (tab === 'month' ? monthData?.gastfahrtCountsAsWork : multiData?.gastfahrtCountsAsWork) ?? true
  const exportDisabled = loading || rows.length === 0 || busy !== null

  const exportPdf = async () => {
    setBusy('pdf')
    try {
      if (tab === 'month' && monthData) await exportMonthOverviewPdf(monthData)
      if (tab === 'multi' && multiData) await exportMultiMonthPdf(multiData)
    } catch (err: any) {
      captureError(err, { tags: { area: `reports.overview.${tab}.pdf` }, message: 'Overview PDF export failed' })
      toast.error(err?.message ?? L('PDF-Export fehlgeschlagen', 'PDF export failed'))
    } finally {
      setBusy(null)
    }
  }

  const exportXlsx = async () => {
    setBusy('xlsx')
    try {
      if (tab === 'month' && monthData) {
        await exportMonthOverviewXlsx(monthData, `Gesamtauswertung_${monthData.month}.xlsx`)
      }
      if (tab === 'multi' && multiData) {
        await exportMultiMonthXlsx(
          multiData,
          `Mehrmonatsreport_${fileSlug(multiData.employee.name)}_${multiData.from}_${multiData.to}.xlsx`,
        )
      }
    } catch (err: any) {
      captureError(err, { tags: { area: `reports.overview.${tab}.xlsx` }, message: 'Overview Excel export failed' })
      toast.error(L('Excel-Export fehlgeschlagen', 'Excel export failed'))
    } finally {
      setBusy(null)
    }
  }

  /** Web: row click opens the Monatsnachweis — here we export it. */
  const exportRowStatement = async (r: OverviewRow, fmt: 'pdf' | 'xlsx') => {
    if (!orgId) return
    const name = tab === 'multi' ? multiData?.employee.name ?? r.label : r.label
    setRowBusy(r.key)
    try {
      const reports = await fetchMonthlyReports(
        orgId,
        [{ employeeId: r.employeeId, month: r.month, name }],
        { surchargeRules, spesenRates, locale },
      )
      const base = `Monatsnachweis_${fileSlug(reports[0]?.employee.name ?? name)}_${r.month}`
      if (fmt === 'pdf') await exportMonatsnachweisPdf(reports, base)
      else await exportMonatsnachweisXlsx(reports, `${base}.xlsx`)
    } catch (err: any) {
      captureError(err, { tags: { area: 'reports.overview.row' }, extra: { month: r.month }, message: 'Row statement export failed' })
      toast.error(err?.message ?? L('Export fehlgeschlagen', 'Export failed'))
    } finally {
      setRowBusy(null)
    }
  }

  const onRowPress = (r: OverviewRow) => {
    const name = tab === 'multi' ? multiData?.employee.name ?? '' : r.label
    Alert.alert(
      L('Monatsnachweis', 'Monthly statement'),
      `${name} · ${monthLabel(r.month, locale)}`,
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        { text: 'Excel', onPress: () => exportRowStatement(r, 'xlsx') },
        { text: 'PDF', onPress: () => exportRowStatement(r, 'pdf') },
      ],
    )
  }

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/reports')
  }

  if (!isManagerial) {
    return (
      <Screen background="#F8FAFC" className="bg-slate-50 px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Auswertungen ansehen.',
            'Only admins or dispatchers can view evaluations.',
          )}
        </Text>
      </Screen>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'month', label: L('Alle Lokführer (Monat)', 'All drivers (month)') },
    { key: 'multi', label: L('Mehrmonatsreport', 'Multi-month') },
  ]

  const contextLine =
    tab === 'month'
      ? `${monthLabel(month, locale)} · ${rows.length} ${L('Mitarbeiter', rows.length === 1 ? 'employee' : 'employees')}`
      : `${selectedEmployeeName} · ${monthLabel(rangeFrom, locale)} – ${monthLabel(rangeTo, locale)}`

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <PageHeader
          title={L('Auswertungen', 'Evaluations')}
          subtitle={L(
            'Arbeitsumfang, Gastfahrten und Abwesenheiten – Werte wie im Monatsnachweis',
            'Workload, Gastfahrt and absences – same values as the monthly statements',
          )}
          showBack
          onBack={goBack}
        />

        {/* Tabs — web: inline-flex rounded-xl bg-slate-100 p-1 */}
        <View style={{ flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: '#F1F5F9', marginBottom: 12 }}>
          {tabs.map((tb) => {
            const active = tab === tb.key
            return (
              <Pressable
                key={tb.key}
                onPress={() => setTab(tb.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  height: 36,
                  borderRadius: 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 6,
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                  shadowColor: '#0F172A',
                  shadowOpacity: active ? 0.06 : 0,
                  shadowRadius: 3,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: active ? 1 : 0,
                }}
              >
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ fontSize: 13, fontWeight: '700', color: active ? '#0064E0' : '#64748B' }}
                >
                  {tb.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* Selection */}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 16,
            padding: 16,
            marginBottom: 12,
          }}
        >
          {tab === 'month' ? (
            <>
              <MonthStepper label={L('Monat', 'Month')} value={month} onChange={setMonth} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#475569' }}>
                  {L('auch Admin/Disposition', 'include admin/dispatch')}
                </Text>
                <Switch
                  value={includeAll}
                  onValueChange={setIncludeAll}
                  trackColor={{ false: '#D1D5DB', true: '#0064E0' }}
                  thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                />
              </View>
            </>
          ) : (
            <>
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                {L('Mitarbeiter', 'Employee')}
              </Text>
              <Pressable onPress={() => setPickerOpen((v) => !v)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 44,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <UsersIcon size={15} color="#64748B" />
                  <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                    {employeeId ? selectedEmployeeName : L('Mitarbeiter', 'Employee')}
                  </Text>
                  {pickerOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                </View>
              </Pressable>
              {pickerOpen ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
                  {allEmployees.map((e) => {
                    const active = e.id === employeeId
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => {
                          setEmployeeId(e.id)
                          setPickerOpen(false)
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? '#0064E0' : '#E2E8F0',
                          backgroundColor: active ? '#0064E0' : '#FFFFFF',
                          marginRight: 6,
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : '#475569' }}>{e.name}</Text>
                      </Pressable>
                    )
                  })}
                  {allEmployees.length === 0 ? (
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>{L('Keine Mitarbeiter gefunden.', 'No employees found.')}</Text>
                  ) : null}
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', marginTop: 14 }}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <MonthStepper label={L('von', 'from')} value={from} onChange={setFrom} />
                </View>
                <View style={{ flex: 1, marginLeft: 6 }}>
                  <MonthStepper label={L('bis', 'to')} value={to} onChange={setTo} />
                </View>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: tooManyMonths ? '#DC2626' : '#64748B', marginTop: 8, marginLeft: 4 }}>
                {tooManyMonths
                  ? L(`Maximal ${MAX_MONTHS} Monate pro Report.`, `At most ${MAX_MONTHS} months per report.`)
                  : `${monthCount} ${L(monthCount === 1 ? 'Monat' : 'Monate', monthCount === 1 ? 'month' : 'months')}`}
              </Text>
            </>
          )}

          {/* PDF / Excel — web: outline buttons, disabled while loading or empty */}
          <View style={{ flexDirection: 'row', marginTop: 16 }}>
            <View style={{ flex: 1, marginRight: 6 }}>
              <Button
                label="PDF"
                variant="secondary"
                size="md"
                onPress={exportPdf}
                loading={busy === 'pdf'}
                disabled={exportDisabled}
                leftIcon={<Download size={16} color="#0064E0" />}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Button
                label="Excel"
                variant="secondary"
                size="md"
                onPress={exportXlsx}
                loading={busy === 'xlsx'}
                disabled={exportDisabled}
                leftIcon={<FileSpreadsheet size={16} color="#0064E0" />}
              />
            </View>
          </View>
        </View>

        {loading || !totals ? (
          <View style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <ActivityIndicator size="large" color="#0064E0" />
            ) : tooManyMonths ? null : failed ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center', marginBottom: 12 }}>
                  {failed}
                </Text>
                <Button label={L('Erneut versuchen', 'Try again')} variant="secondary" size="sm" onPress={load} />
              </View>
            ) : tab === 'multi' && !employeeId ? (
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B', textAlign: 'center' }}>
                {L('Bitte einen Mitarbeiter wählen.', 'Pick an employee.')}
              </Text>
            ) : (
              <ActivityIndicator size="large" color="#0064E0" />
            )}
          </View>
        ) : (
          <>
            {/* Section label — web table head: "Mitarbeiter" / "Monat" */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10, paddingHorizontal: 4 }}>
              <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {tab === 'month' ? L('Mitarbeiter', 'Employee') : L('Monat', 'Month')}
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#E2E8F0', marginHorizontal: 10 }} />
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: '#64748B', maxWidth: '60%' }}>
                {contextLine}
              </Text>
            </View>

            {rows.length === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: 32,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 16,
                }}
              >
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 32,
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#E2E8F0',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChart3 size={26} color="#CBD5E1" />
                </View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4 text-center">
                  {L('Keine Daten für den Zeitraum.', 'No data for this period.')}
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {rows.map((r) => (
                  <OverviewRowCard
                    key={r.key}
                    label={r.label}
                    values={r}
                    onPress={() => onRowPress(r)}
                    busy={rowBusy === r.key}
                  />
                ))}
                <OverviewRowCard
                  label={tab === 'month' ? L('Summe', 'Total') : L('Summe Zeitraum', 'Period total')}
                  values={totals}
                  variant="total"
                />
              </View>
            )}

            {tab === 'multi' && multiData && rows.length > 0 ? (
              <View style={{ gap: 12, marginTop: 16 }}>
                <BarChart
                  title={L('Arbeitszeit und Gastfahrt je Monat (Std.)', 'Working time and Gastfahrt per month (h)')}
                  categories={multiData.rows.map((r) => monthShort(r.month))}
                  series={[
                    { label: L('Arbeitszeit', 'Working time'), color: '#0064E0', values: multiData.rows.map((r) => r.workHours) },
                    { label: 'Gastfahrt', color: '#7C3AED', values: multiData.rows.map((r) => r.gastfahrtHours) },
                  ]}
                />
                <BarChart
                  title={L('Urlaubs- und Krankheitstage je Monat (Tage)', 'Vacation and sick days per month (days)')}
                  categories={multiData.rows.map((r) => monthShort(r.month))}
                  series={[
                    { label: L('Urlaub', 'Vacation'), color: '#0D9488', values: multiData.rows.map((r) => r.vacationDays) },
                    { label: L('Krank', 'Sick'), color: '#E11D48', values: multiData.rows.map((r) => r.sickDays) },
                  ]}
                  integer
                />
              </View>
            ) : null}

            {/* So wird gerechnet */}
            <View
              style={{
                marginTop: 16,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 16,
                padding: 16,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Info size={16} color="#334155" />
                <Text style={{ marginLeft: 8, fontSize: 12, fontWeight: '700', color: '#334155' }}>
                  {L('So wird gerechnet', 'How values are calculated')}
                </Text>
              </View>
              <Text style={legendText}>
                {gastfahrtCountsAsWork
                  ? L(
                      'Alle Werte stammen aus den Monatsnachweisen. Gastfahrt wird separat ausgewiesen; Ist = Arbeitszeit + Gastfahrt (keine Doppelzählung).',
                      'All values come from the monthly statements. Gastfahrt is shown separately; actual = working time + Gastfahrt (never counted twice).',
                    )
                  : L(
                      'Alle Werte stammen aus den Monatsnachweisen. Gastfahrt wird separat ausgewiesen und zählt nicht zu den Iststunden; Ist = Arbeitszeit.',
                      'All values come from the monthly statements. Gastfahrt is shown separately and not counted as actual hours; actual = working time.',
                    )}
              </Text>
              <Text style={legendText}>
                {L(
                  '„Fehler“ zählt Einträge, die geprüft werden müssen (z. B. 0 Stunden oder fehlendes Ende).',
                  '“Issues” counts entries that need checking (e.g. 0 hours or a missing end).',
                )}
              </Text>
              <Text style={legendText}>
                {L(
                  'Abwesenheitstage zählen als Arbeitstage (Mo–Fr ohne Feiertag) mit genehmigtem Urlaub bzw. Krankmeldung. Ganze Tage – Teiltage werden nicht anteilig gezählt.',
                  'Absence days count weekdays (Mon–Fri, no holiday) with approved vacation/sick leave. Whole days only.',
                )}
              </Text>
              <Text style={legendText}>
                {L(
                  'Offene Einträge sind noch nicht freigegeben und können sich ändern. Die Übersicht ist alphabetisch sortiert und keine Leistungsbewertung.',
                  'Open entries are not approved yet and may change. Sorted alphabetically; this is not a performance ranking.',
                )}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

const legendText = { fontSize: 12, lineHeight: 17, color: '#64748B' } as const
