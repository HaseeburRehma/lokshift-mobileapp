/**
 * Reports — Stundenzettel PDF export.
 *
 * Employee view: month picker + "Eigenen Stundenzettel exportieren".
 * Admin / Dispatcher view: same, plus a multi-employee selector that
 * outputs one combined PDF (matches the webapp's "Arbeitszeitbericht
 * für die Disposition" flow).
 *
 * Output is generated on-device via expo-print and handed to the
 * native share sheet via expo-sharing.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import {
  ChevronLeft,
  FileText,
  ChevronRight,
  Download,
  Users as UsersIcon,
  FileSpreadsheet,
  BarChart3,
  Wallet,
  Gift,
} from 'lucide-react-native'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
} from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canGenerateReports } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import { useProfiles } from '@/hooks/useProfiles'
import { useOrganizationTimeAccounts } from '@/hooks/useOrgTimeAccounts'
import { usePerDiem } from '@/hooks/usePerDiem'
import { useHolidayBonus } from '@/hooks/useHolidayBonus'
import {
  exportStundenzettelPdf,
  exportMultiEmployeeReportPdf,
  type StundenzettelEntry,
  type StundenzettelOptions,
} from '@/lib/pdf/stundenzettel'
import {
  exportSingleStundenzettelXlsx,
  exportMultiStundenzettelXlsx,
} from '@/lib/excel/exportTimeEntries'
import {
  exportTimeAccountsPdf,
  exportPerDiemPdf,
  exportHolidayBonusPdf,
  slugify as slugifyName,
} from '@/lib/pdf/reports'
import {
  exportTimeAccountsXlsx,
  exportPerDiemXlsx,
  exportHolidayBonusXlsx,
} from '@/lib/excel/reports'
import type { TimeEntry, PerDiem, HolidayBonus } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'

function monthBounds(monthKey: string): { start: string; end: string } | null {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return null
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

async function fetchEntriesForMonth(
  employeeIds: string[],
  monthKey: string,
): Promise<Record<string, TimeEntry[]>> {
  const bounds = monthBounds(monthKey)
  if (!bounds || employeeIds.length === 0) return {}
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .select(
      'id, employee_id, date, start_time, end_time, break_minutes, net_hours, overnight_stay, meal_allowance, is_gastfahrt, notes',
    )
    .in('employee_id', employeeIds)
    .gte('date', bounds.start)
    .lte('date', bounds.end)
    .order('date', { ascending: true })
  if (error) throw error
  const grouped: Record<string, TimeEntry[]> = {}
  for (const row of (data ?? []) as TimeEntry[]) {
    if (!grouped[row.employee_id]) grouped[row.employee_id] = []
    grouped[row.employee_id].push(row)
  }
  return grouped
}

function entryToStundenzettelRow(e: TimeEntry): StundenzettelEntry {
  return {
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time,
    break_minutes: e.break_minutes,
    net_hours: e.net_hours,
    overnight_stay: e.overnight_stay,
    meal_allowance: e.meal_allowance,
    is_gastfahrt: e.is_gastfahrt,
    notes: e.notes,
  }
}

export default function ReportsScreen() {
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile } = useUser()
  const { profiles } = useProfiles(false)
  const isManagerial = canGenerateReports(role)

  const currentMonth = format(new Date(), 'yyyy-MM')
  const [monthKey, setMonthKey] = useState(currentMonth)
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  // Date range + global employee filter — applied to the 3 management
  // reports (Time Accounts uses YTD by nature; Per Diem and Bonus scope
  // by this window). Defaults to current month so the screen reads the
  // same on first paint as the previous monthly-only flow.
  const today = new Date()
  const [dateRange, setDateRange] = useState(() => ({
    start: format(startOfMonth(today), 'yyyy-MM-dd'),
    end: format(endOfMonth(today), 'yyyy-MM-dd'),
  }))
  const [globalEmployeeId, setGlobalEmployeeId] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [busySingle, setBusySingle] = useState(false)
  const [busyMulti, setBusyMulti] = useState(false)
  const [busyXlsxSingle, setBusyXlsxSingle] = useState(false)
  const [busyXlsxMulti, setBusyXlsxMulti] = useState(false)
  const [busyAccounts, setBusyAccounts] = useState<'pdf' | 'xlsx' | null>(null)
  const [busyPerDiem, setBusyPerDiem] = useState<'pdf' | 'xlsx' | null>(null)
  const [busyBonus, setBusyBonus] = useState<'pdf' | 'xlsx' | null>(null)

  // Hook-backed previews give us live counts while the user picks a month.
  // Note: these hooks cap at 200 rows; the actual export refetches directly
  // from Supabase with no limit to avoid clipping payroll data on large orgs.
  const { accounts: orgAccounts, loading: loadingAccounts } = useOrganizationTimeAccounts()
  const { items: perDiems, loading: loadingPerDiems } = usePerDiem()
  const { items: bonuses, loading: loadingBonuses } = useHolidayBonus()

  const monthValid = useMemo(() => monthBounds(monthKey) !== null, [monthKey])

  const dateLocale = locale === 'de' ? deLocale : enUS

  const monthSubtitle = useMemo(() => {
    const bounds = monthBounds(monthKey)
    if (!bounds) return monthKey
    const start = new Date(`${bounds.start}T00:00:00`)
    return format(start, 'MMMM yyyy', { locale: dateLocale })
  }, [monthKey, dateLocale])

  // Preset detection — selectedPreset is null when the range is custom.
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

  // Build employee picker options from the available profiles list.
  const employeeOptions = useMemo(
    () =>
      profiles
        .filter((p) => p.full_name)
        .map((p) => ({ id: p.id, name: p.full_name ?? p.email ?? '—' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  )
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
      const stamp = b.created_at?.slice(0, 10) ?? ''
      if (stamp < dateRange.start || stamp > dateRange.end) return false
      if (globalEmployeeId !== 'all' && b.employee_id !== globalEmployeeId) return false
      return true
    })
  }, [bonuses, dateRange.start, dateRange.end, rangeValid, globalEmployeeId])

  // Time-accounts respect the employee filter (they're already YTD).
  const filteredOrgAccounts = useMemo(
    () =>
      globalEmployeeId === 'all'
        ? orgAccounts
        : orgAccounts.filter((a) => a.employee_id === globalEmployeeId),
    [orgAccounts, globalEmployeeId],
  )

  const warnEmpty = (count: number): boolean => {
    if (count === 0) {
      toast.error(L('Keine Daten für den Zeitraum.', 'No data for this period.'))
      return true
    }
    return false
  }

  const bonusTypeLabel = (key: string): string => {
    const map: Record<string, { de: string; en: string }> = {
      holiday_pay: { de: 'Urlaubsgeld', en: 'Holiday Pay' },
      christmas: { de: 'Weihnachtsgeld', en: 'Christmas Bonus' },
      vacation: { de: 'Urlaubsbonus', en: 'Vacation Bonus' },
      performance: { de: 'Leistungsbonus', en: 'Performance' },
      other: { de: 'Sonstiges', en: 'Other' },
    }
    return map[key]?.[locale] ?? key
  }

  // Fetch full per-diem rows scoped to the selected date range AND
  // optional employee filter, bypassing the 200-row hook cap so payroll
  // reports never silently drop rows on large orgs.
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
    let q = getSupabase()
      .from('holiday_bonuses')
      .select('*, employee:profiles!employee_id(id, full_name)')
      .eq('organization_id', profile.organization_id)
      .gte('created_at', `${dateRange.start}T00:00:00`)
      .lte('created_at', `${dateRange.end}T23:59:59`)
      .order('created_at', { ascending: true })
    if (globalEmployeeId !== 'all') q = q.eq('employee_id', globalEmployeeId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as HolidayBonus[]
  }

  const exportAccountsReport = async (fmt: 'pdf' | 'xlsx') => {
    if (loadingAccounts) {
      toast.error(L('Daten werden geladen…', 'Loading data…'))
      return
    }
    if (warnEmpty(filteredOrgAccounts.length)) return
    setBusyAccounts(fmt)
    try {
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
      } else {
        await exportTimeAccountsXlsx(filteredOrgAccounts, {
          sheetName: title,
          filename,
          locale,
        })
      }
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'reports.time-accounts' },
        extra: { rowCount: filteredOrgAccounts.length, employeeFilter: globalEmployeeId },
        message: 'Time-accounts report failed',
      })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyAccounts(null)
    }
  }

  const rangeFilenameStamp = `${dateRange.start}_${dateRange.end}`

  const exportPerDiemReport = async (fmt: 'pdf' | 'xlsx') => {
    if (!rangeValid) {
      toast.error(L('Ungültiger Datumsbereich.', 'Invalid date range.'))
      return
    }
    setBusyPerDiem(fmt)
    try {
      const rows = await fetchPerDiemsForReport()
      if (warnEmpty(rows.length)) return
      const title = L('Spesenbericht', 'Per Diem Report')
      const scopeParts = [rangeSubtitle]
      if (globalEmployeeId !== 'all') scopeParts.push(selectedEmployeeName)
      const subtitle = `${title} · ${scopeParts.join(' · ')}`
      const filename =
        globalEmployeeId !== 'all'
          ? `spesenbericht_${slugifyName(selectedEmployeeName)}_${rangeFilenameStamp}`
          : `spesenbericht_${rangeFilenameStamp}`
      if (fmt === 'pdf') {
        await exportPerDiemPdf(rows, { title, subtitle, filename, locale })
      } else {
        await exportPerDiemXlsx(rows, {
          sheetName: title,
          filename,
          locale,
        })
      }
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'reports.per-diem' },
        extra: { dateRange, employeeFilter: globalEmployeeId },
        message: 'Per-diem report failed',
      })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyPerDiem(null)
    }
  }

  const exportBonusReport = async (fmt: 'pdf' | 'xlsx') => {
    if (!rangeValid) {
      toast.error(L('Ungültiger Datumsbereich.', 'Invalid date range.'))
      return
    }
    setBusyBonus(fmt)
    try {
      const rows = await fetchBonusesForReport()
      if (warnEmpty(rows.length)) return
      const title = L('Urlaubsgeld-Bericht', 'Holiday Bonus Report')
      const scopeParts = [rangeSubtitle]
      if (globalEmployeeId !== 'all') scopeParts.push(selectedEmployeeName)
      const subtitle = `${title} · ${scopeParts.join(' · ')}`
      const filename =
        globalEmployeeId !== 'all'
          ? `urlaubsgeld-bericht_${slugifyName(selectedEmployeeName)}_${rangeFilenameStamp}`
          : `urlaubsgeld-bericht_${rangeFilenameStamp}`
      if (fmt === 'pdf') {
        await exportHolidayBonusPdf(rows, {
          title,
          subtitle,
          filename,
          locale,
          bonusTypeLabel,
        })
      } else {
        await exportHolidayBonusXlsx(rows, {
          sheetName: title,
          filename,
          locale,
          bonusTypeLabel,
        })
      }
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'reports.holiday-bonus' },
        extra: { dateRange, employeeFilter: globalEmployeeId },
        message: 'Holiday-bonus report failed',
      })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyBonus(null)
    }
  }

  const generateOwn = async () => {
    if (!profile) return
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusySingle(true)
    try {
      const grouped = await fetchEntriesForMonth([profile.id], monthKey)
      const entries = (grouped[profile.id] ?? []).map(entryToStundenzettelRow)
      await exportStundenzettelPdf({
        employeeName: profile.full_name ?? profile.email ?? '—',
        monthKey,
        entries,
        targetHours: profile.target_hours ?? undefined,
      })
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusySingle(false)
    }
  }

  const generateOwnXlsx = async () => {
    if (!profile) return
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyXlsxSingle(true)
    try {
      const grouped = await fetchEntriesForMonth([profile.id], monthKey)
      const entries = (grouped[profile.id] ?? []).map(entryToStundenzettelRow)
      await exportSingleStundenzettelXlsx({
        employeeName: profile.full_name ?? profile.email ?? '—',
        monthKey,
        entries,
        targetHours: profile.target_hours ?? undefined,
      })
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyXlsxSingle(false)
    }
  }

  const generateForOneEmployee = async () => {
    if (employeeIds.length === 0) {
      toast.error(L('Bitte einen Mitarbeiter wählen.', 'Pick an employee.'))
      return
    }
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusySingle(true)
    try {
      const target = profiles.find((p) => p.id === employeeIds[0])
      if (!target) throw new Error('Employee not found')
      const grouped = await fetchEntriesForMonth([target.id], monthKey)
      const entries = (grouped[target.id] ?? []).map(entryToStundenzettelRow)
      await exportStundenzettelPdf({
        employeeName: target.full_name ?? target.email ?? '—',
        monthKey,
        entries,
        targetHours: target.target_hours ?? undefined,
      })
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusySingle(false)
    }
  }

  const generateForOneEmployeeXlsx = async () => {
    if (employeeIds.length !== 1) {
      toast.error(L('Bitte genau einen Mitarbeiter wählen.', 'Pick exactly one employee.'))
      return
    }
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyXlsxSingle(true)
    try {
      const target = profiles.find((p) => p.id === employeeIds[0])
      if (!target) throw new Error('Employee not found')
      const grouped = await fetchEntriesForMonth([target.id], monthKey)
      const entries = (grouped[target.id] ?? []).map(entryToStundenzettelRow)
      await exportSingleStundenzettelXlsx({
        employeeName: target.full_name ?? target.email ?? '—',
        monthKey,
        entries,
        targetHours: target.target_hours ?? undefined,
      })
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyXlsxSingle(false)
    }
  }

  const generateMulti = async () => {
    if (employeeIds.length === 0) {
      toast.error(
        L('Bitte mindestens einen Mitarbeiter wählen.', 'Pick at least one employee.'),
      )
      return
    }
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyMulti(true)
    try {
      const grouped = await fetchEntriesForMonth(employeeIds, monthKey)
      const sections: StundenzettelOptions[] = []
      for (const id of employeeIds) {
        const p = profiles.find((x) => x.id === id)
        if (!p) continue
        const entries = (grouped[id] ?? []).map(entryToStundenzettelRow)
        sections.push({
          employeeName: p.full_name ?? p.email ?? '—',
          monthKey,
          entries,
          targetHours: p.target_hours ?? undefined,
        })
      }
      if (sections.length === 0) {
        toast.error(L('Keine gültigen Mitarbeiter ausgewählt.', 'No valid employees.'))
        return
      }
      await exportMultiEmployeeReportPdf(sections, `Arbeitszeitbericht_${monthKey}`)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyMulti(false)
    }
  }

  const generateMultiXlsx = async () => {
    if (employeeIds.length === 0) {
      toast.error(L('Bitte mindestens einen Mitarbeiter wählen.', 'Pick at least one employee.'))
      return
    }
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyXlsxMulti(true)
    try {
      const grouped = await fetchEntriesForMonth(employeeIds, monthKey)
      const sections = []
      for (const id of employeeIds) {
        const p = profiles.find((x) => x.id === id)
        if (!p) continue
        const entries = (grouped[id] ?? []).map(entryToStundenzettelRow)
        sections.push({
          employeeName: p.full_name ?? p.email ?? '—',
          monthKey,
          entries,
          targetHours: p.target_hours ?? undefined,
        })
      }
      if (sections.length === 0) {
        toast.error(L('Keine gültigen Mitarbeiter ausgewählt.', 'No valid employees.'))
        return
      }
      await exportMultiStundenzettelXlsx(sections, `Arbeitszeitbericht_${monthKey}`)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyXlsxMulti(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Berichte', 'Reports')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <FileText size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Stundenzettel als PDF', 'Timesheet as PDF')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Wird auf dem Gerät erstellt und über das System-Teilen-Menü weitergegeben.',
                'Generated on device and shared via the system share sheet.',
              )}
            </Text>
          </View>
        </View>

        {/* Month picker (free-form text, like the date inputs elsewhere) */}
        <Card className="mb-4">
          <FormField
            label={L('Monat (YYYY-MM)', 'Month (YYYY-MM)')}
            value={monthKey}
            onChangeText={setMonthKey}
            placeholder="2026-05"
            autoCapitalize="none"
          />
          <View className="flex-row gap-2 mt-3">
            {monthQuickPicks().map((q) => (
              <Pressable
                key={q.key}
                onPress={() => setMonthKey(q.key)}
                className={`flex-1 py-2 rounded-full border-2 ${
                  monthKey === q.key ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold text-center ${
                    monthKey === q.key ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {q.label[locale]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Own export (always shown) */}
        <Card className="mb-4">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white mb-1">
            {L('Eigener Stundenzettel', 'My timesheet')}
          </Text>
          <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-4">
            {L(
              'Erstellt einen Stundenzettel für deine eigenen Einträge.',
              'Creates a timesheet for your own time entries.',
            )}
          </Text>
          <Button
            label={
              busySingle && !isManagerial
                ? t('common.loading')
                : L('PDF erstellen & teilen', 'Generate & share PDF')
            }
            onPress={generateOwn}
            loading={busySingle && !isManagerial}
            leftIcon={<Download size={18} color="#fff" />}
            size="lg"
          />
          <View style={{ marginTop: 8 }}>
            <Button
              label={
                busyXlsxSingle && !isManagerial
                  ? t('common.loading')
                  : L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')
              }
              onPress={generateOwnXlsx}
              loading={busyXlsxSingle && !isManagerial}
              variant="secondary"
              leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
            />
          </View>
        </Card>

        {/* Admin / dispatcher tools */}
        {isManagerial && (
          <>
            <Card className="mb-4">
              <View className="flex-row items-center mb-3">
                <UsersIcon size={18} color="#0064E0" />
                <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
                  {L('Stundenzettel für Mitarbeiter', 'Timesheet for member')}
                </Text>
              </View>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  'Wählen Sie genau einen Mitarbeiter aus.',
                  'Select exactly one employee.',
                )}
              </Text>
              <EmployeePicker
                mode="multi"
                value={employeeIds}
                onChange={setEmployeeIds}
                includeSelf
              />
              <View className="mt-4" style={{ gap: 8 }}>
                <Button
                  label={
                    busySingle
                      ? t('common.loading')
                      : L('PDF erstellen', 'Generate PDF')
                  }
                  onPress={generateForOneEmployee}
                  loading={busySingle}
                  leftIcon={<Download size={18} color="#fff" />}
                  disabled={employeeIds.length !== 1}
                />
                <Button
                  label={
                    busyXlsxSingle
                      ? t('common.loading')
                      : L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')
                  }
                  onPress={generateForOneEmployeeXlsx}
                  loading={busyXlsxSingle}
                  variant="secondary"
                  leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
                  disabled={employeeIds.length !== 1}
                />
              </View>
            </Card>

            <Card className="mb-4">
              <View className="flex-row items-center mb-2">
                <UsersIcon size={18} color="#0064E0" />
                <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
                  {L('Arbeitszeitbericht (mehrere)', 'Multi-employee report')}
                </Text>
              </View>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  'Ein PDF mit einem Blatt pro ausgewähltem Mitarbeiter. Erste Seite zu Beginn, dann Seitenumbruch je Mitarbeiter.',
                  'One PDF with one sheet per selected employee, page-break between each.',
                )}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  `Aktuell ausgewählt: ${employeeIds.length}`,
                  `Currently selected: ${employeeIds.length}`,
                )}
              </Text>
              <View style={{ gap: 8 }}>
                <Button
                  label={
                    busyMulti
                      ? t('common.loading')
                      : L(
                          `Sammelbericht als PDF (${employeeIds.length})`,
                          `Combined PDF (${employeeIds.length})`,
                        )
                  }
                  onPress={generateMulti}
                  loading={busyMulti}
                  leftIcon={<Download size={18} color="#fff" />}
                  disabled={employeeIds.length === 0}
                />
                <Button
                  label={
                    busyXlsxMulti
                      ? t('common.loading')
                      : L(
                          `Sammelbericht als Excel (${employeeIds.length})`,
                          `Combined Excel (${employeeIds.length})`,
                        )
                  }
                  onPress={generateMultiXlsx}
                  loading={busyXlsxMulti}
                  variant="secondary"
                  leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
                  disabled={employeeIds.length === 0}
                />
              </View>
            </Card>

            {/* ── Verwaltungsberichte / Management reports ─────────────── */}
            <View className="flex-row items-center mt-2 mb-3 px-1">
              <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                {L('Verwaltungsberichte', 'Management reports')}
              </Text>
              <View className="flex-1 h-px bg-gray-200 dark:bg-slate-700 ml-3" />
            </View>

            {/* Date range + employee filter — applied to all 3 reports below */}
            <Card className="mb-4">
              <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-3">
                {L('Zeitraum & Mitarbeiter-Filter', 'Date range & employee filter')}
              </Text>

              {/* Preset row */}
              <View className="flex-row flex-wrap gap-2 mb-3">
                {([
                  ['current', L('Aktueller Monat', 'Current Month')],
                  ['previous', L('Vormonat', 'Previous Month')],
                  ['ytd', L('Jahr', 'Year-to-date')],
                ] as ['current' | 'previous' | 'ytd', string][]).map(([id, label]) => {
                  const active = selectedPreset === id
                  return (
                    <Pressable
                      key={id}
                      onPress={() => applyPreset(id)}
                    >
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: active ? '#0F172A' : '#E5E7EB',
                          backgroundColor: active ? '#0F172A' : '#FFFFFF',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: active ? '#FFFFFF' : '#475569',
                          }}
                        >
                          {label}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>

              {/* Custom range row */}
              <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
                {L('Benutzerdefinierter Zeitraum', 'Custom range')}
              </Text>
              <View className="flex-row gap-2 mb-3">
                <View style={{ flex: 1 }}>
                  <FormField
                    label={L('Von', 'From')}
                    value={dateRange.start}
                    onChangeText={(v) => setDateRange((r) => ({ ...r, start: v }))}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label={L('Bis', 'To')}
                    value={dateRange.end}
                    onChangeText={(v) => setDateRange((r) => ({ ...r, end: v }))}
                    placeholder="YYYY-MM-DD"
                    autoCapitalize="none"
                  />
                </View>
              </View>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3">
                {rangeValid
                  ? rangeSubtitle
                  : L('Ungültiger Zeitraum.', 'Invalid range.')}
              </Text>

              {/* Employee filter */}
              <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
                {L('Mitarbeiter', 'Employee')}
              </Text>
              <Pressable onPress={() => setEmployeePickerOpen((v) => !v)}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: globalEmployeeId === 'all' ? '#E5E7EB' : '#0064E0',
                    backgroundColor: globalEmployeeId === 'all' ? '#FFFFFF' : '#EFF6FF',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <UsersIcon size={14} color={globalEmployeeId === 'all' ? '#475569' : '#0064E0'} />
                    <Text
                      style={{
                        marginLeft: 8,
                        fontSize: 13,
                        fontWeight: '700',
                        color: globalEmployeeId === 'all' ? '#475569' : '#0064E0',
                      }}
                    >
                      {selectedEmployeeName}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#9CA3AF' }}>
                    {employeePickerOpen ? '▲' : '▼'}
                  </Text>
                </View>
              </Pressable>

              {employeePickerOpen && (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  <Pressable
                    onPress={() => {
                      setGlobalEmployeeId('all')
                      setEmployeePickerOpen(false)
                    }}
                  >
                    <View
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: globalEmployeeId === 'all' ? '#0064E0' : '#E5E7EB',
                        backgroundColor: globalEmployeeId === 'all' ? '#0064E0' : '#FFFFFF',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: globalEmployeeId === 'all' ? '#FFFFFF' : '#475569',
                        }}
                      >
                        {L('Alle Mitarbeiter', 'All employees')}
                      </Text>
                    </View>
                  </Pressable>
                  {employeeOptions.map((e) => {
                    const active = globalEmployeeId === e.id
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => {
                          setGlobalEmployeeId(e.id)
                          setEmployeePickerOpen(false)
                        }}
                      >
                        <View
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? '#0064E0' : '#E5E7EB',
                            backgroundColor: active ? '#0064E0' : '#FFFFFF',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: active ? '#FFFFFF' : '#475569',
                            }}
                          >
                            {e.name}
                          </Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              )}
            </Card>

            <Card className="mb-4">
              <View className="flex-row items-center mb-3">
                <BarChart3 size={18} color="#0064E0" />
                <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
                  {L('Zeitkonto-Salden', 'Time Account Balances')}
                </Text>
              </View>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  'Übersicht aller Mitarbeiter mit Soll-/Ist-Stunden & Saldo (laufendes Jahr).',
                  'All employees with target/actual hours & balance (year-to-date).',
                )}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3">
                {loadingAccounts
                  ? L('Daten werden geladen…', 'Loading data…')
                  : L(
                      `${filteredOrgAccounts.length} Mitarbeiter im Bericht`,
                      `${filteredOrgAccounts.length} employees in report`,
                    )}
              </Text>
              <View style={{ gap: 8 }}>
                <Button
                  label={
                    busyAccounts === 'pdf'
                      ? t('common.loading')
                      : L('PDF erstellen & teilen', 'Generate & share PDF')
                  }
                  onPress={() => exportAccountsReport('pdf')}
                  loading={busyAccounts === 'pdf'}
                  disabled={loadingAccounts || busyAccounts !== null}
                  leftIcon={<Download size={18} color="#fff" />}
                />
                <Button
                  label={
                    busyAccounts === 'xlsx'
                      ? t('common.loading')
                      : L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')
                  }
                  onPress={() => exportAccountsReport('xlsx')}
                  loading={busyAccounts === 'xlsx'}
                  disabled={loadingAccounts || busyAccounts !== null}
                  variant="secondary"
                  leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
                />
              </View>
            </Card>

            <Card className="mb-4">
              <View className="flex-row items-center mb-3">
                <Wallet size={18} color="#0064E0" />
                <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
                  {L('Spesenbericht', 'Per Diem Report')}
                </Text>
              </View>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  `Verpflegungspauschalen für ${monthSubtitle}.`,
                  `Per-diem allowances for ${monthSubtitle}.`,
                )}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3">
                {loadingPerDiems
                  ? L('Daten werden geladen…', 'Loading data…')
                  : L(
                      `Vorschau: ${perDiemsInRange.length} Einträge im Zeitraum (Export liest vollständig)`,
                      `Preview: ${perDiemsInRange.length} entries in period (export reloads full data)`,
                    )}
              </Text>
              <View style={{ gap: 8 }}>
                <Button
                  label={
                    busyPerDiem === 'pdf'
                      ? t('common.loading')
                      : L('PDF erstellen & teilen', 'Generate & share PDF')
                  }
                  onPress={() => exportPerDiemReport('pdf')}
                  loading={busyPerDiem === 'pdf'}
                  disabled={busyPerDiem !== null || !rangeValid}
                  leftIcon={<Download size={18} color="#fff" />}
                />
                <Button
                  label={
                    busyPerDiem === 'xlsx'
                      ? t('common.loading')
                      : L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')
                  }
                  onPress={() => exportPerDiemReport('xlsx')}
                  loading={busyPerDiem === 'xlsx'}
                  disabled={busyPerDiem !== null || !rangeValid}
                  variant="secondary"
                  leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
                />
              </View>
            </Card>

            <Card className="mb-4">
              <View className="flex-row items-center mb-3">
                <Gift size={18} color="#0064E0" />
                <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
                  {L('Urlaubsgeld-Bericht', 'Holiday Bonus Report')}
                </Text>
              </View>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
                {L(
                  `Bonuszahlungen für ${monthSubtitle}.`,
                  `Bonus payments for ${monthSubtitle}.`,
                )}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3">
                {loadingBonuses
                  ? L('Daten werden geladen…', 'Loading data…')
                  : L(
                      `Vorschau: ${bonusesInRange.length} Einträge im Zeitraum (Export liest vollständig)`,
                      `Preview: ${bonusesInRange.length} entries in period (export reloads full data)`,
                    )}
              </Text>
              <View style={{ gap: 8 }}>
                <Button
                  label={
                    busyBonus === 'pdf'
                      ? t('common.loading')
                      : L('PDF erstellen & teilen', 'Generate & share PDF')
                  }
                  onPress={() => exportBonusReport('pdf')}
                  loading={busyBonus === 'pdf'}
                  disabled={busyBonus !== null || !rangeValid}
                  leftIcon={<Download size={18} color="#fff" />}
                />
                <Button
                  label={
                    busyBonus === 'xlsx'
                      ? t('common.loading')
                      : L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')
                  }
                  onPress={() => exportBonusReport('xlsx')}
                  loading={busyBonus === 'xlsx'}
                  disabled={busyBonus !== null || !rangeValid}
                  variant="secondary"
                  leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
                />
              </View>
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function monthQuickPicks(): Array<{
  key: string
  label: { de: string; en: string }
}> {
  const now = new Date()
  const this_ = format(now, 'yyyy-MM')
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevKey = format(prev, 'yyyy-MM')
  const prevPrev = new Date(now.getFullYear(), now.getMonth() - 2, 1)
  const prevPrevKey = format(prevPrev, 'yyyy-MM')
  return [
    { key: this_, label: { de: 'Aktuell', en: 'Current' } },
    { key: prevKey, label: { de: 'Vormonat', en: 'Last month' } },
    { key: prevPrevKey, label: { de: '−2 Monate', en: '−2 months' } },
  ]
}
