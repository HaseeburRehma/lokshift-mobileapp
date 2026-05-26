/**
 * Generic table-based PDF generators for the Reports screen.
 *
 * Mirrors the web `lib/pdf/exportPdf.ts` API surface — same function
 * names + arg shapes — but renders an HTML table and hands it to
 * expo-print instead of jsPDF (which assumes a browser DOM).
 *
 * Output is generated on-device and dropped into the native share sheet
 * via expo-sharing, matching the existing Stundenzettel flow.
 */

import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { format } from 'date-fns'
import type { OrgTimeAccount } from '@/hooks/useOrgTimeAccounts'
import type { PerDiem, HolidayBonus, Plan, TimeEntry } from '@/lib/types'

// ─── Internal: ISO week number ──────────────────────────────────────────────
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

function safeTime(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return format(new Date(value), 'HH:mm')
  } catch {
    return '-'
  }
}

// ─── Shared helpers ────────────────────────────────────────────────────────

function slugifyName(input: string): string {
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

export const slugify = slugifyName

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeDate(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return format(new Date(value), 'dd.MM.yyyy')
  } catch {
    return value
  }
}

const TABLE_STYLES = `
  <style>
    @page { margin: 18mm 14mm; }
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; }
    h1 { font-size: 22pt; color: #0f172a; margin: 0 0 6px 0; }
    .subtitle { font-size: 11pt; color: #475569; margin: 0 0 4px 0; }
    .meta { font-size: 9pt; color: #94a3b8; margin: 0 0 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th { background: #0064E0; color: #fff; font-weight: 700; padding: 6px 8px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    tfoot td { background: #f1f5f9; color: #0f172a; font-weight: 700; border-top: 2px solid #cbd5e1; }
    .num { text-align: right; }
    .empty { padding: 24px; text-align: center; color: #94a3b8; font-style: italic; }
  </style>
`

type Cell = string | number | null | undefined
export interface TableOptions {
  title: string
  subtitle?: string
  headers: string[]
  rows: Cell[][]
  totalsRow?: Cell[]
  numericColumns?: number[]
  locale?: 'de' | 'en'
  filename: string
  dialogTitle?: string
}

function renderTableHtml(opts: TableOptions): string {
  const { title, subtitle, headers, rows, totalsRow, numericColumns = [], locale = 'de' } = opts
  const numSet = new Set(numericColumns)
  const generatedLabel = locale === 'de' ? 'Erstellt am' : 'Generated'
  const entryLabel =
    locale === 'de'
      ? `${rows.length} Einträge`
      : `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`

  const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`

  const body =
    rows.length === 0
      ? `<tr><td colspan="${headers.length}" class="empty">${escapeHtml(
          locale === 'de' ? 'Keine Daten' : 'No data',
        )}</td></tr>`
      : rows
          .map(
            (r) =>
              `<tr>${r
                .map(
                  (c, i) =>
                    `<td${numSet.has(i) ? ' class="num"' : ''}>${escapeHtml(c)}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('')

  const foot = totalsRow
    ? `<tfoot><tr>${totalsRow
        .map(
          (c, i) =>
            `<td${numSet.has(i) ? ' class="num"' : ''}>${escapeHtml(c)}</td>`,
        )
        .join('')}</tr></tfoot>`
    : ''

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"/>${TABLE_STYLES}</head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
      <p class="meta">${generatedLabel}: ${format(new Date(), 'dd.MM.yyyy HH:mm')} · ${entryLabel}</p>
      <table>
        <thead>${head}</thead>
        <tbody>${body}</tbody>
        ${foot}
      </table>
    </body></html>`
}

async function ensureCanShare(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync()
  } catch {
    return false
  }
}

export async function exportTableToPdf(opts: TableOptions): Promise<string> {
  const html = renderTableHtml(opts)
  const { uri } = await Print.printToFileAsync({ html, base64: false })

  const stamp = format(new Date(), 'yyyy-MM-dd')
  const filename = `${opts.filename}_${stamp}.pdf`
  const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  const finalUri = targetDir ? `${targetDir}${filename}` : uri
  try {
    if (targetDir) {
      await (FileSystem as any).moveAsync({ from: uri, to: finalUri })
    }
  } catch {
    // Rename is best-effort. The temp uri still works.
  }

  if (await ensureCanShare()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: 'application/pdf',
      dialogTitle: opts.dialogTitle ?? opts.title,
      UTI: 'com.adobe.pdf',
    })
  }
  return finalUri
}

// ─── Report-specific wrappers ──────────────────────────────────────────────

export interface ReportExportOpts {
  title: string
  subtitle?: string
  filename: string
  locale?: 'de' | 'en'
}

