/**
 * Reports — phone replica of the webapp's app/dashboard/reports/page.tsx.
 *
 * Admin / dispatch (same order as the webapp):
 *   1. Auswertungen cards — Monatsnachweis, Gesamtauswertung,
 *      Mehrmonatsreport (Kundenfeedback Punkte 5 + 18)
 *   2. Zeitraum presets + Mitarbeiter filter + benutzerdefinierter Zeitraum
 *   3. "Berichtstyp auswählen" — Arbeitszeitbericht, Zeitkonto-Salden,
 *      Spesenbericht, Sonderzahlungen; each exports CSV / Excel / PDF
 *   4. "Letzte Berichte" (this session)
 *
 * Employees: "Persönliche Berichte" (own working time, year to date) plus
 * their own Monatsnachweis.
 *
 * Files are generated on-device (expo-print / SheetJS / CSV) and handed to
 * the native share sheet via expo-sharing. Exports refetch the full data
 * set from Supabase so payroll reports are never clipped by hook limits.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import {
  FileText,
  Download,
  Users as UsersIcon,
  BarChart3,
  ChevronRight,
  ChevronDown,
  Calendar,
  Trash2,
} from 'lucide-react-native'
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { MonatsnachweisPanel } from '@/components/reports/MonatsnachweisPanel'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canGenerateReports } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import { useProfiles } from '@/hooks/useProfiles'
import { useOrganizationTimeAccounts } from '@/hooks/useOrgTimeAccounts'
import { usePerDiem } from '@/hooks/usePerDiem'
import { useHolidayBonus } from '@/hooks/useHolidayBonus'
import { paymentPeriodLabel, specialPaymentTypeLabel } from '@/lib/special-payments'
import {
  exportTimeAccountsPdf,
  exportPerDiemPdf,
  exportHolidayBonusPdf,
  exportWorkingTimePdf,
  slugify as slugifyName,
} from '@/lib/pdf/reports'
import { exportTimeAccountsXlsx, exportPerDiemXlsx, exportHolidayBonusXlsx } from '@/lib/excel/reports'
import { exportCsv } from '@/lib/csv/exportCsv'
import { TIME_ENTRY_SELECT } from '@/lib/times/entry-status'
import { formatTimeOfDay } from '@/lib/time/format'
import type { PerDiem, HolidayBonus, TimeEntry } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'

/** Does a special payment fall into [start, end] (YYYY-MM-DD)? */
function paymentInRange(b: HolidayBonus, start: string, end: string): boolean {
  if ((b.distribution ?? 'once') === 'once') {
    const m = (b.billing_month ?? b.created_at ?? '').slice(0, 10)
    return !!m && m.slice(0, 7) >= start.slice(0, 7) && m.slice(0, 7) <= end.slice(0, 7)
  }
  if (!b.period_start || !b.period_end) return false
  return b.period_start <= end && b.period_end >= start
}

type ReportTypeId = 'working-time' | 'time-accounts' | 'per-diem' | 'holiday-bonus'
type ExportFmt = 'csv' | 'xlsx' | 'pdf'

interface RecentReport {
  id: string
  title: string
  generatedAt: string
  scope: string
  format: ExportFmt
}

const C = {
  gray900: '#111827',
  gray700: '#374151',
  gray600: '#4B5563',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  gray50: '#F9FAFB',
  brand: '#0064E0',
}

