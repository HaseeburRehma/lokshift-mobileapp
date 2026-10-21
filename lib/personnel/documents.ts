/**
 * Personalakte / Nachweise & Fristen (Kundenfeedback Punkt 11) — identical
 * copy in the webapp and the mobile app. Records live in `qualifications`;
 * files in the private storage bucket `personnel-files`.
 */

import { localDateKey } from '@/lib/time/shift-hours'

export type DocType =
  | 'fitness'
  | 'license'
  | 'certificate'
  | 'route_knowledge'
  | 'vehicle_knowledge'
  | 'training'
  | 'id'
  | 'contract'
  | 'other'

export const DOC_TYPES: Record<DocType, { de: string; en: string }> = {
  fitness: { de: 'Tauglichkeit', en: 'Medical fitness' },
  license: { de: 'Triebfahrzeugführerschein', en: 'Train driver licence' },
  certificate: { de: 'Zusatzbescheinigung', en: 'Complementary certificate' },
  route_knowledge: { de: 'Streckenkunde', en: 'Route knowledge' },
  vehicle_knowledge: { de: 'Baureihenkenntnis', en: 'Rolling-stock knowledge' },
  training: { de: 'Unterweisung / Fortbildung', en: 'Training / instruction' },
  id: { de: 'Ausweis', en: 'ID document' },
  contract: { de: 'Vertrag / Vereinbarung', en: 'Contract / agreement' },
  other: { de: 'Sonstiger Nachweis', en: 'Other document' },
}

export function docTypeLabel(t: string | null | undefined, locale: 'de' | 'en' = 'de'): string {
  const e = DOC_TYPES[(t ?? 'other') as DocType] ?? DOC_TYPES.other
  return locale === 'de' ? e.de : e.en
}

export const DEFAULT_REMINDER_DAYS = [28, 14, 0]

export interface PersonnelDocument {
  id: string
  organization_id: string
  user_id: string
  name: string
  doc_type: DocType | string
  issuer: string | null
  reference: string | null
  issued_at: string | null
  expires_at: string | null
  remark: string | null
  reminder_days: number[]
  is_confidential: boolean
  is_required: boolean
  is_verified: boolean
  file_path: string | null
  file_name: string | null
  document_url: string | null
  archived_at: string | null
  replaced_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  employee?: { id: string; full_name: string | null } | null
}

export type DocStatus = 'valid' | 'expiring' | 'expired' | 'no_expiry'

export function daysUntil(date: string, today: string = localDateKey()): number {
  const [y1, m1, d1] = today.split('-').map(Number)
  const [y2, m2, d2] = date.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** "läuft bald ab" = within the earliest reminder window (default 28 days). */
export function docStatus(doc: Pick<PersonnelDocument, 'expires_at' | 'reminder_days'>, today: string = localDateKey()): DocStatus {
  if (!doc.expires_at) return 'no_expiry'
  const left = daysUntil(doc.expires_at, today)
  if (left < 0) return 'expired'
  const window = Math.max(28, ...(doc.reminder_days?.length ? doc.reminder_days : DEFAULT_REMINDER_DAYS))
  return left <= window ? 'expiring' : 'valid'
}

export function docStatusLabel(s: DocStatus, locale: 'de' | 'en' = 'de'): string {
  const de: Record<DocStatus, string> = { valid: 'Gültig', expiring: 'Läuft bald ab', expired: 'Abgelaufen', no_expiry: 'Unbefristet' }
  const en: Record<DocStatus, string> = { valid: 'Valid', expiring: 'Expiring soon', expired: 'Expired', no_expiry: 'No expiry' }
  return (locale === 'de' ? de : en)[s]
}

export const DOC_STATUS_STYLE: Record<DocStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  expiring: 'bg-amber-50 text-amber-800 border-amber-200',
  expired: 'bg-red-50 text-red-700 border-red-200',
  no_expiry: 'bg-slate-50 text-slate-600 border-slate-200',
}

/**
 * Which reminder (days before expiry) is due today, and which ones are
 * thereby settled. A record created late only triggers the most specific
 * reminder instead of several at once.
 */
export function dueReminder(
  doc: Pick<PersonnelDocument, 'expires_at' | 'reminder_days'>,
  alreadySent: number[],
  today: string = localDateKey(),
): { send: number | null; settle: number[] } {
  if (!doc.expires_at) return { send: null, settle: [] }
  const left = daysUntil(doc.expires_at, today)
  const days = [...new Set(doc.reminder_days?.length ? doc.reminder_days : DEFAULT_REMINDER_DAYS)].sort((a, b) => a - b)
  const reached = days.filter((d) => left <= d)
  if (reached.length === 0) return { send: null, settle: [] }
  const mostSpecific = reached[0]
  return {
    send: alreadySent.includes(mostSpecific) ? null : mostSpecific,
    settle: reached.filter((d) => !alreadySent.includes(d)),
  }
}

export function reminderLabel(days: number, locale: 'de' | 'en' = 'de'): string {
  if (days === 0) return locale === 'de' ? 'am Ablaufdatum' : 'on expiry date'
  if (days % 7 === 0) {
    const w = days / 7
    return locale === 'de' ? `${w} Woche${w === 1 ? '' : 'n'} vorher` : `${w} week${w === 1 ? '' : 's'} before`
  }
  return locale === 'de' ? `${days} Tage vorher` : `${days} days before`
}

/**
 * Storage path inside the bucket: <org>/<employee>/<uuid>-<file>, or
 * <org>/<employee>/confidential/<uuid>-<file> for confidential documents
 * (admin-only by storage policy from the first byte, even before the
 * record exists).
 */
export function personnelFilePath(orgId: string, employeeId: string, fileName: string, confidential = false): string {
  const safe = fileName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80)
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return `${orgId}/${employeeId}/${confidential ? 'confidential/' : ''}${id}-${safe || 'dokument'}`
}

