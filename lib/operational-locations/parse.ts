/**
 * Betriebsstellen import + search (Kundenfeedback Punkt 12) — identical
 * copy in the webapp and the mobile app. Pure functions, no I/O.
 *
 * Import accepts text extracted from the client's PDF (one location per
 * line, typically "<Kürzel>  <Name>  <Art>"), CSV/Excel rows or pasted
 * text. Every row is shown in a preview where it can be corrected before
 * anything is saved.
 */

export type LocationType = 'depot' | 'station' | 'yard' | 'workshop' | 'office' | 'other'

export interface LocationLike {
  id?: string
  name: string
  short_code: string | null
  type?: LocationType | string
  is_active?: boolean
}

export interface ParsedLocation {
  key: string
  code: string
  name: string
  typeText: string
  type: LocationType
  /** Source line (for the preview). */
  raw: string
}

export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normCode(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Search by full name, part of the name, or code / abbreviation. */
export function searchLocations<T extends LocationLike>(locations: T[], query: string, limit = 50): T[] {
  const q = normalize(query)
  const qc = normCode(query)
  if (!q) return locations.slice(0, limit)
  const scored: { loc: T; score: number }[] = []
  for (const loc of locations) {
    const code = normCode(loc.short_code)
    const codeCompact = code.replace(/\s/g, '')
    const name = normalize(loc.name)
    let score = -1
    if (code && (code === qc || codeCompact === qc.replace(/\s/g, ''))) score = 100
    else if (code && code.startsWith(qc)) score = 80
    else if (name === q) score = 70
    else if (name.startsWith(q)) score = 60
    else if (name.split(' ').some((w) => w.startsWith(q))) score = 50
    else if (name.includes(q)) score = 40
    else if (q.split(' ').every((part) => name.includes(part))) score = 30
    if (score >= 0) scored.push({ loc, score })
  }
  return scored
    .sort((a, b) => b.score - a.score || a.loc.name.localeCompare(b.loc.name, 'de'))
    .slice(0, limit)
    .map((s) => s.loc)
}

export function mapLocationType(typeText: string, name = ''): LocationType {
  const t = normalize(`${typeText} ${name}`)
  if (/\b(bw|betriebswerk|werk|werkstatt|instandhaltung)\b/.test(t)) return 'workshop'
  if (/\b(gbf|rbf|gueterbahnhof|rangierbahnhof|abstellanlage|abst|anst|anschlussstelle|awanst)\b/.test(t)) return 'yard'
  if (/\b(depot)\b/.test(t)) return 'depot'
  if (/\b(buero|verwaltung|office)\b/.test(t)) return 'office'
  if (/\b(bf|hbf|bahnhof|hp|haltepunkt|hst|haltestelle|pbf)\b/.test(t)) return 'station'
  return 'other'
}

const TYPE_WORDS = new Set([
  'bf', 'hp', 'hst', 'abzw', 'bk', 'ust', 'uest', 'awanst', 'anst', 'gbf', 'rbf', 'bw', 'pbf', 'lgr', 'ldst', 'bft', 'bush',
])

/** "AH  S", "KKAN", "FF" — Ril-100/DS-100 style codes. */
const CODE_RE = /^([A-ZÄÖÜ]{1,5}(?:\s{1,2}[A-Z0-9]{1,3})?)$/

function splitColumns(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim()).filter(Boolean)
  return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean)
}

function detectDelimiter(header: string): string | null {
  for (const d of [';', '\t', ',', '|']) if (header.split(d).length >= 2) return d
  return null
}

function parseCsv(lines: string[]): ParsedLocation[] | null {
  const header = lines[0]
  const delim = detectDelimiter(header)
  if (!delim) return null
  const cols = header.split(delim).map((c) => normalize(c))
  const find = (...names: string[]) => cols.findIndex((c) => names.some((n) => c === n || c.includes(n)))
  const iName = find('name', 'bezeichnung', 'betriebsstelle', 'langname')
  const iCode = find('kuerzel', 'kurz', 'abk', 'code', 'ril', 'ds100', 'ds 100')
  const iType = find('art', 'typ', 'type', 'kategorie')
  if (iName < 0) return null
  const out: ParsedLocation[] = []
  lines.slice(1).forEach((line, idx) => {
    const cells = line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim())
    const name = cells[iName] ?? ''
    if (!name) return
    const code = iCode >= 0 ? normCode(cells[iCode]) : ''
    const typeText = iType >= 0 ? cells[iType] ?? '' : ''
    out.push({ key: `csv-${idx}`, code, name, typeText, type: mapLocationType(typeText, name), raw: line })
  })
  return out
}

