/**
 * Excel export for time entries — generates an .xlsx file with the
 * same column set as the Stundenzettel PDF (Datum, Wochentag, Start,
 * Ende, Stunden, Spesen €, Übernachtung, 25%, 40%, Sonntag, Feiertag,
 * Gastfahrt), plus an optional per-employee header sheet.
 *
 * Uses SheetJS (xlsx) which is pure JS and works in React Native via
 * the buffer-based write API. The result is written to the cache dir
 * via expo-file-system and handed to the system share sheet.
 */

import * as XLSX from 'xlsx'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { format } from 'date-fns'

import { calculateShiftTimes } from '@/lib/time/shift-hours'
import { calculateZuschlag, sumZuschlag, type ZuschlagBreakdown } from '@/lib/time/zuschlag'
import type { StundenzettelEntry } from '@/lib/pdf/stundenzettel'

const WEEKDAY_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTH_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

export interface ExcelExportSection {
  employeeName: string
  monthKey: string // "YYYY-MM"
  entries: StundenzettelEntry[]
  targetHours?: number
  hourlyRate?: number
}

interface EnrichedRow {
  entry: StundenzettelEntry
  start: string
  end: string
  hours: number
  isOvernight: boolean
  zuschlag: ZuschlagBreakdown
}

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

function monthHeader(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return `${MONTH_DE[m - 1]} ${y}`
}

function buildSheet(section: ExcelExportSection): XLSX.WorkSheet {
  const enriched = enrich(section.entries)
  const totals = sumZuschlag(enriched.map((r) => r.zuschlag))
  const totalHours = enriched.reduce((s, r) => s + (r.hours || 0), 0)
  const totalSpesen = enriched.reduce((s, r) => s + (r.entry.meal_allowance ?? 0), 0)
  const workingDays = enriched.filter((r) => (r.hours || 0) > 0).length
  const overnightCount = enriched.filter((r) => !!r.entry.overnight_stay).length

  // Two title rows + a blank gap + header + data + totals + summary block.
  const aoa: (string | number)[][] = []
  aoa.push(['Stundenzettel', section.employeeName])
  aoa.push(['Monat', monthHeader(section.monthKey)])
  aoa.push([])
  aoa.push([
    'Datum',
    'Wochentag',
    'Start',
    'Ende',
    'Stunden',
    'Spesen (€)',
    'Übernachtung',
    '25% Zuschlag',
    '40% Zuschlag',
    'Sonntag',
    'Feiertag',
    'Gastfahrt',
  ])

  for (const r of enriched) {
    aoa.push([
      fmtDate(r.entry.date),
      weekdayOf(r.entry.date),
      r.start || '',
      r.end ? (r.isOvernight ? `${r.end} (+1)` : r.end) : '',
      r.hours > 0 ? Number(r.hours.toFixed(2)) : '',
      Number((r.entry.meal_allowance ?? 0).toFixed(2)),
      r.entry.overnight_stay ? 'ja' : 'nein',
      r.zuschlag.night25 > 0 ? Number(r.zuschlag.night25.toFixed(2)) : '',
      r.zuschlag.night40 > 0 ? Number(r.zuschlag.night40.toFixed(2)) : '',
      r.zuschlag.sunday > 0 ? Number(r.zuschlag.sunday.toFixed(2)) : '',
      r.zuschlag.holiday > 0 ? Number(r.zuschlag.holiday.toFixed(2)) : '',
      r.zuschlag.gastfahrt > 0 ? Number(r.zuschlag.gastfahrt.toFixed(2)) : '',
    ])
  }

  // Totals row
  aoa.push([
    'Σ',
    '',
    '',
    '',
    Number(totalHours.toFixed(2)),
    Number(totalSpesen.toFixed(2)),
    `${overnightCount}x ja  ${Math.max(0, workingDays - overnightCount)}x nein`,
    Number(totals.night25.toFixed(2)),
    Number(totals.night40.toFixed(2)),
    Number(totals.sunday.toFixed(2)),
    Number(totals.holiday.toFixed(2)),
    Number(totals.gastfahrt.toFixed(2)),
  ])

  // Spacer + summary block mirrors the PDF
  aoa.push([])
  aoa.push(['Arbeitstage', workingDays])
  aoa.push(['Gesamtstunden', Number(totalHours.toFixed(2))])
  aoa.push(['25% Nachtarbeit', Number(totals.night25.toFixed(2))])
  aoa.push(['40% Nachtarbeit', Number(totals.night40.toFixed(2))])
  aoa.push(['Sonntag', Number(totals.sunday.toFixed(2))])
  aoa.push(['Feiertag', Number(totals.holiday.toFixed(2))])
  aoa.push(['Gastfahrt', Number(totals.gastfahrt.toFixed(2))])
  aoa.push(['14 Speßen', Math.max(0, workingDays - overnightCount)])
  aoa.push(['28 Speßen', overnightCount])
  aoa.push(['Soll-Stunden', section.targetHours ?? ''])
  aoa.push(['Ist-Stunden', Number(totalHours.toFixed(2))])
  aoa.push(['Stundenlohn', section.hourlyRate ?? ''])

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // Datum
    { wch: 11 }, // Wochentag
    { wch: 8 }, // Start
    { wch: 10 }, // Ende
    { wch: 8 }, // Stunden
    { wch: 10 }, // Spesen
    { wch: 18 }, // Übernachtung
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
  ]
  return ws
}

function sanitizeSheetName(raw: string): string {
  // Excel limits: 31 chars, no : \ / ? * [ ]
  return raw
    .replace(/[:\\/?*\[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet'
}

async function shareWorkbook(wb: XLSX.WorkBook, filename: string): Promise<string> {
  // SheetJS produces a base64 string we can write directly with
  // FileSystem.writeAsStringAsync in 'base64' encoding.
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
  const targetDir =
    (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  if (!targetDir) throw new Error('No writable directory available')
  const uri = `${targetDir}${filename}`
  await (FileSystem as any).writeAsStringAsync(uri, b64, {
    encoding: (FileSystem as any).EncodingType?.Base64 ?? 'base64',
  })
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Stundenzettel',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    })
  }
  return uri
}

export async function exportSingleStundenzettelXlsx(
  section: ExcelExportSection,
): Promise<string> {
  const wb = XLSX.utils.book_new()
  const ws = buildSheet(section)
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(section.employeeName))
  const stamp = format(new Date(), 'yyyy-MM-dd')
  const filename = `Stundenzettel_${slugify(section.employeeName)}_${section.monthKey}_${stamp}.xlsx`
  return shareWorkbook(wb, filename)
}

export async function exportMultiStundenzettelXlsx(
  sections: ExcelExportSection[],
  filenameBase?: string,
): Promise<string> {
  const wb = XLSX.utils.book_new()
  const usedNames = new Set<string>()
  for (const s of sections) {
    const ws = buildSheet(s)
    let name = sanitizeSheetName(s.employeeName)
    let suffix = 1
    while (usedNames.has(name)) {
      const tail = ` (${++suffix})`
      name = sanitizeSheetName(s.employeeName).slice(0, 31 - tail.length) + tail
    }
    usedNames.add(name)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  const stamp = format(new Date(), 'yyyy-MM-dd')
  const filename = `${filenameBase ?? `Arbeitszeitbericht_${stamp}`}.xlsx`
  return shareWorkbook(wb, filename)
}