export default function ReportsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile } = useUser()
  const { profiles } = useProfiles(false)
  const isManagerial = canGenerateReports(role)

  // Date range + employee filter — applied to every report type. Defaults
  // to the current month like the webapp.
  const today = new Date()
  const [dateRange, setDateRange] = useState(() => ({
    start: format(startOfMonth(today), 'yyyy-MM-dd'),
    end: format(endOfMonth(today), 'yyyy-MM-dd'),
  }))
  const [globalEmployeeId, setGlobalEmployeeId] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [activeReport, setActiveReport] = useState<ReportTypeId | null>(null)
  const [busyExport, setBusyExport] = useState<`${ReportTypeId}-${ExportFmt}` | null>(null)
  const [busySelf, setBusySelf] = useState(false)
  const [recentReports, setRecentReports] = useState<RecentReport[]>([])

  // Hook-backed previews give live counts while the user picks a range.
  // These hooks cap at 200 rows; the export refetches without the cap.
  const { accounts: orgAccounts, loading: loadingAccounts } = useOrganizationTimeAccounts()
  const { items: perDiems, loading: loadingPerDiems } = usePerDiem()
  const { items: bonuses, loading: loadingBonuses } = useHolidayBonus()

  const dateLocale = locale === 'de' ? deLocale : enUS

  // Preset detection — null when the range is custom.
  const selectedPreset: 'current' | 'previous' | 'ytd' | null = useMemo(() => {
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    const curStart = fmt(startOfMonth(today))
    const curEnd = fmt(endOfMonth(today))
    if (dateRange.start === curStart && dateRange.end === curEnd) return 'current'
    const prevStart = fmt(startOfMonth(subMonths(today, 1)))
    const prevEnd = fmt(endOfMonth(subMonths(today, 1)))
    if (dateRange.start === prevStart && dateRange.end === prevEnd) return 'previous'
    const ytdStart = fmt(startOfYear(today))
    if (dateRange.start === ytdStart && dateRange.end === curEnd) return 'ytd'
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.start, dateRange.end])

  const applyPreset = (preset: 'current' | 'previous' | 'ytd') => {
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
    if (preset === 'current') {
      setDateRange({ start: fmt(startOfMonth(today)), end: fmt(endOfMonth(today)) })
    } else if (preset === 'previous') {
      const prev = subMonths(today, 1)
      setDateRange({ start: fmt(startOfMonth(prev)), end: fmt(endOfMonth(prev)) })
    } else {
      setDateRange({ start: fmt(startOfYear(today)), end: fmt(endOfMonth(today)) })
    }
  }

  const rangeValid =
    /^\d{4}-\d{2}-\d{2}$/.test(dateRange.start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateRange.end) &&
    dateRange.start <= dateRange.end

  const rangeSubtitle = useMemo(() => {
    if (!rangeValid) return `${dateRange.start} – ${dateRange.end}`
    try {
      const startD = new Date(`${dateRange.start}T00:00:00`)
      const endD = new Date(`${dateRange.end}T00:00:00`)
      return `${format(startD, 'dd. MMM', { locale: dateLocale })} – ${format(endD, 'dd. MMM yyyy', { locale: dateLocale })}`
    } catch {
      return `${dateRange.start} – ${dateRange.end}`
    }
  }, [dateRange.start, dateRange.end, rangeValid, dateLocale])

  const employeeOptions = useMemo(
    () =>
      profiles
        .filter((p) => p.full_name)
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? '—' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  )
  const employeeNameById = useMemo(() => {
    const m = new Map<string, string>()
    employeeOptions.forEach((e) => m.set(e.id, e.name))
    return m
  }, [employeeOptions])
  const selectedEmployeeName =
    globalEmployeeId === 'all'
      ? L('Alle Mitarbeiter', 'All employees')
      : (employeeOptions.find((e) => e.id === globalEmployeeId)?.name ?? '—')

  const perDiemsInRange = useMemo(() => {
    if (!rangeValid) return [] as typeof perDiems
    return perDiems.filter((pd) => {
      if (pd.date < dateRange.start || pd.date > dateRange.end) return false
      if (globalEmployeeId !== 'all' && pd.employee_id !== globalEmployeeId) return false
      return true
    })
  }, [perDiems, dateRange.start, dateRange.end, rangeValid, globalEmployeeId])

  const bonusesInRange = useMemo(() => {
    if (!rangeValid) return [] as typeof bonuses
    return bonuses.filter((b) => {
      if (!paymentInRange(b, dateRange.start, dateRange.end)) return false
      if (globalEmployeeId !== 'all' && b.employee_id !== globalEmployeeId) return false
      return true
    })
  }, [bonuses, dateRange.start, dateRange.end, rangeValid, globalEmployeeId])

  // Time-accounts respect the employee filter (they're already YTD).
  const filteredOrgAccounts = useMemo(
    () => (globalEmployeeId === 'all' ? orgAccounts : orgAccounts.filter((a) => a.employee_id === globalEmployeeId)),
    [orgAccounts, globalEmployeeId],
  )

  const warnEmpty = (count: number): boolean => {
    if (count === 0) {
      toast.error(
        L('Keine Daten für den ausgewählten Zeitraum gefunden.', 'No data found for the selected period.'),
      )
      return true
    }
    return false
  }

  const bonusTypeLabel = (key: string): string => specialPaymentTypeLabel(key, locale)
  const rangeFilenameStamp = `${dateRange.start}_${dateRange.end}`
  const scopedFilename = (base: string) =>
    globalEmployeeId !== 'all'
      ? `${base}_${slugifyName(selectedEmployeeName)}_${rangeFilenameStamp}`
      : `${base}_${rangeFilenameStamp}`
  const scopedSubtitle = (title: string) => {
    const parts = [rangeSubtitle]
    if (globalEmployeeId !== 'all') parts.push(selectedEmployeeName)
    return `${title} · ${parts.join(' · ')}`
  }

  // ─── Full-data fetches (no hook cap) ───────────────────────
  const fetchTimeEntriesForReport = async (): Promise<TimeEntry[]> => {
    if (!rangeValid || !profile?.organization_id) return []
    let q = getSupabase()
      .from('time_entries')
      .select(TIME_ENTRY_SELECT)
      .eq('organization_id', profile.organization_id)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(5000)
    if (globalEmployeeId !== 'all') q = q.eq('employee_id', globalEmployeeId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as TimeEntry[]
  }

  const fetchPerDiemsForReport = async (): Promise<PerDiem[]> => {
    if (!rangeValid || !profile?.organization_id) return []
    let q = getSupabase()
      .from('per_diems')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url)')
      .eq('organization_id', profile.organization_id)
      .gte('date', dateRange.start)
      .lte('date', dateRange.end)
      .order('date', { ascending: true })
    if (globalEmployeeId !== 'all') q = q.eq('employee_id', globalEmployeeId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as PerDiem[]
  }

  const fetchBonusesForReport = async (): Promise<HolidayBonus[]> => {
    if (!rangeValid || !profile?.organization_id) return []
    // Billing month / period decides the reporting period (not created_at),
    // so the report matches the Monatsnachweis.
    let q = getSupabase()
      .from('holiday_bonuses')
      .select('*, employee:profiles!employee_id(id, full_name)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: true })
      .limit(5000)
    if (globalEmployeeId !== 'all') q = q.eq('employee_id', globalEmployeeId)
    const { data, error } = await q
    if (error) throw error
    return ((data ?? []) as HolidayBonus[]).filter((b) => paymentInRange(b, dateRange.start, dateRange.end))
  }

  // ─── Exporters — return false when there was nothing to export ──
  const exportWorkingTime = async (fmt: ExportFmt): Promise<boolean> => {
    const rows = await fetchTimeEntriesForReport()
    if (warnEmpty(rows.length)) return false
    const title = L('Arbeitszeitbericht', 'Working Time Report')
    const filename = scopedFilename('arbeitszeitbericht')
    if (fmt === 'pdf') {
      await exportWorkingTimePdf(rows, {
        title,
        subtitle: scopedSubtitle(title),
        filename,
        showEmployee: globalEmployeeId === 'all',
        locale,
      })
    } else {
      await exportCsv({
        headers: ['date', 'employee', 'start', 'end', 'net_hours', 'verified', 'notes'],
        rows: rows.map((e) => [
          e.date,
          e.employee?.full_name ?? '',
          formatTimeOfDay(e.start_time),
          formatTimeOfDay(e.end_time),
          e.net_hours ?? 0,
          e.is_verified ? 'Yes' : 'No',
          e.notes ?? '',
        ]),
        filename,
        dialogTitle: title,
      })
    }
    return true
  }

  const exportAccounts = async (fmt: ExportFmt): Promise<boolean> => {
    if (warnEmpty(filteredOrgAccounts.length)) return false
    const year = format(new Date(), 'yyyy')
    const title = L('Zeitkonto-Salden', 'Time Account Balances')
    const scopeLabel =
      globalEmployeeId !== 'all' ? selectedEmployeeName : L(`Jahr bis dato (${year})`, `Year to date (${year})`)
    const subtitle = `${title} · ${scopeLabel}`
    const filename =
      globalEmployeeId !== 'all'
        ? `zeitkonto-salden_${slugifyName(selectedEmployeeName)}_${year}`
        : `zeitkonto-salden_${year}`
    if (fmt === 'pdf') {
      await exportTimeAccountsPdf(filteredOrgAccounts, { title, subtitle, filename, locale })
    } else if (fmt === 'xlsx') {
      await exportTimeAccountsXlsx(filteredOrgAccounts, { sheetName: title, filename, locale })
    } else {
      await exportCsv({
        headers: ['employee', 'target_hours', 'actual_hours', 'balance', 'status'],
        rows: filteredOrgAccounts.map((a) => [
          a.full_name,
          a.target_hours,
          Number(a.actual_hours.toFixed(2)),
          Number(a.balance.toFixed(2)),
          a.balance >= 0 ? 'Positive' : 'Deficit',
        ]),
        filename,
        dialogTitle: title,
      })
    }
    return true
  }

  const exportPerDiems = async (fmt: ExportFmt): Promise<boolean> => {
    const rows = await fetchPerDiemsForReport()
    if (warnEmpty(rows.length)) return false
    const title = L('Spesenbericht', 'Per Diem Report')
    const filename = scopedFilename('spesenbericht')
    if (fmt === 'pdf') {
      await exportPerDiemPdf(rows, { title, subtitle: scopedSubtitle(title), filename, locale })
    } else if (fmt === 'xlsx') {
      await exportPerDiemXlsx(rows, { sheetName: title, filename, locale })
    } else {
      await exportCsv({
        headers: ['date', 'employee', 'country', 'days', 'rate', 'amount', 'status'],
        rows: rows.map((pd) => [
          pd.date,
          pd.employee?.full_name ?? employeeNameById.get(pd.employee_id) ?? pd.employee_id,
          pd.country,
          pd.num_days,
          pd.rate,
          pd.amount,
          pd.status,
        ]),
        filename,
        dialogTitle: title,
      })
    }
    return true
  }

  const exportBonuses = async (fmt: ExportFmt): Promise<boolean> => {
    const rows = await fetchBonusesForReport()
    if (warnEmpty(rows.length)) return false
    const title = L('Sonderzahlungen', 'Special payments')
    const filename = scopedFilename('sonderzahlungen')
    if (fmt === 'pdf') {
      await exportHolidayBonusPdf(rows, { title, subtitle: scopedSubtitle(title), filename, locale, bonusTypeLabel })
    } else if (fmt === 'xlsx') {
      await exportHolidayBonusXlsx(rows, { sheetName: title, filename, locale, bonusTypeLabel })
    } else {
      await exportCsv({
        headers: ['employee', 'title', 'type', 'billing', 'amount', 'notes'],
        rows: rows.map((b) => [
          b.employee?.full_name ?? employeeNameById.get(b.employee_id) ?? b.employee_id,
          b.title || specialPaymentTypeLabel(b.bonus_type, locale),
          specialPaymentTypeLabel(b.bonus_type, locale),
          paymentPeriodLabel(b, locale),
          b.amount,
          b.notes ?? '',
        ]),
        filename,
        dialogTitle: title,
      })
    }
    return true
  }

  const reportTypes: {
    id: ReportTypeId
    title: string
    subtitle: string
    preview: string | null
    formats: ExportFmt[]
    run: (fmt: ExportFmt) => Promise<boolean>
  }[] = [
    {
      id: 'working-time',
      title: L('Arbeitszeitbericht', 'Working Time Report'),
      subtitle: L('Stunden pro Mitarbeiter & Zeitraum', 'Hours per employee & period'),
      preview: null,
      // No working-time Excel builder in lib/excel yet — CSV opens in Excel.
      formats: ['csv', 'pdf'],
      run: exportWorkingTime,
    },
    {
      id: 'time-accounts',
      title: L('Zeitkonto-Salden', 'Time Account Balances'),
      subtitle: L('Überstunden & Kontostatus', 'Overtime & account status'),
      preview: loadingAccounts
        ? L('Daten werden geladen…', 'Loading data…')
        : L(
            `${filteredOrgAccounts.length} Mitarbeiter im Bericht (laufendes Jahr)`,
            `${filteredOrgAccounts.length} employees in report (year to date)`,
          ),
      formats: ['csv', 'xlsx', 'pdf'],
      run: exportAccounts,
    },
    {
      id: 'per-diem',
      title: L('Spesenbericht', 'Per Diem Report'),
      subtitle: L('Reisekostenpauschalen nach Zeitraum', 'Travel allowances by period'),
      preview: loadingPerDiems
        ? L('Daten werden geladen…', 'Loading data…')
        : L(
            `Vorschau: ${perDiemsInRange.length} Einträge im Zeitraum (Export liest vollständig)`,
            `Preview: ${perDiemsInRange.length} entries in period (export reloads full data)`,
          ),
      formats: ['csv', 'xlsx', 'pdf'],
      run: exportPerDiems,
    },
    {
      id: 'holiday-bonus',
      title: L('Sonderzahlungen', 'Special payments'),
      subtitle: L('Alle Sonderzahlungen im Zeitraum', 'All special payments in the period'),
      preview: loadingBonuses
        ? L('Daten werden geladen…', 'Loading data…')
        : L(
            `Vorschau: ${bonusesInRange.length} Einträge im Zeitraum (Export liest vollständig)`,
            `Preview: ${bonusesInRange.length} entries in period (export reloads full data)`,
          ),
      formats: ['csv', 'xlsx', 'pdf'],
      run: exportBonuses,
    },
  ]

  const trackReport = (title: string, fmt: ExportFmt) => {
    const scope = globalEmployeeId !== 'all' ? selectedEmployeeName : L('Alle Mitarbeiter', 'All Employees')
    setRecentReports((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: `${title} - ${rangeSubtitle}`,
          generatedAt: new Date().toISOString(),
          scope,
          format: fmt,
        },
        ...prev,
      ].slice(0, 10),
    )
  }

  const runExport = async (id: ReportTypeId, fmt: ExportFmt) => {
    if (busyExport) return
    const def = reportTypes.find((r) => r.id === id)
    if (!def) return
    if (id === 'time-accounts' && loadingAccounts) {
      toast.error(L('Daten werden geladen…', 'Loading data…'))
      return
    }
    if (id !== 'time-accounts' && !rangeValid) {
      toast.error(L('Ungültiger Datumsbereich.', 'Invalid date range.'))
      return
    }
    setActiveReport(null)
    setBusyExport(`${id}-${fmt}`)
    try {
      const ok = await def.run(fmt)
      if (ok) {
        trackReport(def.title, fmt)
        toast.success(L('Bericht wurde erstellt.', 'Report generated.'))
      }
    } catch (err: any) {
      captureError(err, {
        tags: { area: `reports.${id}` },
        extra: { dateRange, employeeFilter: globalEmployeeId, fmt },
        message: `${id} report failed`,
      })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyExport(null)
    }
  }

  // ─── Employee: own working time, year to date ──────────────
  const exportSelfPdf = async () => {
    if (!profile?.organization_id || busySelf) return
    setBusySelf(true)
    try {
      const yearStart = startOfYear(new Date())
      const { data, error } = await getSupabase()
        .from('time_entries')
        .select(TIME_ENTRY_SELECT)
        .eq('organization_id', profile.organization_id)
        .eq('employee_id', profile.id)
        .gte('date', format(yearStart, 'yyyy-MM-dd'))
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(5000)
      if (error) throw error
      const mine = (data ?? []) as TimeEntry[]
      if (warnEmpty(mine.length)) return
      const fullName = profile.full_name || L('Mitarbeiter', 'Employee')
      await exportWorkingTimePdf(mine, {
        title: L('Meine Zeiterfassung', 'My Time Tracking'),
        subtitle: `${fullName} · ${format(yearStart, 'yyyy')} YTD`,
        filename: `meine-zeiterfassung_${slugifyName(fullName)}_${format(new Date(), 'yyyy')}`,
        showEmployee: false,
        locale,
      })
      toast.success(L('PDF erstellt.', 'PDF generated.'))
    } catch (err: any) {
      captureError(err, { tags: { area: 'reports.self-working-time' }, message: 'Own working-time PDF failed' })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusySelf(false)
    }
  }

  const sectionTitle = (text: string) => (
    <Text
      style={{
        fontSize: 13,
        fontWeight: '600',
        color: C.gray500,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
      }}
    >
      {text}
    </Text>
  )

  // ─── Employee view ─────────────────────────────────────────
  if (!isManagerial) {
    return (
      <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}>
          <PageHeader title={L('Berichte', 'Reports')} showBack onBack={goBack} />

          <View
            style={{
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: C.gray200,
              borderRadius: 16,
              paddingVertical: 28,
              paddingHorizontal: 20,
              marginBottom: 28,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: C.gray50,
                borderWidth: 1,
                borderColor: C.gray100,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BarChart3 size={32} color={C.gray300} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '600', color: C.gray900, marginTop: 18 }}>
              {L('Persönliche Berichte', 'Personal Reports')}
            </Text>
            <Text style={{ fontSize: 14, color: C.gray500, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              {L(
                'Sie können Ihre persönliche Zeiterfassung als PDF herunterladen (eigene Daten, laufendes Jahr).',
                'Download your personal time-tracking summary as a PDF (your own data, year-to-date).',
              )}
            </Text>
            <Pressable
              onPress={exportSelfPdf}
              disabled={busySelf}
              style={({ pressed }) => ({
                marginTop: 20,
                height: 44,
                paddingHorizontal: 24,
                borderRadius: 12,
                backgroundColor: C.gray900,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busySelf ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              {busySelf ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Download size={16} color="#FFFFFF" />
              )}
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '500', color: '#FFFFFF' }}>
                {L('Mein PDF herunterladen', 'Download My PDF')}
              </Text>
            </Pressable>
          </View>

          {sectionTitle(L('Monatsnachweis', 'Monthly statement'))}
          <MonatsnachweisPanel />
        </ScrollView>
      </Screen>
    )
  }

  // ─── Admin / Dispatcher view ───────────────────────────────
  const evaluationCards: { key: string; title: string; text: string; onPress: () => void }[] = [
    {
      key: 'monthly',
      title: L('Monatsnachweis', 'Monthly statement'),
      text: L(
        'Ein Mitarbeiter, ein Monat – alle Tage, Zuschläge, Spesen, Sonderzahlungen',
        'One employee, one month – all days, premiums, per diem, payments',
      ),
      onPress: () => router.push('/reports/monthly'),
    },
    {
      key: 'overview',
      title: L('Gesamtauswertung', 'All drivers'),
      text: L('Alle Lokführer eines Monats mit Gesamtsummen', 'All drivers for one month with totals'),
      onPress: () => router.push({ pathname: '/reports/overview', params: { tab: 'month' } }),
    },
    {
      key: 'multi',
      title: L('Mehrmonatsreport', 'Multi-month report'),
      text: L('Ein Mitarbeiter über mehrere Monate mit Diagrammen', 'One employee over several months with charts'),
      onPress: () => router.push({ pathname: '/reports/overview', params: { tab: 'multi' } }),
    },
  ]

  const presets: ['current' | 'previous' | 'ytd', string][] = [
    ['current', L('Aktueller Monat', 'Current Month')],
    ['previous', L('Vormonat', 'Previous Month')],
    ['ytd', L('Aktuelles Jahr', 'Year-to-date')],
  ]

  const filterActive = globalEmployeeId !== 'all'

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <PageHeader
          title={L('Berichte', 'Reports')}
          subtitle={L('Berichte erstellen und exportieren', 'Generate and export reports')}
          showBack
          onBack={goBack}
        />

        {/* ── Auswertungen (Kundenfeedback Punkte 5 + 18) ── */}
        <View style={{ gap: 10, marginBottom: 28 }}>
          {evaluationCards.map((c) => (
            <Pressable
              key={c.key}
              onPress={c.onPress}
              style={({ pressed }) => ({
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#DBEAFE',
                backgroundColor: pressed ? '#EFF6FF' : '#F5F9FF',
                padding: 16,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: C.brand }}>{c.title}</Text>
                <ChevronRight size={16} color={C.brand} />
              </View>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4, lineHeight: 17 }}>{c.text}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Date range + employee selector ── */}
        <View style={{ marginBottom: 28 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {presets.map(([id, label]) => {
              const active = selectedPreset === id
              return (
                <Pressable
                  key={id}
                  onPress={() => applyPreset(id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 36,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? C.gray900 : C.gray200,
                    backgroundColor: active ? C.gray900 : '#FFFFFF',
                  }}
                >
                  <Calendar size={14} color={active ? '#FFFFFF' : C.gray600} />
                  <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '500', color: active ? '#FFFFFF' : C.gray600 }}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Employee filter (change-request #6) */}
          {employeeOptions.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Pressable onPress={() => setEmployeePickerOpen((v) => !v)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    height: 40,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: filterActive ? '#93C5FD' : C.gray200,
                    backgroundColor: filterActive ? '#EFF6FF' : '#FFFFFF',
                  }}
                >
                  <UsersIcon size={16} color={filterActive ? '#1D4ED8' : C.gray400} />
                  <Text
                    numberOfLines={1}
                    style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '500', color: filterActive ? '#1D4ED8' : C.gray600 }}
                  >
                    {selectedEmployeeName}
                  </Text>
                  <ChevronDown size={16} color={C.gray400} />
                </View>
              </Pressable>
              {employeePickerOpen ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: C.gray200,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  {[{ id: 'all', name: L('Alle Mitarbeiter', 'All Employees') }, ...employeeOptions].map((e) => {
                    const active = globalEmployeeId === e.id
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => {
                          setGlobalEmployeeId(e.id)
                          setEmployeePickerOpen(false)
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? C.brand : C.gray200,
                          backgroundColor: active ? C.brand : '#FFFFFF',
                          marginRight: 6,
                          marginBottom: 6,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : C.gray600 }}>{e.name}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Custom date range */}
          <Text
            style={{
              marginTop: 16,
              marginBottom: 8,
              fontSize: 11,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              color: C.gray400,
            }}
          >
            {L('Benutzerdefinierter Zeitraum', 'Custom range')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <DateInput value={dateRange.start} onChange={(v) => setDateRange((r) => ({ ...r, start: v }))} />
            <Text style={{ marginHorizontal: 8, fontSize: 12, color: C.gray400 }}>→</Text>
            <DateInput value={dateRange.end} onChange={(v) => setDateRange((r) => ({ ...r, end: v }))} />
          </View>
          <Text style={{ marginTop: 6, fontSize: 11, color: rangeValid ? C.gray500 : '#DC2626' }}>
            {rangeValid ? rangeSubtitle : L('Ungültiger Zeitraum (JJJJ-MM-TT).', 'Invalid range (YYYY-MM-DD).')}
          </Text>
        </View>

        {/* ── Select report type ── */}
        {sectionTitle(L('Berichtstyp auswählen', 'Select Report Type'))}
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: C.gray200,
            borderRadius: 16,
            overflow: 'hidden',
            marginBottom: 28,
          }}
        >
          {reportTypes.map((report, i) => {
            const isActive = activeReport === report.id
            const rowBusy = busyExport?.startsWith(`${report.id}-`) ?? false
            return (
              <View key={report.id} style={i > 0 ? { borderTopWidth: 1, borderTopColor: C.gray100 } : undefined}>
                <Pressable
                  onPress={() => setActiveReport(isActive ? null : report.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    backgroundColor: isActive ? C.gray50 : '#FFFFFF',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: C.gray900 }}>{report.title}</Text>
                    <Text style={{ fontSize: 12, color: C.gray500, marginTop: 2 }}>{report.subtitle}</Text>
                  </View>
                  {rowBusy ? (
                    <ActivityIndicator size="small" color={C.brand} />
                  ) : isActive ? (
                    <ChevronDown size={16} color={C.gray400} />
                  ) : (
                    <ChevronRight size={16} color={C.gray400} />
                  )}
                </Pressable>

                {isActive ? (
                  <View style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: 4, backgroundColor: C.gray50 }}>
                    {report.preview ? (
                      <Text style={{ fontSize: 11, color: C.gray500, marginBottom: 10 }}>{report.preview}</Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: '500', color: C.gray500 }}>
                        {L('Exportieren als:', 'Export as:')}
                      </Text>
                      {report.formats.map((fmt) => (
                        <ExportChip
                          key={fmt}
                          fmt={fmt}
                          disabled={busyExport !== null}
                          onPress={() => runExport(report.id, fmt)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>

        {/* ── Recent reports ── */}
        {sectionTitle(L('Letzte Berichte', 'Recent Reports'))}
        {recentReports.length === 0 ? (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: C.gray200,
              borderRadius: 16,
              padding: 28,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: C.gray50,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileText size={20} color={C.gray300} />
            </View>
            <Text style={{ fontSize: 14, color: C.gray400, textAlign: 'center', marginTop: 12, lineHeight: 20 }}>
              {L(
                'Noch keine Berichte erstellt. Wählen Sie oben einen Berichtstyp aus.',
                'No reports generated yet. Select a report type above to get started.',
              )}
            </Text>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: C.gray200,
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {recentReports.map((report, i) => (
              <View
                key={report.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderTopWidth: i > 0 ? 1 : 0,
                  borderTopColor: C.gray100,
                }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '500', color: C.gray900 }}>
                    {report.title}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: C.gray400, marginTop: 2 }}>
                    {`${L('Erstellt am', 'Generated on')} ${format(new Date(report.generatedAt), 'd. MMM yyyy', { locale: dateLocale })} · ${report.scope}`}
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: C.gray100,
                    backgroundColor: C.gray50,
                    marginRight: 6,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '600', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {report.format === 'xlsx' ? 'xls' : report.format}
                  </Text>
                </View>
                <Pressable
                  hitSlop={8}
                  accessibilityLabel={L('Bericht löschen', 'Delete report')}
                  onPress={() => {
                    setRecentReports((prev) => prev.filter((r) => r.id !== report.id))
                    toast.success(L('Bericht entfernt.', 'Report removed.'))
                  }}
                  style={{ padding: 4 }}
                >
                  <Trash2 size={16} color={C.gray300} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

/** Compact YYYY-MM-DD input — web: `<input type="date">` h-9 rounded-lg. */
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="JJJJ-MM-TT"
      placeholderTextColor={C.gray400}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="numbers-and-punctuation"
      maxLength={10}
      style={{
        flex: 1,
        height: 40,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: C.gray200,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        fontSize: 13,
        fontWeight: '500',
        color: C.gray700,
      }}
    />
  )
}

/** Export button — web: CSV (dark), Excel + PDF (outline). */
function ExportChip({ fmt, onPress, disabled }: { fmt: ExportFmt; onPress: () => void; disabled?: boolean }) {
  const dark = fmt === 'csv'
  const label = fmt === 'csv' ? 'CSV' : fmt === 'xlsx' ? 'Excel' : 'PDF'
  const color = dark ? '#FFFFFF' : C.gray600
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: dark ? C.gray900 : C.gray200,
        backgroundColor: dark ? C.gray900 : '#FFFFFF',
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {fmt === 'pdf' ? <Download size={12} color={color} /> : <FileText size={12} color={color} />}
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '500', color }}>{label}</Text>
    </Pressable>
  )
}
