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
import { format } from 'date-fns'
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
} from '@/lib/pdf/reports'
import {
  exportTimeAccountsXlsx,
  exportPerDiemXlsx,
  exportHolidayBonusXlsx,
} from '@/lib/excel/reports'
import type { TimeEntry, PerDiem, HolidayBonus } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

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

  const perDiemsInRange = useMemo(() => {
    const bounds = monthBounds(monthKey)
    if (!bounds) return [] as typeof perDiems
    return perDiems.filter((pd) => pd.date >= bounds.start && pd.date <= bounds.end)
  }, [perDiems, monthKey])

  const bonusesInRange = useMemo(() => {
    const bounds = monthBounds(monthKey)
    if (!bounds) return [] as typeof bonuses
    return bonuses.filter((b) => {
      const stamp = b.created_at?.slice(0, 10) ?? ''
      return stamp >= bounds.start && stamp <= bounds.end
    })
  }, [bonuses, monthKey])

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

  // Fetch full per-diem rows scoped to the selected month, bypassing the
  // 200-row hook cap. Joined with employee so the PDF/Excel can show names.
  const fetchPerDiemsForReport = async (): Promise<PerDiem[]> => {
    const bounds = monthBounds(monthKey)
    if (!bounds || !profile?.organization_id) return []
    const { data, error } = await getSupabase()
      .from('per_diems')
      .select('*, employee:profiles!employee_id(id, full_name, avatar_url)')
      .eq('organization_id', profile.organization_id)
      .gte('date', bounds.start)
      .lte('date', bounds.end)
      .order('date', { ascending: true })
    if (error) throw error
    return (data ?? []) as PerDiem[]
  }

  const fetchBonusesForReport = async (): Promise<HolidayBonus[]> => {
    const bounds = monthBounds(monthKey)
    if (!bounds || !profile?.organization_id) return []
    const { data, error } = await getSupabase()
      .from('holiday_bonuses')
      .select('*, employee:profiles!employee_id(id, full_name)')
      .eq('organization_id', profile.organization_id)
      .gte('created_at', `${bounds.start}T00:00:00`)
      .lte('created_at', `${bounds.end}T23:59:59`)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as HolidayBonus[]
  }

  const exportAccountsReport = async (fmt: 'pdf' | 'xlsx') => {
    if (loadingAccounts) {
      toast.error(L('Daten werden geladen…', 'Loading data…'))
      return
    }
    if (warnEmpty(orgAccounts.length)) return
    setBusyAccounts(fmt)
    try {
      const year = format(new Date(), 'yyyy')
      const title = L('Zeitkonto-Salden', 'Time Account Balances')
      const subtitle = `${title} · ${L(`Jahr bis dato (${year})`, `Year to date (${year})`)}`
      const filename = `zeitkonto-salden_${year}`
      if (fmt === 'pdf') {
        await exportTimeAccountsPdf(orgAccounts, { title, subtitle, filename, locale })
      } else {
        await exportTimeAccountsXlsx(orgAccounts, {
          sheetName: title,
          filename,
          locale,
        })
      }
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyAccounts(null)
    }
  }

  const exportPerDiemReport = async (fmt: 'pdf' | 'xlsx') => {
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyPerDiem(fmt)
    try {
      const rows = await fetchPerDiemsForReport()
      if (warnEmpty(rows.length)) return
      const title = L('Spesenbericht', 'Per Diem Report')
      const subtitle = `${title} · ${monthSubtitle}`
      const filename = `spesenbericht_${monthKey}`
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
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyPerDiem(null)
    }
  }

  const exportBonusReport = async (fmt: 'pdf' | 'xlsx') => {
    if (!monthValid) {
      toast.error(L('Ungültiger Monat (YYYY-MM).', 'Invalid month (YYYY-MM).'))
      return
    }
    setBusyBonus(fmt)
    try {
      const rows = await fetchBonusesForReport()
      if (warnEmpty(rows.length)) return
      const title = L('Urlaubsgeld-Bericht', 'Holiday Bonus Report')
      const subtitle = `${title} · ${monthSubtitle}`
      const filename = `urlaubsgeld-bericht_${monthKey}`
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
                      `${orgAccounts.length} Mitarbeiter im Bericht`,
                      `${orgAccounts.length} employees in report`,
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
                  disabled={busyPerDiem !== null}
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
                  disabled={busyPerDiem !== null}
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
                  disabled={busyBonus !== null}
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
                  disabled={busyBonus !== null}
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
