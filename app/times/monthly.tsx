/**
 * Monatsnachweis (Kundenfeedback Punkt 5) — on-screen statement, mobile
 * replica of the webapp's /dashboard/times/monthly. The same report model
 * (fetchMonthlyReports → buildMonthlyReport) feeds this screen, the PDF
 * and the Excel export, so all three always match.
 *
 *   Controls  employee picker (admin/dispatcher) · month stepper · PDF · Excel
 *   Facts     Mitarbeiter · Monat · Sollstunden · Freigabestatus · Erstellt am
 *   KPIs      Ist · Differenz · Arbeitszeit · Gastfahrt · Spesen · Sonderzahlungen
 *   Days      the wide daily table as one card per shift / free day
 *   Totals    Summe row, Monatssummen – Stunden, Beträge in Euro, legend
 *
 * Employees see their own statement; admin/dispatch pick any employee.
 * Params: ?month=YYYY-MM&employee=<profile id>
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertTriangle, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Info } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { C, EmptyState, MicroLabel, OutlineButton, SurfaceCard } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useOrgRules } from '@/hooks/useOrgRules'
import { useSafeBack } from '@/lib/use-safe-back'
import { getSupabase } from '@/lib/supabase/client'
import { fetchMonthlyReports, fileSlug } from '@/lib/reports/fetch'
import type { MonthlyReport, MonthlyReportDay, MonthlyReportRow } from '@/lib/reports/monthly-report'
import { exportMonatsnachweisPdf } from '@/lib/pdf/monatsnachweis'
import { exportMonatsnachweisXlsx } from '@/lib/excel/monatsnachweis'
import { formatDateDE, formatEuro, formatHours, formatHoursLong, formatSignedHours, monthLabel } from '@/lib/time/format'
import { localDateKey, shiftIssueLabel } from '@/lib/time/shift-hours'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyStatementScreen() {
  const params = useLocalSearchParams<{ month?: string; employee?: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/times')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const isManager = isAdmin || isDispatcher
  const orgId = profile?.organization_id ?? null
  const myId = session?.user?.id ?? profile?.id ?? ''
  const { surchargeRules, spesenRates } = useOrgRules()

  const initialMonth = typeof params.month === 'string' && MONTH_RE.test(params.month) ? params.month : currentMonth()
  const [month, setMonth] = useState(initialMonth)
  const [employeeId, setEmployeeId] = useState<string>(typeof params.employee === 'string' ? params.employee : '')
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [exporting, setExporting] = useState<null | 'pdf' | 'xlsx'>(null)

  const targetId = isManager ? employeeId : myId

  // Admin/dispatch without a pre-selected employee: start with the first
  // active employee (the webapp does the same with its employee list).
  useEffect(() => {
    if (!isManager || !orgId || employeeId) return
    let alive = true
    getSupabase()
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .eq('role', 'employee')
      .order('full_name')
      .limit(1)
      .then(({ data }: any) => {
        const first = (data ?? [])[0]
        if (alive && first?.id) setEmployeeId((prev) => prev || (first.id as string))
      })
    return () => {
      alive = false
    }
    // Only on mount / org change — clearing the picker later must not re-select.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, orgId])

  useEffect(() => {
    if (!orgId || !targetId) {
      setReport(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    fetchMonthlyReports(
      orgId,
      [{ employeeId: targetId, month, name: targetId === myId ? profile?.full_name ?? undefined : undefined }],
      { surchargeRules, spesenRates, locale },
    )
      .then((r) => {
        if (alive) setReport(r[0] ?? null)
      })
      .catch((e) => {
        console.warn('[monthly]', e?.message ?? e)
        if (alive) {
          setReport(null)
          toast.error(L('Monatsnachweis konnte nicht geladen werden', 'Could not load monthly statement'))
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, targetId, month, surchargeRules, spesenRates, locale, reloadKey])

  const fileBase = report ? `Monatsnachweis_${fileSlug(report.employee.name)}_${report.month}` : ''

  const exportPdf = async () => {
    if (!report) return
    setExporting('pdf')
    try {
      await exportMonatsnachweisPdf([report], fileBase)
    } catch (e: any) {
      toast.error(e?.message ?? L('PDF-Export fehlgeschlagen', 'PDF export failed'))
    } finally {
      setExporting(null)
    }
  }

  const exportXlsx = async () => {
    if (!report) return
    setExporting('xlsx')
    try {
      await exportMonatsnachweisXlsx([report], `${fileBase}.xlsx`)
    } catch (e: any) {
      console.warn('[monthly] xlsx', e?.message ?? e)
      toast.error(L('Excel-Export fehlgeschlagen', 'Excel export failed'))
    } finally {
      setExporting(null)
    }
  }

  const t = report?.totals
  const hr = L('Std.', 'h')

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 64 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setReloadKey((k) => k + 1)} tintColor={C.brand} />}
      >
        <PageHeader
          showBack
          onBack={goBack}
          title={L('Monatsnachweis', 'Monthly statement')}
          subtitle={L('Alle Tage, Zuschläge, Spesen und Sonderzahlungen auf einen Blick', 'All days, premiums, per diem and special payments at a glance')}
        />

        {/* Controls */}
        <View style={{ gap: 12 }}>
          {isManager ? <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} includeSelf /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.slate200, borderRadius: 12, backgroundColor: '#FFFFFF', height: 40 }}>
              <Pressable onPress={() => setMonth((m) => shiftMonth(m, -1))} accessibilityLabel={L('Vormonat', 'Previous month')} hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={16} color={C.slate700} />
              </Pressable>
              <Pressable onPress={() => setMonth(currentMonth())} accessibilityLabel={L('Monat', 'Month')}>
                <Text style={{ minWidth: 112, textAlign: 'center', fontSize: 14, fontWeight: '700', color: C.slate700 }}>{monthLabel(month, locale)}</Text>
              </Pressable>
              <Pressable onPress={() => setMonth((m) => shiftMonth(m, 1))} accessibilityLabel={L('Folgemonat', 'Next month')} hitSlop={6} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={16} color={C.slate700} />
              </Pressable>
            </View>
            <OutlineButton
              label="PDF"
              icon={<Download size={16} color={C.slate700} />}
              onPress={exportPdf}
              disabled={!report || !!exporting}
              loading={exporting === 'pdf'}
            />
            <OutlineButton
              label="Excel"
              icon={<FileSpreadsheet size={16} color={C.slate700} />}
              onPress={exportXlsx}
              disabled={!report || !!exporting}
              loading={exporting === 'xlsx'}
            />
          </View>
        </View>

        {isManager && !employeeId ? (
          <EmptyState style={{ marginTop: 24 }} text={L('Bitte einen Mitarbeiter auswählen.', 'Please select an employee.')} />
        ) : loading ? (
          <View style={{ height: 240, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={C.blue600} />
          </View>
        ) : !report || !t ? (
          <EmptyState style={{ marginTop: 24 }} text={L('Monatsnachweis konnte nicht geladen werden', 'Could not load monthly statement')} />
        ) : (
          <View style={{ gap: 16, marginTop: 24 }}>
            {/* Header facts */}
            <SurfaceCard padding={18}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
                <Fact label={L('Mitarbeiter', 'Employee')} value={report.employee.name} />
                <Fact label={L('Monat', 'Month')} value={monthLabel(report.month, locale)} />
                <Fact
                  label={L('Sollstunden', 'Target hours')}
                  value={t.targetHours == null ? L('nicht hinterlegt', 'not set') : `${formatHours(t.targetHours, locale)} ${hr}`}
                  hint={t.targetHours == null ? undefined : `${t.weekdays - t.absenceWeekdays} ${L('Tage', 'days')} × ${formatHours(t.dailyTargetHours, locale)} ${hr}`}
                />
                <Fact
                  label={L('Freigabestatus', 'Approval')}
                  value={report.approval.label}
                  tone={report.approval.state === 'approved' ? 'ok' : report.approval.state === 'empty' ? undefined : 'warn'}
                  hint={report.hasCorrections ? L('enthält nachträgliche Korrekturen', 'contains later corrections') : undefined}
                />
                <Fact label={L('Erstellt am', 'Created')} value={formatDateDE(localDateKey(new Date(report.createdAt)))} hint={L('Live-Auswertung', 'Live evaluation')} />
              </View>
            </SurfaceCard>

            {/* KPIs */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Kpi label={L('Ist', 'Actual')} value={`${formatHours(t.actualHours, locale)} ${hr}`} sub={formatHoursLong(t.actualHours, locale)} />
              <Kpi
                label={L('Differenz Ist – Soll', 'Actual – target')}
                value={t.differenceHours == null ? '–' : `${formatSignedHours(t.differenceHours, locale)} ${hr}`}
                tone={t.differenceHours == null ? undefined : t.differenceHours < 0 ? 'warn' : 'ok'}
              />
              <Kpi label={L('Arbeitszeit', 'Working time')} value={`${formatHours(t.workHours, locale)} ${hr}`} sub={`${t.workingDays} ${L('Arbeitstage', 'working days')}`} />
              <Kpi label={L('Gastfahrt (separat)', 'Gastfahrt (separate)')} value={`${formatHours(t.gastfahrtHours, locale)} ${hr}`} />
              <Kpi label={L('Spesen gesamt', 'Per diem total')} value={formatEuro(t.spesenTotal, locale)} />
              <Kpi label={L('Sonderzahlungen', 'Special payments')} value={formatEuro(t.specialPaymentsTotal, locale)} />
            </View>

            {t.openEntries > 0 || t.issueCount > 0 || report.warnings.length > 0 ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.amber200, backgroundColor: C.amber50, padding: 16, gap: 6 }}>
                {t.issueCount > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} color={C.red700} style={{ marginTop: 1 }} />
                    <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, fontWeight: '700', color: C.red700 }}>
                      {L(`${t.issueCount} Eintrag/Einträge mit fehlenden oder widersprüchlichen Angaben`, `${t.issueCount} entr${t.issueCount === 1 ? 'y' : 'ies'} with missing or contradictory data`)}
                    </Text>
                  </View>
                ) : null}
                {t.openEntries > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <Info size={16} color={C.amber800} style={{ marginTop: 1 }} />
                    <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, fontWeight: '700', color: C.amber800 }}>
                      {L(`${t.openEntries} Eintrag/Einträge noch nicht freigegeben – im Nachweis markiert`, `${t.openEntries} entr${t.openEntries === 1 ? 'y' : 'ies'} not approved yet – marked below`)}
                    </Text>
                  </View>
                ) : null}
                {report.warnings.map((w) => (
                  <Text key={w} style={{ fontSize: 12, fontWeight: '600', color: C.amber800 }}>{w}</Text>
                ))}
              </View>
            ) : null}

            {/* Daily list (the web's wide table as cards) */}
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.slate200, overflow: 'hidden', backgroundColor: '#FFFFFF' }}>
              <View style={{ backgroundColor: C.brand, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: '#FFFFFF' }}>{L('Datum · Tag · Beginn – Ende', 'Date · Day · Start – End')}</Text>
                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: '#FFFFFF' }}>{L('Arbeitszeit (Std.)', 'Hours (h)')}</Text>
              </View>
              {report.days.map((d) =>
                d.rows.length === 0 ? (
                  <FreeDayRow key={d.date} day={d} locale={locale} />
                ) : (
                  d.rows.map((r, idx) => (
                    <ShiftRow key={r.entryId} day={d} row={r} idx={idx} locale={locale} onPress={() => router.push(`/times/${r.entryId}` as any)} />
                  ))
                ),
              )}
              {/* Summe (tfoot) */}
              <View style={{ backgroundColor: C.slate100, paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate900, marginBottom: 6 }}>{L('Summe', 'Total')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
                  <SumCell label={L('Arbeitszeit (Std.)', 'Hours (h)')} value={formatHours(t.workHours, locale)} />
                  <SumCell label={L('Gastfahrt (Std.)', 'Gastfahrt (h)')} value={formatHours(t.gastfahrtHours, locale)} />
                  <SumCell label={L('Spesen (€)', 'Per diem (€)')} value={formatEuro(t.spesenFromEntries, locale)} />
                  <SumCell label={L('Übernachtung', 'Overnight')} value={`${t.overnightCount}× ${L('ja', 'yes')}`} />
                  <SumCell label={L('25 % (Std.)', '25 % (h)')} value={formatHours(t.night25, locale)} />
                  <SumCell label={L('40 % (Std.)', '40 % (h)')} value={formatHours(t.night40, locale)} />
                  <SumCell label={L('Sonntag (Std.)', 'Sunday (h)')} value={formatHours(t.sunday, locale)} />
                  <SumCell label={L('Feiertag (Std.)', 'Holiday (h)')} value={formatHours(t.holiday, locale)} />
                </View>
              </View>
            </View>

            {/* Summary blocks */}
            <SummaryCard title={L('Monatssummen – Stunden', 'Monthly totals – hours')}>
              <Line label={L('Arbeitstage', 'Working days')} value={String(t.workingDays)} />
              <Line label={L('Sollstunden', 'Target hours')} value={t.targetHours == null ? '–' : `${formatHours(t.targetHours, locale)} ${hr}`} />
              <Line label={L('Arbeitszeit (ohne Gastfahrt)', 'Working time (excl. Gastfahrt)')} value={`${formatHours(t.workHours, locale)} ${hr}`} />
              <Line label={L('Gastfahrt (separat ausgewiesen)', 'Gastfahrt (shown separately)')} value={`${formatHours(t.gastfahrtHours, locale)} ${hr}`} />
              <Line
                strong
                label={report.rules.gastfahrtCountsAsWork ? L('Iststunden (Arbeitszeit + Gastfahrt)', 'Actual (work + Gastfahrt)') : L('Iststunden (nur Arbeitszeit)', 'Actual (work only)')}
                value={`${formatHours(t.actualHours, locale)} ${hr}`}
              />
              <Line label={L('Differenz Ist – Soll', 'Actual – target')} value={t.differenceHours == null ? '–' : `${formatSignedHours(t.differenceHours, locale)} ${hr}`} />
              <Line label={L('Nachtzuschlag 25 %', 'Night premium 25 %')} value={`${formatHours(t.night25, locale)} ${hr}`} />
              <Line label={L('Nachtzuschlag 40 %', 'Night premium 40 %')} value={`${formatHours(t.night40, locale)} ${hr}`} />
              <Line label={L('Sonntagszuschlag', 'Sunday premium')} value={`${formatHours(t.sunday, locale)} ${hr}`} />
              <Line label={L('Feiertagszuschlag', 'Holiday premium')} value={`${formatHours(t.holiday, locale)} ${hr}`} />
              <Line label={L('Urlaubstage / Krankheitstage', 'Vacation / sick days')} value={`${t.vacationDays} / ${t.sickDays}`} />
            </SummaryCard>

            <SummaryCard title={L('Beträge in Euro', 'Amounts in euro')}>
              {t.spesen.length === 0 ? <Line label={L('Spesen aus Schichten', 'Per diem from shifts')} value={formatEuro(0, locale)} /> : null}
              {t.spesen.map((l) => (
                <Line key={l.label} label={`${l.count} × ${l.label}`} value={formatEuro(l.amount, locale)} />
              ))}
              {t.perDiemClaims.count > 0 ? (
                <Line label={L(`Spesenanträge (${t.perDiemClaims.count})`, `Per-diem claims (${t.perDiemClaims.count})`)} value={formatEuro(t.perDiemClaims.amount, locale)} />
              ) : null}
              <Line strong label={L('Spesen gesamt', 'Per diem total')} value={formatEuro(t.spesenTotal, locale)} />
              <View style={{ height: 1, backgroundColor: C.slate100, marginVertical: 6 }} />
              {t.specialPayments.length === 0 ? <Line label={L('Keine Sonderzahlungen in diesem Monat', 'No special payments this month')} value="–" /> : null}
              {t.specialPayments.map((p) => (
                <Line key={p.id} label={`${p.title} (${p.periodLabel})${p.note ? ` – ${p.note}` : ''}`} value={formatEuro(p.amount, locale)} />
              ))}
              <Line strong label={L('Sonderzahlungen gesamt', 'Special payments total')} value={formatEuro(t.specialPaymentsTotal, locale)} />
            </SummaryCard>

            {/* Legend */}
            <Text style={{ fontSize: 12, lineHeight: 18, color: C.slate500 }}>
              {L(
                `Dezimalstunden: 7,50 Std. = ${formatHoursLong(7.5, 'de')} Eine Schicht zählt zum Tag ihres Beginns. Spesen werden je Kalendertag einmal berücksichtigt. Gastfahrt wird separat ausgewiesen und nicht doppelt gezählt. Sonn- und Feiertagsstunden zählen nur, soweit sie auf den Tag fallen.`,
                'Decimal hours: 7.50 h = 7 h 30 min. A shift belongs to the day it starts. Per diem counts once per calendar day. Gastfahrt is shown separately and never counted twice. Sunday/holiday hours only count for the part of the shift on that day.',
              )}
            </Text>
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────

function Fact({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' }) {
  return (
    <View style={{ width: '50%', paddingRight: 8 }}>
      <MicroLabel>{label}</MicroLabel>
      <Text style={{ marginTop: 2, fontSize: 14, fontWeight: '900', color: tone === 'ok' ? C.emerald700 : tone === 'warn' ? C.amber700 : C.slate900 }}>{value}</Text>
      {hint ? <Text style={{ fontSize: 12, color: C.slate400 }}>{hint}</Text> : null}
    </View>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.slate200, padding: 14 }}>
      <MicroLabel>{label}</MicroLabel>
      <Text
        style={{ marginTop: 4, fontSize: 20, fontWeight: '900', color: tone === 'ok' ? C.emerald700 : tone === 'warn' ? C.amber700 : C.slate900, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={{ fontSize: 12, color: C.slate400 }}>{sub}</Text> : null}
    </View>
  )
}

function FreeDayRow({ day, locale }: { day: MonthlyReportDay; locale: 'de' | 'en' }) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const bg = day.absence ? 'rgba(239,246,255,0.6)' : day.holidayName ? C.yellow50 : day.isWeekend ? 'rgba(248,250,252,0.7)' : '#FFFFFF'
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.slate100, backgroundColor: bg }}>
      <Text style={{ width: 84, fontSize: 12, color: C.slate400, fontVariant: ['tabular-nums'] }}>{formatDateDE(day.date)}</Text>
      <Text style={{ width: 30, fontSize: 12, color: C.slate400 }}>{day.weekdayShort}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontSize: 12, fontStyle: 'italic', color: C.slate400 }} numberOfLines={1}>
        {day.absence?.label ?? day.holidayName ?? L('kein Einsatz', 'no shift')}
      </Text>
    </View>
  )
}

