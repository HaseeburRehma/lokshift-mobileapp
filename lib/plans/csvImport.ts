/**
 * CSV import for bulk plan creation. Pure parsing + validation +
 * resolve helpers. The host screen owns picker / preview UI and the
 * actual Supabase insert.
 *
 * Expected header row (case-insensitive; order-independent):
 *   employee_email   (required)  — used to resolve profiles.id
 *   date             (required)  — YYYY-MM-DD
 *   start            (required)  — HH:mm
 *   end              (required)  — HH:mm (overnight handled)
 *   customer_name    (optional)  — looked up case-insensitively
 *   location         (optional)
 *   route            (optional)
 *   notes            (optional)
 *   overnight        (optional)  — 1 / true / yes / ja → true
 *   hotel_address    (optional)
 *   gastfahrt        (optional)  — 1 / true / yes / ja → true
 *
 * Cells with embedded commas / newlines must be double-quoted ("…"),
 * and double-quotes inside a quoted cell are escaped by doubling ("").
 */

import { calculateShiftTimes } from '@/lib/time/shift-hours'

export interface ParsedCsv {
  header: string[]
  rows: string[][]
}

export interface RawCsvRow {
  index: number // 1-based row number in the file (excluding header)
  raw: Record<string, string>
}

export interface ResolvedCsvRow {
  index: number
  raw: Record<string, string>
  payload: {
    employee_id: string
    customer_id: string | null
    start_time: string
    end_time: string
    route: string | null
    location: string | null
    notes: string | null
    overnight_stay: boolean
    hotel_address: string | null
    is_gastfahrt: boolean
  }
}

export interface CsvImportReport {
  valid: ResolvedCsvRow[]
  errors: Array<{ index: number; raw: Record<string, string>; reason: string }>
  unknownEmails: string[]
  unknownCustomerNames: string[]
}

/** Parses a CSV string honoring "quoted, …" fields with embedded commas / quotes. */
export function parseCsv(text: string): ParsedCsv {
  const cells: string[][] = []
  let current: string[] = []
  let field = ''
  let i = 0
  let inQuotes = false

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      current.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      current.push(field)
      cells.push(current)
      current = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || current.length > 0) {
    current.push(field)
    cells.push(current)
  }
  // Drop trailing fully-empty rows (e.g. CSV ending with newline).
  while (cells.length > 0 && cells[cells.length - 1].every((c) => c.trim() === '')) {
    cells.pop()
  }
  if (cells.length === 0) return { header: [], rows: [] }
  const header = cells[0].map((h) => h.trim().toLowerCase())
  const rows = cells.slice(1)
  return { header, rows }
}

function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'ja' || s === 'y' || s === 'x'
}

function nonEmpty(v: string | undefined): string | null {
  if (!v) return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export function toRawRows(parsed: ParsedCsv): RawCsvRow[] {
  return parsed.rows.map((cells, i) => {
    const raw: Record<string, string> = {}
    parsed.header.forEach((key, col) => {
      raw[key] = (cells[col] ?? '').trim()
    })
    return { index: i + 2, raw } // +2 because i is 0-based and header is row 1
  })
}

/**
 * Resolve raw rows against employee + customer lookup tables and the
 * shift-hours engine. Returns a clean report the UI can render — invalid
 * rows are returned with a reason rather than silently dropped.
 */
export function validateRows(
  raws: RawCsvRow[],
  employeesByEmail: Map<string, string>, // lowercase email → profiles.id
  customersByName: Map<string, string>, // lowercase name → customers.id
): CsvImportReport {
  const valid: ResolvedCsvRow[] = []
  const errors: CsvImportReport['errors'] = []
  const unknownEmailsSet = new Set<string>()
  const unknownCustomersSet = new Set<string>()

  for (const { index, raw } of raws) {
    const email = (raw.employee_email ?? '').trim().toLowerCase()
    const date = (raw.date ?? '').trim()
    const start = (raw.start ?? '').trim()
    const end = (raw.end ?? '').trim()

    if (!email) {
      errors.push({ index, raw, reason: 'employee_email fehlt' })
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push({ index, raw, reason: 'Datum muss YYYY-MM-DD sein' })
      continue
    }
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      errors.push({ index, raw, reason: 'Zeiten müssen HH:mm sein' })
      continue
    }
    const employee_id = employeesByEmail.get(email)
    if (!employee_id) {
      unknownEmailsSet.add(email)
      errors.push({ index, raw, reason: `Unbekannte E-Mail: ${email}` })
      continue
    }
    let customer_id: string | null = null
    const custName = (raw.customer_name ?? '').trim()
    if (custName) {
      const found = customersByName.get(custName.toLowerCase())
      if (!found) {
        unknownCustomersSet.add(custName)
        errors.push({ index, raw, reason: `Unbekannter Kunde: ${custName}` })
        continue
      }
      customer_id = found
    }

    const shift = calculateShiftTimes(date, start, end, 0)
    if (shift.netHours <= 0) {
      errors.push({ index, raw, reason: 'Schicht hat 0 Stunden' })
      continue
    }

    const overnight = truthy(raw.overnight)
    if (overnight && !nonEmpty(raw.hotel_address)) {
      errors.push({ index, raw, reason: 'Übernachtung ohne hotel_address' })
      continue
    }

    valid.push({
      index,
      raw,
      payload: {
        employee_id,
        customer_id,
        start_time: shift.startISO,
        end_time: shift.endISO,
        route: nonEmpty(raw.route),
        location: nonEmpty(raw.location),
        notes: nonEmpty(raw.notes),
        overnight_stay: overnight,
        hotel_address: overnight ? nonEmpty(raw.hotel_address) : null,
        is_gastfahrt: truthy(raw.gastfahrt),
      },
    })
  }

  return {
    valid,
    errors,
    unknownEmails: [...unknownEmailsSet],
    unknownCustomerNames: [...unknownCustomersSet],
  }
}

/** Minimal sample CSV string for the in-app help hint. */
export const SAMPLE_CSV = [
  'employee_email,date,start,end,customer_name,location,route,notes,overnight,hotel_address,gastfahrt',
  'anna@example.com,2026-06-01,06:00,14:00,Rheinmaasrail,Köln,Köln–Aachen,,,,',
  'ben@example.com,2026-06-01,22:00,06:00,Rheinmaasrail,Köln,Köln–Berlin,Nachtschicht,1,Hotel Berliner Tor,',
  'carla@example.com,2026-06-02,08:00,16:30,,Köln,,,,,',
].join('\n')
