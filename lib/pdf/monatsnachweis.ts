/**
 * Monatsnachweis + Gesamtauswertung + Mehrmonatsreport as PDF (expo-print).
 * Rendered from the shared report models, so the values equal the
 * webapp's PDF/Excel and the screens (Kundenfeedback Punkte 5 + 18).
 * A4 landscape; the table header repeats on every printed page.
 */

import { renderAndSharePdf } from './share'
import type { MonthlyReport } from '@/lib/reports/monthly-report'
import type { MonthOverview, MultiMonthReport, OverviewRow, OverviewTotals } from '@/lib/reports/overview-report'
import { formatDateDE, formatEuro, formatHours, formatHoursLong, formatSignedHours, monthShort } from '@/lib/time/format'
import { localDateKey, shiftIssueLabel } from '@/lib/time/shift-hours'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const h = (n: number) => (n ? formatHours(n, 'de') : '')

const CSS = `
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e293b; font-size: 8.5px; margin: 0; }
  h1 { font-size: 18px; margin: 0; color: #0f172a; }
  .month { color: #0064E0; font-size: 12px; font-weight: 700; margin-top: 2px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .facts td { padding: 1px 6px; font-size: 9px; }
  .facts td:first-child { color: #64748b; }
  .facts td:last-child { font-weight: 700; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid thead { display: table-header-group; }
  table.grid tr { page-break-inside: avoid; }
  table.grid th { background: #0064E0; color: #fff; font-weight: 700; padding: 3px 4px; border: 1px solid #0064E0; text-align: center; }
  table.grid td { border: 1px solid #e2e8f0; padding: 2px 4px; text-align: center; }
  table.grid td.l { text-align: left; }
  tr.free td { color: #94a3b8; font-style: italic; }
  tr.weekend td { background: #f8fafc; }
  tr.absence td { background: #eff6ff; }
  tr.holiday td { background: #fef9c3; }
  tr.issue td { background: #fef2f2; }
  td.warn { color: #b45309; }
  td.err { color: #b91c1c; font-weight: 700; }
  td.yes { color: #15803d; font-weight: 700; }
  tfoot td { background: #f1f5f9; font-weight: 700; }
  .blocks { display: flex; gap: 16px; margin-top: 10px; page-break-inside: avoid; }
  .block { flex: 1; }
  .block h3 { color: #0064E0; font-size: 10px; margin: 0 0 4px; }
  .block table { width: 100%; border-collapse: collapse; }
  .block td { padding: 1.5px 0; font-size: 9px; }
  .block td:last-child { text-align: right; font-weight: 700; }
  .legend { margin-top: 8px; color: #64748b; font-size: 8px; line-height: 1.45; }
  .sign { display: flex; gap: 60px; margin-top: 26px; font-size: 8px; color: #475569; }
  .sign div { border-top: 1px solid #94a3b8; width: 220px; padding-top: 3px; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .charts { display: flex; gap: 16px; margin-top: 12px; page-break-inside: avoid; }
  .chart { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; }
  .chart h3 { font-size: 10px; margin: 0 0 6px; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 110px; border-bottom: 1px solid #cbd5e1; }
  .grp { flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 100%; }
  .bar { width: 10px; position: relative; }
  .bar span { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); font-size: 6.5px; white-space: nowrap; }
  .labels { display: flex; gap: 6px; margin-top: 2px; }
  .labels div { flex: 1; text-align: center; font-size: 7px; color: #64748b; }
  .key { font-size: 8px; margin-top: 4px; }
  .key i { display: inline-block; width: 8px; height: 8px; margin: 0 3px 0 8px; vertical-align: middle; }
`

function created(iso: string): string {
  const d = new Date(iso)
  return `${formatDateDE(localDateKey(d))}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`
}

