/**
 * Excel exports (SheetJS) for the Monatsnachweis, the Gesamtauswertung and
 * the Mehrmonatsreport. Same data model and column layout as the webapp
 * (exceljs) and the PDFs, so all files show identical values
 * (Kundenfeedback Punkte 5 + 18). Numbers are written as real numbers with
 * a number format so the sheet stays calculable.
 */

import { Platform } from 'react-native'
import * as XLSX from 'xlsx'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { MonthlyReport } from '@/lib/reports/monthly-report'
import type { MonthOverview, MultiMonthReport, OverviewRow, OverviewTotals } from '@/lib/reports/overview-report'
import { formatDateDE, formatHoursLong } from '@/lib/time/format'
import { localDateKey, shiftIssueLabel } from '@/lib/time/shift-hours'

type Cell = string | number | XLSX.CellObject
const HOURS = '0.00'
const EURO = '#,##0.00 "€"'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Number cell with format; empty for null/0 when `blankZero`. */
function num(v: number | null | undefined, fmt: string, blankZero = false): Cell {
  if (v == null || (blankZero && !v)) return ''
  return { t: 'n', v, z: fmt }
}

function sheet(rows: Cell[][], widths: number[], headerRow: number): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = widths.map((wch) => ({ wch }))
  ws['!margins'] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }
  // Auto-filter on the header row so the table can be sorted/filtered.
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1:A1')
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow, c: range.e.c } }) }
  return ws
}

async function saveWorkbook(wb: XLSX.WorkBook, filename: string, dialogTitle: string): Promise<string> {
  if (Platform.OS === 'web') {
    XLSX.writeFile(wb, filename)
    return filename
  }
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
  if (!dir) throw new Error('No writable directory available')
  const uri = `${dir}${filename}`
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: XLSX_MIME, dialogTitle, UTI: 'org.openxmlformats.spreadsheetml.sheet' })
  }
  return uri
}

function monatsnachweisSheet(report: MonthlyReport): XLSX.WorkSheet {
  const t = report.totals
  const rows: Cell[][] = []
  rows.push(['Monatsnachweis', '', '', '', '', report.monthLabel])
  rows.push(['Mitarbeiter', '', report.employee.name])
  rows.push([
    'Sollstunden',
    '',
    t.targetHours == null ? 'nicht hinterlegt' : num(t.targetHours, HOURS),
    '',
    t.targetHours == null ? '' : `${t.weekdays - t.absenceWeekdays} Tage × ${t.dailyTargetHours} Std.`,
  ])
  rows.push(['Freigabestatus', '', report.approval.label + (report.hasCorrections ? ' · enthält Korrekturen' : '')])
  const c = new Date(report.createdAt)
  rows.push(['Erstellt am', '', `${formatDateDE(localDateKey(c))} ${String(c.getHours()).padStart(2, '0')}:${String(c.getMinutes()).padStart(2, '0')}`])
  rows.push([])
  const headerRow = rows.length
  rows.push([
    'Datum', 'Tag', 'Beginn', 'Ende', 'Pause (Min.)', 'Arbeitszeit (Std.)', 'Gastfahrt (Std.)', 'Spesen (€)',
    'Übernachtung', '25 % (Std.)', '40 % (Std.)', 'Sonntag (Std.)', 'Feiertag (Std.)', 'Status / Bemerkung',
  ])

  for (const d of report.days) {
    if (d.rows.length === 0) {
      rows.push([formatDateDE(d.date), d.weekdayShort, '', '', '', '', '', '', '', '', '', '', '', d.absence?.label ?? d.holidayName ?? 'kein Einsatz'])
      continue
    }
    d.rows.forEach((r, idx) => {
      const remarks: string[] = []
      if (idx === 0 && (d.holidayName || d.absence)) remarks.push((d.holidayName ?? d.absence?.label) as string)
      if (r.status === 'running') remarks.push('läuft')
      else if (r.status === 'draft') remarks.push('nicht abgesendet')
      else if (r.status === 'submitted') remarks.push('nicht freigegeben')
      if (r.issues.length) remarks.push(r.issues.map((i) => shiftIssueLabel(i, 'de')).join(', '))
      if (r.corrected) remarks.push('korrigiert')
      if (r.enteredOnBehalf) remarks.push('stellv. erfasst')
      if (r.route) remarks.push(r.route)
      if (r.notes) remarks.push(r.notes)
      rows.push([
        formatDateDE(d.date),
        d.weekdayShort,
        r.start,
        r.end ? `${r.end}${r.endDayOffset > 0 ? ` (+${r.endDayOffset})` : ''}` : '–',
        r.breakMinutes,
        num(r.workHours, HOURS, true),
        num(r.gastfahrtHours, HOURS, true),
        idx === 0 && d.daySpesen ? num(d.daySpesen, EURO) : '',
        r.overnight ? 'ja' : 'nein',
        num(r.night25, HOURS, true),
        num(r.night40, HOURS, true),
        num(r.sunday, HOURS, true),
        num(r.holiday, HOURS, true),
        remarks.join(' · '),
      ])
    })
  }

  rows.push([
    'Summe', '', '', '', '', num(t.workHours, HOURS), num(t.gastfahrtHours, HOURS), num(t.spesenFromEntries, EURO),
    `${t.overnightCount}× ja`, num(t.night25, HOURS), num(t.night40, HOURS), num(t.sunday, HOURS), num(t.holiday, HOURS), '',
  ])
  rows.push([])

  const line = (label: string, value: number | null, fmt?: string) =>
    rows.push([label, '', '', '', '', value == null ? '–' : fmt ? num(value, fmt) : value])

  rows.push(['Monatssummen – Stunden'])
  line('Arbeitstage', t.workingDays)
  line('Sollstunden', t.targetHours, HOURS)
  line('Arbeitszeit (ohne Gastfahrt)', t.workHours, HOURS)
  line('Gastfahrt (separat ausgewiesen)', t.gastfahrtHours, HOURS)
  line(report.rules.gastfahrtCountsAsWork ? 'Iststunden (Arbeitszeit + Gastfahrt)' : 'Iststunden (nur Arbeitszeit)', t.actualHours, HOURS)
  line('Differenz Ist – Soll', t.differenceHours, HOURS)
  line('Nachtzuschlag 25 %', t.night25, HOURS)
  line('Nachtzuschlag 40 %', t.night40, HOURS)
  line('Sonntagszuschlag', t.sunday, HOURS)
  line('Feiertagszuschlag', t.holiday, HOURS)
  line('Urlaubstage', t.vacationDays)
  line('Krankheitstage', t.sickDays)
  rows.push([])
  rows.push(['Beträge in Euro'])
  for (const l of t.spesen) line(`Spesen: ${l.count} × ${l.label}`, l.amount, EURO)
  if (t.perDiemClaims.count) line(`Spesenanträge (${t.perDiemClaims.count})`, t.perDiemClaims.amount, EURO)
  line('Spesen gesamt', t.spesenTotal, EURO)
  for (const p of t.specialPayments) line(`${p.title} (${p.periodLabel})${p.note ? ` – ${p.note}` : ''}`, p.amount, EURO)
  line('Sonderzahlungen gesamt', t.specialPaymentsTotal, EURO)
  rows.push([])
  rows.push([`Hinweis: Dezimalstunden – 7,50 Std. = ${formatHoursLong(7.5, 'de')}`])
  for (const w of report.warnings) rows.push([w])

  return sheet(rows, [12, 6, 8, 10, 8, 11, 10, 10, 11, 8, 8, 9, 9, 48], headerRow)
}