function parseLine(line: string, idx: number): ParsedLocation | null {
  const raw = line
  const trimmed = line.trim()
  if (trimmed.length < 2) return null
  // Page furniture from PDFs
  if (/^(seite|page)\s*\d+/i.test(trimmed) || /^\d+\s*(\/|von)\s*\d+$/i.test(trimmed)) return null

  // "Name (CODE)"
  const paren = trimmed.match(/^(.+?)\s*\(([A-ZÄÖÜ]{1,5}(?:\s[A-Z0-9]{1,3})?)\)\s*(.*)$/)
  if (paren) {
    return { key: `l-${idx}`, code: normCode(paren[2]), name: paren[1].trim(), typeText: paren[3].trim(), type: mapLocationType(paren[3], paren[1]), raw }
  }

  const cols = splitColumns(trimmed)
  if (cols.length >= 2) {
    let code = ''
    let rest = cols
    if (CODE_RE.test(cols[0])) {
      code = normCode(cols[0])
      rest = cols.slice(1)
      // "AA  G" — the code suffix lands in its own column.
      if (rest.length >= 2 && /^[A-Z0-9]{1,3}$/.test(rest[0]) && !/[a-zäöüß]/.test(rest[0])) {
        code = `${code} ${rest[0]}`
        rest = rest.slice(1)
      }
    } else if (CODE_RE.test(cols[cols.length - 1]) && cols.length >= 2) {
      code = normCode(cols[cols.length - 1])
      rest = cols.slice(0, -1)
    }
    let typeText = ''
    if (rest.length >= 2 && TYPE_WORDS.has(normalize(rest[rest.length - 1]))) {
      typeText = rest[rest.length - 1]
      rest = rest.slice(0, -1)
    }
    const name = rest.join(' ').trim()
    if (name && /[a-zäöüß]/i.test(name)) {
      return { key: `l-${idx}`, code, name, typeText, type: mapLocationType(typeText, name), raw }
    }
  }

  // Single spaces only: "KKAN Köln-Kalk Nord Bf"
  const single = trimmed.match(/^([A-ZÄÖÜ]{2,5})\s+(.+)$/)
  if (single && /[a-zäöüß]/.test(single[2])) {
    const words = single[2].split(/\s+/)
    let typeText = ''
    if (words.length > 1 && TYPE_WORDS.has(normalize(words[words.length - 1]))) typeText = words.pop() as string
    const name = words.join(' ')
    return { key: `l-${idx}`, code: normCode(single[1]), name, typeText, type: mapLocationType(typeText, name), raw }
  }

  // Name only
  if (/[a-zäöüß]{3,}/i.test(trimmed) && trimmed.length <= 80) {
    return { key: `l-${idx}`, code: '', name: trimmed, typeText: '', type: mapLocationType('', trimmed), raw }
  }
  return null
}

const HEADER_RE = /^(ril\s*100|ds\s*100|k(ue|ü)rzel|abk(uerzung|ürzung)?|betriebsstellen?(verzeichnis)?|bezeichnung|name)\b/i

export function parseLocationText(text: string): ParsedLocation[] {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trimEnd())
    .filter((l) => l.trim().length > 0)
  if (lines.length === 0) return []

  const csv = parseCsv(lines)
  if (csv && csv.length) return csv

  const out: ParsedLocation[] = []
  lines.forEach((line, idx) => {
    if (idx < 5 && HEADER_RE.test(line.trim())) return
    const row = parseLine(line, idx)
    if (row) out.push(row)
  })
  return out
}

export type RowCheck =
  | { kind: 'new' }
  | { kind: 'duplicate_existing'; existing: LocationLike; by: 'code' | 'name' }
  | { kind: 'duplicate_in_file'; firstKey: string }
  | { kind: 'invalid'; reason: string }

/** Duplicate detection against the database and within the file. */
export function checkRows(rows: ParsedLocation[], existing: LocationLike[]): Map<string, RowCheck> {
  const result = new Map<string, RowCheck>()
  const byCode = new Map(existing.filter((e) => e.short_code).map((e) => [normCode(e.short_code), e]))
  const byName = new Map(existing.map((e) => [normalize(e.name), e]))
  const seenCode = new Map<string, string>()
  const seenName = new Map<string, string>()
  for (const r of rows) {
    const code = normCode(r.code)
    const name = normalize(r.name)
    if (!name) {
      result.set(r.key, { kind: 'invalid', reason: 'Name fehlt' })
      continue
    }
    if (r.name.length > 120) {
      result.set(r.key, { kind: 'invalid', reason: 'Name zu lang' })
      continue
    }
    const exCode = code ? byCode.get(code) : undefined
    const exName = byName.get(name)
    if (exCode) result.set(r.key, { kind: 'duplicate_existing', existing: exCode, by: 'code' })
    else if (exName) result.set(r.key, { kind: 'duplicate_existing', existing: exName, by: 'name' })
    else if (code && seenCode.has(code)) result.set(r.key, { kind: 'duplicate_in_file', firstKey: seenCode.get(code) as string })
    else if (seenName.has(name)) result.set(r.key, { kind: 'duplicate_in_file', firstKey: seenName.get(name) as string })
    else result.set(r.key, { kind: 'new' })
    if (code && !seenCode.has(code)) seenCode.set(code, r.key)
    if (!seenName.has(name)) seenName.set(name, r.key)
  }
  return result
}