/** Time Account Balances PDF — admin/dispatcher only. */
export function exportTimeAccountsPdf(
  accounts: OrgTimeAccount[],
  opts: ReportExportOpts,
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const headers =
    locale === 'de'
      ? ['Mitarbeiter', 'Soll-Stunden', 'Ist-Stunden', 'Saldo', 'Status']
      : ['Employee', 'Target', 'Actual', 'Balance', 'Status']

  const rows: Cell[][] = accounts.map((a) => [
    a.full_name,
    a.target_hours.toFixed(2),
    a.actual_hours.toFixed(2),
    a.balance.toFixed(2),
    a.balance >= 0
      ? locale === 'de'
        ? 'Positiv'
        : 'Positive'
      : locale === 'de'
        ? 'Defizit'
        : 'Deficit',
  ])

  const totalActual = accounts.reduce((s, a) => s + a.actual_hours, 0)
  const totalTarget = accounts.reduce((s, a) => s + a.target_hours, 0)
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  const totalsRow: Cell[] = [
    locale === 'de' ? 'Summe' : 'Total',
    totalTarget.toFixed(2),
    totalActual.toFixed(2),
    totalBalance.toFixed(2),
    '',
  ]

  return exportTableToPdf({
    ...opts,
    locale,
    headers,
    rows,
    totalsRow,
    numericColumns: [1, 2, 3],
    dialogTitle: opts.title,
  })
}

/** Per-Diem PDF — admin/dispatcher only. */
export function exportPerDiemPdf(
  perDiems: PerDiem[],
  opts: ReportExportOpts,
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const headers =
    locale === 'de'
      ? ['Datum', 'Mitarbeiter', 'Land', 'Tage', 'Satz €', 'Betrag €', 'Status']
      : ['Date', 'Employee', 'Country', 'Days', 'Rate €', 'Amount €', 'Status']

  const statusLabel = (status: PerDiem['status']): string => {
    if (locale !== 'de') return status
    switch (status) {
      case 'submitted':
        return 'Eingereicht'
      case 'approved':
        return 'Genehmigt'
      case 'rejected':
        return 'Abgelehnt'
      default:
        return status
    }
  }

  const rows: Cell[][] = perDiems.map((pd) => [
    safeDate(pd.date),
    pd.employee?.full_name ?? pd.employee_id,
    pd.country || '-',
    pd.num_days,
    pd.rate.toFixed(2),
    pd.amount.toFixed(2),
    statusLabel(pd.status),
  ])

  const totalAmount = perDiems.reduce((s, pd) => s + (Number(pd.amount) || 0), 0)
  const totalDays = perDiems.reduce((s, pd) => s + (Number(pd.num_days) || 0), 0)
  const totalsRow: Cell[] = [
    locale === 'de' ? 'Summe' : 'Total',
    '',
    '',
    totalDays,
    '',
    totalAmount.toFixed(2),
    '',
  ]

  return exportTableToPdf({
    ...opts,
    locale,
    headers,
    rows,
    totalsRow,
    numericColumns: [3, 4, 5],
    dialogTitle: opts.title,
  })
}

/** Plans list PDF — mirrors web `exportPlansPdf`. */
export function exportPlansPdf(
  plans: Plan[],
  opts: ReportExportOpts & { showEmployee?: boolean },
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const showEmployee = opts.showEmployee ?? true

  const headers =
    locale === 'de'
      ? [
          'Datum',
          ...(showEmployee ? ['Mitarbeiter'] : []),
          'Kunde',
          'Start',
          'Ende',
          'Std.',
          'KW',
          'Ort',
          'Status',
        ]
      : [
          'Date',
          ...(showEmployee ? ['Employee'] : []),
          'Customer',
          'Start',
          'End',
          'Hrs.',
          'CW',
          'Location',
          'Status',
        ]

  const statusLabel = (status: Plan['status']): string => {
    if (locale !== 'de') return status
    switch (status) {
      case 'draft':
        return 'Entwurf'
      case 'assigned':
        return 'Zugewiesen'
      case 'confirmed':
        return 'Bestätigt'
      case 'rejected':
        return 'Abgelehnt'
      case 'cancelled':
        return 'Storniert'
      default:
        return status
    }
  }

  const rows: Cell[][] = plans.map((p) => {
    let hours = 0
    try {
      hours = (new Date(p.end_time).getTime() - new Date(p.start_time).getTime()) / 3_600_000
    } catch {
      hours = 0
    }
    const row: Cell[] = [safeDate(p.start_time)]
    if (showEmployee) row.push(p.employee?.full_name ?? '-')
    row.push(
      p.customer?.name ?? '-',
      safeTime(p.start_time),
      safeTime(p.end_time),
      hours.toFixed(2),
      `KW ${isoWeek(new Date(p.start_time))}`,
      p.location ?? '-',
      statusLabel(p.status),
    )
    return row
  })

  const totalHours = plans.reduce((s, p) => {
    try {
      return (
        s + (new Date(p.end_time).getTime() - new Date(p.start_time).getTime()) / 3_600_000
      )
    } catch {
      return s
    }
  }, 0)
  const totalsRow: Cell[] = [locale === 'de' ? 'Summe' : 'Total']
  if (showEmployee) totalsRow.push('')
  totalsRow.push('', '', '', totalHours.toFixed(2), '', '', '')

  const numericColumns = showEmployee ? [5] : [4]

  return exportTableToPdf({
    ...opts,
    locale,
    headers,
    rows,
    totalsRow,
    numericColumns,
    dialogTitle: opts.title,
  })
}

