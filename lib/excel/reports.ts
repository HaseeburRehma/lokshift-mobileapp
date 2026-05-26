/**
 * Generic Excel exporters for the Reports screen. Same column layout as
 * the matching PDF in `@/lib/pdf/reports` — keep the two in sync.
 */

import * as XLSX from 'xlsx'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { format } from 'date-fns'
import type { OrgTimeAccount } from '@/hooks/useOrgTimeAccounts'
import type { PerDiem, HolidayBonus, Plan } from '@/lib/types'

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

function safeDate(value: string | null | undefined): string {
  if (!value) return '-'
  try {
    return format(new Date(value), 'dd.MM.yyyy')
  } catch {
    return value
  }
}

function sanitizeSheetName(raw: string): string {
  return raw.replace(/[:\\/?*\[\]]/g, ' ').trim().slice(0, 31) || 'Sheet'
}

async function shareWorkbook(wb: XLSX.WorkBook, filename: string, dialogTitle: string): Promise<string> {
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
  const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  if (!targetDir) throw new Error('No writable directory available')
  const uri = `${targetDir}${filename}`
  await (FileSystem as any).writeAsStringAsync(uri, b64, {
    encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64',
  })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    })
  }
  return uri
}

export interface ReportExportOpts {
  sheetName: string
  filename: string
  locale?: 'de' | 'en'
}

export async function exportTimeAccountsXlsx(
  accounts: OrgTimeAccount[],
  opts: ReportExportOpts,
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const aoa: (string | number)[][] = []
  aoa.push(
    locale === 'de'
      ? ['Mitarbeiter', 'Soll-Stunden', 'Ist-Stunden', 'Saldo', 'Status']
      : ['Employee', 'Target', 'Actual', 'Balance', 'Status'],
  )
  for (const a of accounts) {
    aoa.push([
      a.full_name,
      Number(a.target_hours.toFixed(2)),
      Number(a.actual_hours.toFixed(2)),
      Number(a.balance.toFixed(2)),
      a.balance >= 0
        ? locale === 'de'
          ? 'Positiv'
          : 'Positive'
        : locale === 'de'
          ? 'Defizit'
          : 'Deficit',
    ])
  }
  // Totals row
  const totalActual = accounts.reduce((s, a) => s + a.actual_hours, 0)
  const totalTarget = accounts.reduce((s, a) => s + a.target_hours, 0)
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)
  aoa.push([
    locale === 'de' ? 'Summe' : 'Total',
    Number(totalTarget.toFixed(2)),
    Number(totalActual.toFixed(2)),
    Number(totalBalance.toFixed(2)),
    '',
  ])
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.sheetName))
  const stamp = format(new Date(), 'yyyy-MM-dd')
  return shareWorkbook(wb, `${opts.filename}_${stamp}.xlsx`, opts.sheetName)
}

export async function exportPerDiemXlsx(
  perDiems: PerDiem[],
  opts: ReportExportOpts,
): Promise<string> {
  const locale = opts.locale ?? 'de'
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
  const aoa: (string | number)[][] = []
  aoa.push(
    locale === 'de'
      ? ['Datum', 'Mitarbeiter', 'Land', 'Tage', 'Satz €', 'Betrag €', 'Status']
      : ['Date', 'Employee', 'Country', 'Days', 'Rate €', 'Amount €', 'Status'],
  )
  for (const pd of perDiems) {
    aoa.push([
      safeDate(pd.date),
      pd.employee?.full_name ?? pd.employee_id,
      pd.country || '-',
      pd.num_days,
      Number(pd.rate.toFixed(2)),
      Number(pd.amount.toFixed(2)),
      statusLabel(pd.status),
    ])
  }
  // Totals row
  const totalAmount = perDiems.reduce((s, pd) => s + (Number(pd.amount) || 0), 0)
  const totalDays = perDiems.reduce((s, pd) => s + (Number(pd.num_days) || 0), 0)
  aoa.push([
    locale === 'de' ? 'Summe' : 'Total',
    '',
    '',
    totalDays,
    '',
    Number(totalAmount.toFixed(2)),
    '',
  ])
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 12 },
    { wch: 26 },
    { wch: 14 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.sheetName))
  const stamp = format(new Date(), 'yyyy-MM-dd')
  return shareWorkbook(wb, `${opts.filename}_${stamp}.xlsx`, opts.sheetName)
}

export async function exportPlansXlsx(
  plans: Plan[],
  opts: ReportExportOpts & { showEmployee?: boolean },
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const showEmployee = opts.showEmployee ?? true

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

  const aoa: (string | number)[][] = []
  aoa.push(
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
        ],
  )
  for (const p of plans) {
    let hours = 0
    try {
      hours = (new Date(p.end_time).getTime() - new Date(p.start_time).getTime()) / 3_600_000
    } catch {
      hours = 0
    }
    const row: (string | number)[] = [safeDate(p.start_time)]
    if (showEmployee) row.push(p.employee?.full_name ?? '-')
    row.push(
      p.customer?.name ?? '-',
      safeTime(p.start_time),
      safeTime(p.end_time),
      Number(hours.toFixed(2)),
      `KW ${isoWeek(new Date(p.start_time))}`,
      p.location ?? '-',
      statusLabel(p.status),
    )
    aoa.push(row)
  }
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = showEmployee
    ? [
        { wch: 12 },
        { wch: 24 },
        { wch: 22 },
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 7 },
        { wch: 22 },
        { wch: 12 },
      ]
    : [
        { wch: 12 },
        { wch: 22 },
        { wch: 8 },
        { wch: 8 },
        { wch: 8 },
        { wch: 7 },
        { wch: 22 },
        { wch: 12 },
      ]
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.sheetName))
  const stamp = format(new Date(), 'yyyy-MM-dd')
  return shareWorkbook(wb, `${opts.filename}_${stamp}.xlsx`, opts.sheetName)
}

export async function exportHolidayBonusXlsx(
  bonuses: HolidayBonus[],
  opts: ReportExportOpts & { bonusTypeLabel?: (key: string) => string },
): Promise<string> {
  const locale = opts.locale ?? 'de'
  const aoa: (string | number)[][] = []
  aoa.push(
    locale === 'de'
      ? ['Auszahlungsdatum', 'Mitarbeiter', 'Art', 'Betrag €', 'Zeitraum von', 'Zeitraum bis', 'Notizen']
      : ['Paid on', 'Employee', 'Type', 'Amount €', 'Period start', 'Period end', 'Notes'],
  )
  for (const b of bonuses) {
    aoa.push([
      safeDate(b.created_at),
      b.employee?.full_name ?? b.employee_id,
      opts.bonusTypeLabel ? opts.bonusTypeLabel(b.bonus_type) : b.bonus_type,
      Number((Number(b.amount) || 0).toFixed(2)),
      b.period_start ? safeDate(b.period_start) : '-',
      b.period_end ? safeDate(b.period_end) : '-',
      b.notes ?? '-',
    ])
  }
  // Totals row
  const totalAmount = bonuses.reduce((s, b) => s + (Number(b.amount) || 0), 0)
  aoa.push([
    locale === 'de' ? 'Summe' : 'Total',
    '',
    '',
    Number(totalAmount.toFixed(2)),
    '',
    '',
    '',
  ])
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 14 },
    { wch: 26 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 28 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(opts.sheetName))
  const stamp = format(new Date(), 'yyyy-MM-dd')
  return shareWorkbook(wb, `${opts.filename}_${stamp}.xlsx`, opts.sheetName)
}