function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Blatt'
  let name = base
  for (let i = 2; used.has(name); i++) name = `${base} ${i}`
  used.add(name)
  return name
}

/** One sheet per employee — used for the single and the all-drivers export. */
export async function exportMonatsnachweisXlsx(reports: MonthlyReport[], filename: string): Promise<string> {
  const wb = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const r of reports) {
    XLSX.utils.book_append_sheet(wb, monatsnachweisSheet(r), sheetName(reports.length === 1 ? 'Monatsnachweis' : r.employee.name, used))
  }
  return saveWorkbook(wb, filename, 'Monatsnachweis')
}

function overviewSheet(title: string, subtitle: string, firstCol: string, rows: OverviewRow[], totals: OverviewTotals, totalsLabel: string, gastfahrtCountsAsWork: boolean): XLSX.WorkSheet {
  const out: Cell[][] = [[title], [subtitle], []]
  const headerRow = out.length
  out.push([
    firstCol, 'Soll (Std.)', 'Arbeitszeit (Std.)', 'Gastfahrt (Std.)', 'Ist (Std.)', 'Differenz (Std.)',
    'Urlaub (Tage)', 'Krank (Tage)', 'Arbeitstage', 'Offene Einträge', 'Fehlerhafte Einträge',
  ])
  const put = (label: string, r: OverviewTotals) =>
    out.push([
      label, num(r.targetHours, HOURS), num(r.workHours, HOURS), num(r.gastfahrtHours, HOURS), num(r.actualHours, HOURS),
      num(r.differenceHours, HOURS), r.vacationDays, r.sickDays, r.workingDays, r.openEntries, r.issueCount,
    ])
  rows.forEach((r) => put(r.label, r))
  put(totalsLabel, totals)
  out.push([])
  out.push([
    `Werte entsprechen den Monatsnachweisen. Gastfahrt separat ausgewiesen, ${gastfahrtCountsAsWork ? 'nicht doppelt gezählt; Ist = Arbeitszeit + Gastfahrt' : 'zählt nicht zu den Iststunden; Ist = Arbeitszeit'}. Abwesenheitstage = Arbeitstage (Mo–Fr ohne Feiertag) mit genehmigtem Urlaub/Krankmeldung.`,
  ])
  return sheet(out, [28, 12, 13, 13, 13, 13, 11, 12, 12, 14, 16], headerRow)
}

export async function exportMonthOverviewXlsx(o: MonthOverview, filename: string): Promise<string> {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    overviewSheet(`Gesamtauswertung ${o.monthLabel}`, `Alle Lokführer · erstellt am ${formatDateDE(localDateKey(new Date(o.createdAt)))}`, 'Mitarbeiter', o.rows, o.totals, 'Summe', o.gastfahrtCountsAsWork),
    'Gesamtauswertung',
  )
  return saveWorkbook(wb, filename, 'Gesamtauswertung')
}

export async function exportMultiMonthXlsx(r: MultiMonthReport, filename: string): Promise<string> {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    overviewSheet(`Mehrmonatsreport ${r.employee.name}`, `${r.periodLabel} · erstellt am ${formatDateDE(localDateKey(new Date(r.createdAt)))}`, 'Monat', r.rows, r.totals, 'Summe Zeitraum', r.gastfahrtCountsAsWork),
    'Mehrmonatsreport',
  )
  return saveWorkbook(wb, filename, 'Mehrmonatsreport')
}
