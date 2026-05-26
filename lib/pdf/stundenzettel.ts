/**
 * Stundenzettel PDF — per-employee monthly timesheet.
 *
 * Mobile port of the webapp's lib/pdf/stundenzettel.ts. Instead of
 * jsPDF + jspdf-autotable (which work in RN but are heavy), we render
 * an HTML document with embedded CSS and hand it to expo-print's
 * native renderer. Output is bit-for-bit equivalent for the data;
 * layout matches the manual Excel template (column order, totals row,
 * summary block, signature lines).
 *
 * Columns (mirroring rows 3–34 of the client's Excel):
 *   Datum | Wochentag | Start | Ende | Stunden | Spesen € |
 *   Übernachtung | 25% | 40% | Sonntag | Feiertag | Gastfahrt
 *
 * Summary block (B36:C49 in the template), labels preserved verbatim
 * ("Speßen", "STUNDELOHN") so the printed sheet reads identically to
 * what the client hand-fills today.
 */

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { format } from 'date-fns'

import { calculateShiftTimes } from '@/lib/time/shift-hours'
import {
  calculateZuschlag,
  sumZuschlag,
  type ZuschlagBreakdown,
} from '@/lib/time/zuschlag'

export interface StundenzettelEntry {
  date: string
  start_time: string | null
  end_time: string | null
  break_minutes: number | null
  net_hours?: number | null
  overnight_stay?: boolean | null
  meal_allowance?: number | null
  is_gastfahrt?: boolean | null
  notes?: string | null
}

export interface StundenzettelOptions {
  employeeName: string
  /** "YYYY-MM" */
  monthKey: string
  entries: StundenzettelEntry[]
  targetHours?: number
  hourlyRate?: number
  remarks?: string
  filenameBase?: string
}

const WEEKDAY_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
]

const MONTH_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

function fmtHHMM(iso?: string | null): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'HH:mm')
  } catch {
    return ''
  }
}

function fmtDate(date: string): string {
  try {
    return format(new Date(`${date}T00:00:00`), 'dd.MM.yyyy')
  } catch {
    return date
  }
}

function weekdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00`).getDay()
  return WEEKDAY_DE[d] ?? ''
}

function monthHeader(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return `${MONTH_DE[m - 1]} ${y}`
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface EnrichedRow {
  entry: StundenzettelEntry
  start: string
  end: string
  hours: number
  isOvernight: boolean
  zuschlag: ZuschlagBreakdown
}

function enrich(entries: StundenzettelEntry[]): EnrichedRow[] {
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const start = fmtHHMM(e.start_time)
      const end = fmtHHMM(e.end_time)
      const shift = calculateShiftTimes(e.date, start, end, e.break_minutes ?? 0)
      const zuschlag = calculateZuschlag(
        e.date,
        start,
        end,
        e.break_minutes ?? 0,
        !!e.is_gastfahrt,
      )
      return {
        entry: e,
        start,
        end,
        hours: e.net_hours ?? shift.netHours,
        isOvernight: shift.isOvernight,
        zuschlag,
      }
    })
}

/**
 * Produce the HTML for a single employee's Stundenzettel. Used as a
 * section in the multi-employee report; the standalone PDF wraps this
 * in a full HTML document via `renderDocument`.
 */
export function renderStundenzettelSection(opts: StundenzettelOptions): string {
  const enriched = enrich(opts.entries)
  const totals: ZuschlagBreakdown = sumZuschlag(enriched.map((r) => r.zuschlag))
  const totalHours = enriched.reduce((s, r) => s + (r.hours || 0), 0)
  const workingDays = enriched.filter((r) => (r.hours || 0) > 0).length
  const overnightCount = enriched.filter((r) => !!r.entry.overnight_stay).length
  const noOvernightWorkingDays = Math.max(0, workingDays - overnightCount)
  const totalSpesen = enriched.reduce(
    (s, r) => s + (r.entry.meal_allowance ?? 0),
    0,
  )
  const sollHours = opts.targetHours ?? 0

  const dataRows = enriched
    .map((r) => {
      const overnight = r.entry.overnight_stay
        ? `<td class="cell-ja">ja</td>`
        : `<td>nein</td>`
      const endCell = r.end ? (r.isOvernight ? `${r.end} (+1)` : r.end) : ''
      const fmtNum = (n: number) => (n > 0 ? n.toFixed(2) : '')
      return `
        <tr>
          <td class="left">${escapeHtml(fmtDate(r.entry.date))}</td>
          <td class="left">${escapeHtml(weekdayOf(r.entry.date))}</td>
          <td>${escapeHtml(r.start)}</td>
          <td>${escapeHtml(endCell)}</td>
          <td>${r.hours > 0 ? r.hours.toFixed(2) : ''}</td>
          <td>${(r.entry.meal_allowance ?? 0).toFixed(2)}</td>
          ${overnight}
          <td>${fmtNum(r.zuschlag.night25)}</td>
          <td>${fmtNum(r.zuschlag.night40)}</td>
          <td>${fmtNum(r.zuschlag.sunday)}</td>
          <td>${fmtNum(r.zuschlag.holiday)}</td>
          <td>${fmtNum(r.zuschlag.gastfahrt)}</td>
        </tr>`
    })
    .join('')

  const totalsRow = `
    <tr class="totals">
      <td class="left">Σ</td>
      <td></td>
      <td></td>
      <td></td>
      <td>${totalHours.toFixed(2)}</td>
      <td>${totalSpesen.toFixed(2)}</td>
      <td>${overnightCount}x ja &nbsp; ${noOvernightWorkingDays}x nein</td>
      <td>${totals.night25.toFixed(2)}</td>
      <td>${totals.night40.toFixed(2)}</td>
      <td>${totals.sunday.toFixed(2)}</td>
      <td>${totals.holiday.toFixed(2)}</td>
      <td>${totals.gastfahrt.toFixed(2)}</td>
    </tr>`

  const summaryRows: Array<[string, string]> = [
    ['Arbeitstage :', String(workingDays)],
    ['Gesamtstunden :', totalHours.toFixed(2)],
    ['25% Nachtarbeit :', totals.night25.toFixed(2)],
    ['40% Nachtarbeit :', totals.night40.toFixed(2)],
    ['Sonntag :', totals.sunday.toFixed(2)],
    ['Feiertag :', totals.holiday.toFixed(2)],
    ['Gastfahrt :', totals.gastfahrt.toFixed(2)],
    ['Besonderheit:', opts.remarks ?? ''],
    ['Soll:', sollHours ? `${sollHours} H` : ''],
    ['Ist:', totalHours.toFixed(2)],
    ['14 Speßen', String(noOvernightWorkingDays)],
    ['28 Speßen', String(overnightCount)],
    ['STUNDELOHN', opts.hourlyRate ? opts.hourlyRate.toFixed(2) : ''],
  ]

  const summaryHtml = summaryRows
    .map(
      ([label, value]) => `
      <div class="summary-row">
        <div class="summary-label">${escapeHtml(label)}</div>
        <div class="summary-value">${escapeHtml(value)}</div>
      </div>`,
    )
    .join('')

  return `
    <section class="sheet">
      <header class="sheet-header">
        <h1>Stundenzettel</h1>
        <div class="meta-row">
          <div><strong>Mitarbeiter:</strong> ${escapeHtml(opts.employeeName)}</div>
          <div><strong>Monat:</strong> ${escapeHtml(monthHeader(opts.monthKey))}</div>
        </div>
        <div class="generated">Erstellt am ${format(new Date(), 'dd.MM.yyyy HH:mm')}</div>
      </header>

      <table class="entries">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Wochentag</th>
            <th>Start</th>
            <th>Ende</th>
            <th>Stunden</th>
            <th>Spesen (€)</th>
            <th>Übernachtung</th>
            <th>25% Zuschlag</th>
            <th>40% Zuschlag</th>
            <th>Sonntag</th>
            <th>Feiertag</th>
            <th>Gastfahrt</th>
          </tr>
        </thead>
        <tbody>
          ${dataRows || `<tr><td class="empty" colspan="12">Keine Einträge</td></tr>`}
        </tbody>
        <tfoot>
          ${totalsRow}
        </tfoot>
      </table>

      <div class="summary">
        ${summaryHtml}
      </div>

      <div class="signatures">
        <div class="sig">
          <div class="line"></div>
          <div class="label">Unterschrift Mitarbeiter</div>
        </div>
        <div class="sig">
          <div class="line"></div>
          <div class="label">Unterschrift Disposition</div>
        </div>
      </div>
    </section>
  `
}

const STYLES = `
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1E293B;
      font-size: 9pt;
      margin: 0;
      padding: 0;
    }
    .sheet { page-break-after: always; }
    .sheet:last-of-type { page-break-after: auto; }

    .sheet-header h1 {
      margin: 0 0 4px 0;
      color: #0F172A;
      font-size: 18pt;
    }
    .meta-row {
      display: flex;
      gap: 40px;
      color: #475569;
      font-size: 10pt;
      margin-bottom: 2px;
    }
    .generated { color: #94A3B8; font-size: 7pt; margin-bottom: 10px; }

    table.entries {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    table.entries th, table.entries td {
      border: 0.5pt solid #E2E8F0;
      padding: 4px 5px;
      text-align: center;
      font-size: 8pt;
    }
    table.entries thead th {
      background: #0064E0;
      color: #fff;
      font-weight: 700;
      font-size: 8.5pt;
    }
    table.entries td.left { text-align: left; }
    table.entries tbody tr:nth-child(even) { background: #F8FAFC; }
    table.entries td.cell-ja {
      background: #DCFCE7;
      color: #15803D;
      font-weight: 700;
    }
    table.entries tfoot td {
      background: #F1F5F9;
      color: #0F172A;
      font-weight: 700;
    }
    table.entries td.empty {
      text-align: center;
      color: #94A3B8;
      padding: 20px;
    }

    .summary {
      margin-top: 14px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 24px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      border-bottom: 0.25pt dotted #CBD5E1;
    }
    .summary-label { color: #475569; font-weight: 700; }
    .summary-value { color: #0F172A; font-weight: 700; }

    .signatures {
      margin-top: 28px;
      display: flex;
      justify-content: space-between;
      gap: 40px;
    }
    .sig { flex: 1; }
    .sig .line {
      border-top: 0.75pt solid #475569;
      margin-bottom: 4px;
    }
    .sig .label { font-size: 7pt; color: #475569; }
  </style>
`

function renderDocument(sections: string[]): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>${STYLES}</head><body>${sections.join('')}</body></html>`
}

async function ensureCanShare(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync()
  } catch {
    return false
  }
}

/**
 * Render → save → share a per-employee Stundenzettel PDF.
 * Returns the final file URI.
 */
export async function exportStundenzettelPdf(
  opts: StundenzettelOptions,
): Promise<string> {
  const html = renderDocument([renderStundenzettelSection(opts)])
  const { uri } = await Print.printToFileAsync({ html, base64: false })

  // Rename to a human-friendly filename. The default uri is an
  // unhelpful guid-based temp name; the client wants something they can
  // read in a Mail attachment list.
  const stamp = format(new Date(), 'yyyy-MM-dd')
  const base =
    opts.filenameBase ?? `Stundenzettel_${slugify(opts.employeeName)}_${opts.monthKey}`
  const filename = `${base}_${stamp}.pdf`
  const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  const finalUri = targetDir ? `${targetDir}${filename}` : uri
  try {
    if (targetDir) {
      await (FileSystem as any).moveAsync({ from: uri, to: finalUri })
    }
  } catch {
    // If rename fails fall back to the temp uri — the share sheet still works.
  }

  if (await ensureCanShare()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Stundenzettel',
      UTI: 'com.adobe.pdf',
    })
  }
  return finalUri
}

/**
 * Render → save → share a multi-employee report. One PDF with a sheet
 * per employee separated by page breaks. Used by the dispatcher
 * "Arbeitszeitbericht" flow.
 */
export async function exportMultiEmployeeReportPdf(
  sections: StundenzettelOptions[],
  filenameBase?: string,
): Promise<string> {
  const html = renderDocument(sections.map((s) => renderStundenzettelSection(s)))
  const { uri } = await Print.printToFileAsync({ html, base64: false })

  const stamp = format(new Date(), 'yyyy-MM-dd')
  const base = filenameBase ?? `Arbeitszeitbericht_${stamp}`
  const filename = `${base}.pdf`
  const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  const finalUri = targetDir ? `${targetDir}${filename}` : uri
  try {
    if (targetDir) {
      await (FileSystem as any).moveAsync({ from: uri, to: finalUri })
    }
  } catch {}

  if (await ensureCanShare()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Arbeitszeitbericht',
      UTI: 'com.adobe.pdf',
    })
  }
  return finalUri
}