/** Working-Time PDF — landscape table of time_entries (Phase 5 #4/#5/#6). */
export function exportWorkingTimePdf(
  entries: TimeEntry[],
  opts: ReportExportOpts & { showEmployee?: boolean },
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const showEmployee = opts.showEmployee ?? true

  const headers =
    locale === 'de'
      ? [
          'Datum',
          ...(showEmployee ? ['Mitarbeiter'] : []),
          'Start',
          'Ende',
          'Pause (min)',
          'Std.',
          'Kunde',
          'Übern.',
          'Spesen €',
          'Status',
        ]
      : [
          'Date',
          ...(showEmployee ? ['Employee'] : []),
          'Start',
          'End',
          'Break (min)',
          'Hrs.',
          'Customer',
          'Overn.',
          'Allow. €',
          'Status',
        ]

  const statusLabel = (entry: TimeEntry): string => {
    if (locale !== 'de') return entry.is_verified ? 'Approved' : 'Pending'
    return entry.is_verified ? 'Genehmigt' : 'Ausstehend'
  }

  const rows: Cell[][] = entries.map((e) => {
    const row: Cell[] = [safeDate(e.date)]
    if (showEmployee) row.push(e.employee?.full_name ?? '-')
    row.push(
      safeTime(e.start_time),
      safeTime(e.end_time),
      String(e.break_minutes ?? 0),
      Number(e.net_hours ?? 0).toFixed(2),
      e.customer?.name ?? '-',
      e.overnight_stay ? (locale === 'de' ? 'Ja' : 'Yes') : '-',
      Number(e.meal_allowance ?? 0).toFixed(2),
      statusLabel(e),
    )
    return row
  })

  const totalHours = entries.reduce((s, e) => s + (Number(e.net_hours) || 0), 0)
  const totalBreak = entries.reduce((s, e) => s + (Number(e.break_minutes) || 0), 0)
  const totalSpesen = entries.reduce((s, e) => s + (Number(e.meal_allowance) || 0), 0)
  const totalsRow: Cell[] = [locale === 'de' ? 'Summe' : 'Total']
  if (showEmployee) totalsRow.push('')
  totalsRow.push('', '', String(totalBreak), totalHours.toFixed(2), '', '', totalSpesen.toFixed(2), '')

  const breakCol = showEmployee ? 4 : 3
  const hoursCol = breakCol + 1
  const spesenCol = breakCol + 4

  return exportTableToPdf({
    ...opts,
    locale,
    headers,
    rows,
    totalsRow,
    numericColumns: [breakCol, hoursCol, spesenCol],
    dialogTitle: opts.title,
  })
}

/** Holiday-Bonus PDF — admin/dispatcher only. */
export function exportHolidayBonusPdf(
  bonuses: HolidayBonus[],
  opts: ReportExportOpts & { bonusTypeLabel?: (key: string) => string },
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const headers =
    locale === 'de'
      ? ['Auszahlungsdatum', 'Mitarbeiter', 'Art', 'Betrag €', 'Zeitraum von', 'Zeitraum bis', 'Notizen']
      : ['Paid on', 'Employee', 'Type', 'Amount €', 'Period start', 'Period end', 'Notes']

  const rows: Cell[][] = bonuses.map((b) => [
    safeDate(b.created_at),
    b.employee?.full_name ?? b.employee_id,
    opts.bonusTypeLabel ? opts.bonusTypeLabel(b.bonus_type) : b.bonus_type,
    (Number(b.amount) || 0).toFixed(2),
    b.period_start ? safeDate(b.period_start) : '-',
    b.period_end ? safeDate(b.period_end) : '-',
    b.notes ?? '-',
  ])

  const totalAmount = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0)
  const totalsRow: Cell[] = [
    locale === 'de' ? 'Summe' : 'Total',
    '',
    '',
    totalAmount.toFixed(2),
    '',
    '',
    '',
  ]

  return exportTableToPdf({
    ...opts,
    locale,
    headers,
    rows,
    totalsRow,
    numericColumns: [3],
    dialogTitle: opts.title,
  })
}