function Detail({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ marginRight: 14, marginTop: 6 }}>
      <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: C.slate400 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: color ?? C.slate700, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}

function ShiftRow({
  day,
  row: r,
  idx,
  locale,
  onPress,
}: {
  day: MonthlyReportDay
  row: MonthlyReportRow
  idx: number
  locale: 'de' | 'en'
  onPress: () => void
}) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hasNote =
    (idx === 0 && !!(day.holidayName || day.absence)) ||
    r.status !== 'approved' ||
    r.issues.length > 0 ||
    r.corrected ||
    r.enteredOnBehalf ||
    !!r.route ||
    !!r.notes
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.slate100, backgroundColor: r.issues.length > 0 ? 'rgba(254,242,242,0.5)' : '#FFFFFF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ width: 84, fontSize: 13, fontWeight: '700', color: C.slate900, fontVariant: ['tabular-nums'] }}>{formatDateDE(day.date)}</Text>
          <Text style={{ width: 30, fontSize: 13, color: C.slate700 }}>{day.weekdayShort}</Text>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: C.slate700, fontVariant: ['tabular-nums'] }}>{`${r.start}–${r.end || '–'}`}</Text>
            {r.endDayOffset > 0 ? (
              <View style={{ marginLeft: 4, paddingHorizontal: 4, borderRadius: 4, backgroundColor: C.indigo50 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: C.indigo700 }}>{`+${r.endDayOffset}`}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 15, fontWeight: '900', color: C.slate900, fontVariant: ['tabular-nums'] }}>{r.workHours ? formatHours(r.workHours, locale) : ''}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginLeft: 0 }}>
          <Detail label={L('Pause', 'Break')} value={`${r.breakMinutes} Min.`} />
          {r.gastfahrtHours ? <Detail label={L('Gastfahrt', 'Gastfahrt')} value={formatHours(r.gastfahrtHours, locale)} color={C.violet700} /> : null}
          {idx === 0 && day.daySpesen ? <Detail label={L('Spesen', 'Per diem')} value={formatEuro(day.daySpesen, locale)} /> : null}
          <Detail label={L('Übernachtung', 'Overnight')} value={r.overnight ? L('ja', 'yes') : L('nein', 'no')} color={r.overnight ? C.emerald700 : undefined} />
          {r.night25 ? <Detail label="25 %" value={formatHours(r.night25, locale)} /> : null}
          {r.night40 ? <Detail label="40 %" value={formatHours(r.night40, locale)} /> : null}
          {r.sunday ? <Detail label={L('Sonntag', 'Sunday')} value={formatHours(r.sunday, locale)} /> : null}
          {r.holiday ? <Detail label={L('Feiertag', 'Holiday')} value={formatHours(r.holiday, locale)} /> : null}
        </View>

        {hasNote ? (
          <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17 }}>
            {idx === 0 && (day.holidayName || day.absence) ? (
              <Text style={{ fontWeight: '700', color: C.slate500 }}>{`${day.holidayName ?? day.absence?.label ?? ''} · `}</Text>
            ) : null}
            {r.status !== 'approved' ? (
              <Text style={{ fontWeight: '700', color: C.amber700 }}>
                {`${r.status === 'running' ? L('läuft', 'running') : r.status === 'draft' ? L('nicht abgesendet', 'not submitted') : L('nicht freigegeben', 'not approved')} `}
              </Text>
            ) : null}
            {r.issues.length > 0 ? <Text style={{ fontWeight: '700', color: C.red600 }}>{`${r.issues.map((i) => shiftIssueLabel(i, locale)).join(', ')} `}</Text> : null}
            {r.corrected ? <Text style={{ color: C.indigo700 }}>{`${L('korrigiert', 'corrected')} `}</Text> : null}
            {r.enteredOnBehalf ? <Text style={{ color: C.slate500 }}>{`${L('stellv. erfasst', 'on behalf')} `}</Text> : null}
            {r.route ? <Text style={{ color: C.slate600 }}>{`${r.route} `}</Text> : null}
            {r.notes ? <Text style={{ color: C.slate400 }}>{r.notes}</Text> : null}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

function SumCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingRight: 8 }}>
      <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase', color: C.slate500 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate900, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SurfaceCard padding={20}>
      <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.brand, marginBottom: 12 }}>{title}</Text>
      <View style={{ gap: 6 }}>{children}</View>
    </SurfaceCard>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <Text style={{ flex: 1, fontSize: 14, fontWeight: strong ? '900' : '400', color: strong ? C.slate900 : C.slate600, paddingRight: 12 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: strong ? '900' : '700', color: strong ? C.slate900 : C.slate600, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}