function doc(body: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/><style>${CSS}</style></head><body>${body}</body></html>`
}

export function renderMonatsnachweis(report: MonthlyReport): string {
  const t = report.totals
  const soll =
    t.targetHours == null
      ? 'nicht hinterlegt'
      : `${formatHours(t.targetHours, 'de')} Std. (${t.weekdays - t.absenceWeekdays} Tage × ${formatHours(t.dailyTargetHours, 'de')} Std.)`

  const rows: string[] = []
  for (const d of report.days) {
    const date = formatDateDE(d.date)
    if (d.rows.length === 0) {
      const cls = d.absence ? 'free absence' : d.holidayName ? 'free holiday' : d.isWeekend ? 'free weekend' : 'free'
      rows.push(`<tr class="${cls}"><td class="l">${date}</td><td>${d.weekdayShort}</td><td colspan="11"></td><td class="l">${esc(d.absence?.label ?? d.holidayName ?? 'kein Einsatz')}</td></tr>`)
      continue
    }
    d.rows.forEach((r, idx) => {
      const parts: string[] = []
      if (idx === 0 && (d.holidayName || d.absence)) parts.push(d.holidayName ?? d.absence?.label ?? '')
      if (r.status === 'running') parts.push('läuft')
      else if (r.status === 'draft') parts.push('nicht abgesendet')
      else if (r.status === 'submitted') parts.push('nicht freigegeben')
      if (r.issues.length) parts.push(r.issues.map((i) => shiftIssueLabel(i, 'de')).join(', '))
      if (r.corrected) parts.push('korrigiert')
      if (r.enteredOnBehalf) parts.push('stellv. erfasst')
      if (r.route) parts.push(r.route)
      if (r.notes) parts.push(r.notes)
      const statusCls = r.issues.length ? 'err' : r.status !== 'approved' ? 'warn' : ''
      rows.push(
        `<tr class="${r.issues.length ? 'issue' : ''}"><td class="l">${date}</td><td>${d.weekdayShort}</td><td>${r.start}</td><td>${r.end ? `${r.end}${r.endDayOffset > 0 ? ` (+${r.endDayOffset})` : ''}` : '–'}</td><td>${r.breakMinutes}</td><td>${h(r.workHours)}</td><td>${h(r.gastfahrtHours)}</td><td>${idx === 0 && d.daySpesen ? formatHours(d.daySpesen, 'de') : ''}</td><td class="${r.overnight ? 'yes' : ''}">${r.overnight ? 'ja' : 'nein'}</td><td>${h(r.night25)}</td><td>${h(r.night40)}</td><td>${h(r.sunday)}</td><td>${h(r.holiday)}</td><td class="l ${statusCls}">${esc(parts.join(' · '))}</td></tr>`,
      )
    })
  }

  const hoursBlock = [
    ['Arbeitstage', String(t.workingDays)],
    ['Sollstunden', t.targetHours == null ? '–' : `${formatHours(t.targetHours, 'de')} Std.`],
    ['Arbeitszeit (ohne Gastfahrt)', `${formatHours(t.workHours, 'de')} Std.`],
    ['Gastfahrt (separat ausgewiesen)', `${formatHours(t.gastfahrtHours, 'de')} Std.`],
    [report.rules.gastfahrtCountsAsWork ? 'Iststunden (Arbeitszeit + Gastfahrt)' : 'Iststunden (nur Arbeitszeit)', `${formatHours(t.actualHours, 'de')} Std.`],
    ['Differenz Ist – Soll', t.differenceHours == null ? '–' : `${formatSignedHours(t.differenceHours, 'de')} Std.`],
    ['Nachtzuschlag 25 %', `${formatHours(t.night25, 'de')} Std.`],
    ['Nachtzuschlag 40 %', `${formatHours(t.night40, 'de')} Std.`],
    ['Sonntagszuschlag', `${formatHours(t.sunday, 'de')} Std.`],
    ['Feiertagszuschlag', `${formatHours(t.holiday, 'de')} Std.`],
    ['Urlaubstage / Krankheitstage', `${t.vacationDays} / ${t.sickDays}`],
  ]
  const euroBlock = [
    ...t.spesen.map((l) => [`Spesen: ${l.count} × ${l.label}`, formatEuro(l.amount, 'de')]),
    ...(t.perDiemClaims.count ? [[`Spesenanträge (${t.perDiemClaims.count})`, formatEuro(t.perDiemClaims.amount, 'de')]] : []),
    ['Spesen gesamt', formatEuro(t.spesenTotal, 'de')],
    ...t.specialPayments.map((p) => [`${p.title} (${p.periodLabel})${p.note ? ` – ${p.note}` : ''}`, formatEuro(p.amount, 'de')]),
    ['Sonderzahlungen gesamt', formatEuro(t.specialPaymentsTotal, 'de')],
  ]
  const block = (title: string, lines: string[][]) =>
    `<div class="block"><h3>${title}</h3><table>${lines.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></div>`

  const r = report.rules
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const legend = [
    `Dezimalstunden: 7,50 Std. = ${formatHoursLong(7.5, 'de')}.`,
    `Nachtzuschlag 25 %: ${hhmm(r.night25From)}–${hhmm(r.night25To)} Uhr, 40 %: ${hhmm(r.night40From)}–${hhmm(r.night40To)} Uhr. Sonn-/Feiertag: nur die Stunden, die auf den Tag fallen (${r.excludedHolidayNames.join(', ')} separat vergütet).`,
    'Eine Schicht zählt zum Tag ihres Beginns. Spesen werden je Kalendertag einmal berücksichtigt. Gastfahrt wird separat ausgewiesen und nicht doppelt gezählt.',
    t.openEntries ? `${t.openEntries} Eintrag/Einträge noch nicht freigegeben (in der Spalte Status markiert).` : 'Alle Einträge sind freigegeben.',
    ...report.warnings,
  ]

  return `<section class="page">
  <div class="head">
    <div><h1>Monatsnachweis</h1><div class="month">${esc(report.monthLabel)}</div></div>
    <table class="facts">
      <tr><td>Mitarbeiter:</td><td>${esc(report.employee.name)}</td></tr>
      <tr><td>Sollstunden:</td><td>${esc(soll)}</td></tr>
      <tr><td>Freigabestatus:</td><td>${esc(report.approval.label)}${report.hasCorrections ? ' · enthält Korrekturen' : ''}</td></tr>
      <tr><td>Erstellt am:</td><td>${created(report.createdAt)}</td></tr>
    </table>
  </div>
  <table class="grid">
    <thead><tr><th>Datum</th><th>Tag</th><th>Beginn</th><th>Ende</th><th>Pause (Min.)</th><th>Arbeitszeit (Std.)</th><th>Gastfahrt (Std.)</th><th>Spesen (€)</th><th>Übernachtung</th><th>25 % (Std.)</th><th>40 % (Std.)</th><th>Sonntag (Std.)</th><th>Feiertag (Std.)</th><th>Status / Bemerkung</th></tr></thead>
    <tbody>${rows.join('')}</tbody>
    <tfoot><tr><td class="l" colspan="5">Summe</td><td>${formatHours(t.workHours, 'de')}</td><td>${formatHours(t.gastfahrtHours, 'de')}</td><td>${formatHours(t.spesenFromEntries, 'de')}</td><td>${t.overnightCount}× ja</td><td>${formatHours(t.night25, 'de')}</td><td>${formatHours(t.night40, 'de')}</td><td>${formatHours(t.sunday, 'de')}</td><td>${formatHours(t.holiday, 'de')}</td><td></td></tr></tfoot>
  </table>
  <div class="blocks">${block('Monatssummen – Stunden', hoursBlock)}${block('Beträge in Euro', euroBlock)}</div>
  <div class="legend">${legend.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
  <div class="sign"><div>Datum, Unterschrift Mitarbeiter</div><div>Datum, Unterschrift Disposition</div></div>
</section>`
}

export async function exportMonatsnachweisPdf(reports: MonthlyReport[], filenameBase: string): Promise<string> {
  return renderAndSharePdf({ html: doc(reports.map(renderMonatsnachweis).join('')), filenameBase, dialogTitle: 'Monatsnachweis' })
}

function overviewTable(firstCol: string, rows: OverviewRow[], totals: OverviewTotals, totalsLabel: string): string {
  const v = (n: number | null) => (n == null ? '–' : formatHours(n, 'de'))
  const diff = (n: number | null) => (n == null ? '–' : formatSignedHours(n, 'de'))
  return `<table class="grid">
    <thead><tr><th>${firstCol}</th><th>Soll (Std.)</th><th>Arbeitszeit (Std.)</th><th>Gastfahrt (Std.)</th><th>Ist (Std.)</th><th>Differenz (Std.)</th><th>Urlaub (Tage)</th><th>Krank (Tage)</th><th>Arbeitstage</th><th>Offene Einträge</th><th>Fehlerhafte Einträge</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td class="l">${esc(r.label)}</td><td>${v(r.targetHours)}</td><td>${v(r.workHours)}</td><td>${v(r.gastfahrtHours)}</td><td>${v(r.actualHours)}</td><td>${diff(r.differenceHours)}</td><td>${r.vacationDays}</td><td>${r.sickDays}</td><td>${r.workingDays}</td><td class="${r.openEntries ? 'warn' : ''}">${r.openEntries}</td><td class="${r.issueCount ? 'err' : ''}">${r.issueCount}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td class="l">${totalsLabel}</td><td>${v(totals.targetHours)}</td><td>${v(totals.workHours)}</td><td>${v(totals.gastfahrtHours)}</td><td>${v(totals.actualHours)}</td><td>${diff(totals.differenceHours)}</td><td>${totals.vacationDays}</td><td>${totals.sickDays}</td><td>${totals.workingDays}</td><td>${totals.openEntries}</td><td>${totals.issueCount}</td></tr></tfoot>
  </table>`
}

const legend = (gastfahrtCountsAsWork: boolean) =>
  `<div class="legend"><div>Werte entsprechen den Monatsnachweisen. Gastfahrt separat ausgewiesen, ${gastfahrtCountsAsWork ? 'nicht doppelt gezählt; Ist = Arbeitszeit + Gastfahrt' : 'zählt nicht zu den Iststunden; Ist = Arbeitszeit'}.</div><div>Abwesenheitstage: Arbeitstage (Mo–Fr ohne Feiertag) mit genehmigtem Urlaub bzw. Krankmeldung. „Fehlerhafte Einträge“ (z. B. 0 Stunden, fehlendes Ende) bitte im Monatsnachweis prüfen. Die Übersicht ist keine Leistungsbewertung.</div></div>`

export async function exportMonthOverviewPdf(o: MonthOverview): Promise<string> {
  const body = `<section><div class="head"><div><h1>Gesamtauswertung</h1><div class="month">${esc(o.monthLabel)} · alle Lokführer</div></div><table class="facts"><tr><td>Erstellt am:</td><td>${created(o.createdAt)}</td></tr></table></div>${overviewTable('Mitarbeiter', o.rows, o.totals, 'Summe')}${legend(o.gastfahrtCountsAsWork)}</section>`
  return renderAndSharePdf({ html: doc(body), filenameBase: `Gesamtauswertung_${o.month}`, dialogTitle: 'Gesamtauswertung' })
}

function chart(title: string, unit: string, cats: string[], series: { label: string; color: string; values: number[] }[]): string {
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const groups = cats
    .map(
      (_, i) =>
        `<div class="grp">${series
          .map((s) => {
            const v = s.values[i] ?? 0
            const pct = Math.round((v / max) * 100)
            return `<div class="bar" style="height:${pct}%;background:${s.color}">${v ? `<span>${Number.isInteger(v) ? v : formatHours(v, 'de')}</span>` : ''}</div>`
          })
          .join('')}</div>`,
    )
    .join('')
  return `<div class="chart"><h3>${title} (${unit})</h3><div class="bars">${groups}</div><div class="labels">${cats.map((c) => `<div>${c}</div>`).join('')}</div><div class="key">${series.map((s) => `<i style="background:${s.color}"></i>${s.label}`).join('')}</div></div>`
}

export async function exportMultiMonthPdf(r: MultiMonthReport): Promise<string> {
  const cats = r.rows.map((x) => monthShort(x.month))
  const charts = `<div class="charts">${chart('Arbeitszeit und Gastfahrt je Monat', 'Std.', cats, [
    { label: 'Arbeitszeit', color: '#0064E0', values: r.rows.map((x) => x.workHours) },
    { label: 'Gastfahrt', color: '#7C3AED', values: r.rows.map((x) => x.gastfahrtHours) },
  ])}${chart('Urlaubs- und Krankheitstage je Monat', 'Tage', cats, [
    { label: 'Urlaub', color: '#0D9488', values: r.rows.map((x) => x.vacationDays) },
    { label: 'Krank', color: '#E11D48', values: r.rows.map((x) => x.sickDays) },
  ])}</div>`
  const body = `<section><div class="head"><div><h1>Mehrmonatsreport · ${esc(r.employee.name)}</h1><div class="month">${esc(r.periodLabel)}</div></div><table class="facts"><tr><td>Erstellt am:</td><td>${created(r.createdAt)}</td></tr></table></div>${overviewTable('Monat', r.rows, r.totals, 'Summe Zeitraum')}${charts}${legend(r.gastfahrtCountsAsWork)}</section>`
  return renderAndSharePdf({ html: doc(body), filenameBase: `Mehrmonatsreport_${r.employee.name.replace(/\s+/g, '-')}_${r.from}_${r.to}`, dialogTitle: 'Mehrmonatsreport' })
}
