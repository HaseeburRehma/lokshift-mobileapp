/**
 * Monatsnachweis export (Kundenfeedback Punkt 5) — built from the same
 * shared report model as the webapp, so the PDF/Excel from the app, the
 * webapp and the screens show identical values. Employees export their
 * own statement; admin/dispatch additionally export one or several
 * employees (one PDF page / one Excel sheet per employee).
 *
 * Files are generated on-device (expo-print / SheetJS) and handed to the
 * native share sheet via expo-sharing.
 */

import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { Download, FileSpreadsheet, Users as UsersIcon, FileText } from 'lucide-react-native'

import { Button } from '@/components/Button'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { toast } from '@/components/Toast'
import { MonthStepper, monthKeyFromNow } from '@/components/reports/MonthStepper'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canGenerateReports } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useOrgRules } from '@/hooks/useOrgRules'
import { exportMonatsnachweisPdf } from '@/lib/pdf/monatsnachweis'
import { exportMonatsnachweisXlsx } from '@/lib/excel/monatsnachweis'
import { fetchMonthlyReports, fileSlug } from '@/lib/reports/fetch'
import { monthLabel } from '@/lib/time/format'
import { captureError } from '@/lib/monitoring'

type Job = 'own' | 'selected'
type Fmt = 'pdf' | 'xlsx'

const cardStyle = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E2E8F0',
  borderRadius: 16,
  padding: 16,
} as const

export function MonatsnachweisPanel() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile } = useUser()
  const { profiles } = useProfiles(false)
  const { surchargeRules, spesenRates } = useOrgRules()
  const isManagerial = canGenerateReports(role)

  const [monthKey, setMonthKey] = useState(() => monthKeyFromNow(0))
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [busy, setBusy] = useState<`${Job}-${Fmt}` | null>(null)

  const run = async (job: Job, fmt: Fmt) => {
    const orgId = profile?.organization_id
    if (!profile || !orgId) return
    if (job === 'selected' && employeeIds.length === 0) {
      toast.error(L('Bitte mindestens einen Mitarbeiter wählen.', 'Pick at least one employee.'))
      return
    }
    setBusy(`${job}-${fmt}`)
    try {
      const ids = job === 'own' ? [profile.id] : employeeIds
      const reports = await fetchMonthlyReports(
        orgId,
        ids.map((id) => ({
          employeeId: id,
          month: monthKey,
          name:
            profiles.find((p) => p.id === id)?.full_name ??
            (id === profile.id ? profile.full_name ?? undefined : undefined),
        })),
        { surchargeRules, spesenRates, locale },
      )
      if (reports.length === 0) {
        toast.error(L('Keine Daten für den Zeitraum.', 'No data for this period.'))
        return
      }
      const base =
        reports.length === 1
          ? `Monatsnachweis_${fileSlug(reports[0].employee.name)}_${monthKey}`
          : `Monatsnachweise_${reports.length}-Mitarbeiter_${monthKey}`
      if (fmt === 'pdf') await exportMonatsnachweisPdf(reports, base)
      else await exportMonatsnachweisXlsx(reports, `${base}.xlsx`)
    } catch (err: any) {
      captureError(err, {
        tags: { area: `reports.nachweis.${job}` },
        extra: { monthKey, fmt, count: employeeIds.length },
        message: 'Monatsnachweis export failed',
      })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(null)
    }
  }

  const busyLabel = (job: Job, fmt: Fmt, label: string) => (busy === `${job}-${fmt}` ? t('common.loading') : label)
  const pdfLabel = L('PDF erstellen & teilen', 'Generate & share PDF')
  const xlsxLabel = L('Excel (.xlsx) exportieren', 'Export Excel (.xlsx)')

  return (
    <View style={{ gap: 12 }}>
      <View style={cardStyle}>
        <MonthStepper label={L('Monat', 'Month')} value={monthKey} onChange={setMonthKey} />
        <Text style={{ fontSize: 11, color: '#64748B', marginTop: 8, marginLeft: 4 }}>
          {L(
            `Alle Tage im ${monthLabel(monthKey, locale)} – Werte wie in der Webapp.`,
            `Every day of ${monthLabel(monthKey, locale)} – same values as the webapp.`,
          )}
        </Text>
      </View>

      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <FileText size={18} color="#0064E0" />
          <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '900', color: '#0F172A' }}>
            {L('Mein Monatsnachweis', 'My monthly statement')}
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 14, lineHeight: 17 }}>
          {L(
            'Alle Tage des Monats mit Arbeitszeit, Gastfahrt, Spesen, Zuschlägen, Abwesenheiten und Sonderzahlungen.',
            'Every day of the month with working time, Gastfahrt, Spesen, surcharges, absences and special payments.',
          )}
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            label={busyLabel('own', 'pdf', pdfLabel)}
            onPress={() => run('own', 'pdf')}
            loading={busy === 'own-pdf'}
            disabled={busy !== null}
            leftIcon={<Download size={18} color="#fff" />}
          />
          <Button
            label={busyLabel('own', 'xlsx', xlsxLabel)}
            onPress={() => run('own', 'xlsx')}
            loading={busy === 'own-xlsx'}
            disabled={busy !== null}
            variant="secondary"
            leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
          />
        </View>
      </View>

      {isManagerial ? (
        <View style={cardStyle}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <UsersIcon size={18} color="#0064E0" />
            <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '900', color: '#0F172A' }}>
              {L('Monatsnachweis für Mitarbeiter', 'Statement for employees')}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12, lineHeight: 17 }}>
            {L(
              'Ein oder mehrere Mitarbeiter: ein PDF mit einer Seite je Mitarbeiter bzw. eine Excel-Datei mit einem Blatt je Mitarbeiter.',
              'One or more employees: one PDF with a page per employee, or one Excel file with a sheet per employee.',
            )}
          </Text>
          <EmployeePicker mode="multi" value={employeeIds} onChange={setEmployeeIds} includeSelf />
          <View style={{ gap: 8, marginTop: 14 }}>
            <Button
              label={busyLabel('selected', 'pdf', L(`PDF erstellen (${employeeIds.length})`, `Generate PDF (${employeeIds.length})`))}
              onPress={() => run('selected', 'pdf')}
              loading={busy === 'selected-pdf'}
              leftIcon={<Download size={18} color="#fff" />}
              disabled={employeeIds.length === 0 || busy !== null}
            />
            <Button
              label={busyLabel('selected', 'xlsx', L(`Excel exportieren (${employeeIds.length})`, `Export Excel (${employeeIds.length})`))}
              onPress={() => run('selected', 'xlsx')}
              loading={busy === 'selected-xlsx'}
              variant="secondary"
              leftIcon={<FileSpreadsheet size={18} color="#0064E0" />}
              disabled={employeeIds.length === 0 || busy !== null}
            />
          </View>
        </View>
      ) : null}
    </View>
  )
}
