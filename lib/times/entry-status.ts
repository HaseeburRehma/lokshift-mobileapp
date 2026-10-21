/**
 * Lifecycle of a time entry (Kundenfeedback Punkte 2 + 3):
 *
 *   running   → clocked in, no end yet
 *   draft     → ended, not submitted (employee may still edit)
 *   submitted → sent; employee changes only via correction request
 *   approved  → approved by dispatch/admin
 *   planned   → future pre-announcement, not worked time
 */

import type { TimeEntry } from '@/lib/types'

export type EntryStatus = 'planned' | 'running' | 'draft' | 'submitted' | 'approved'

export function entryStatus(e: Pick<TimeEntry, 'is_planned' | 'end_time' | 'is_verified' | 'submitted_at'>): EntryStatus {
  if (e.is_planned) return 'planned'
  if (!e.end_time) return 'running'
  if (e.is_verified) return 'approved'
  if (e.submitted_at) return 'submitted'
  return 'draft'
}

export function entryStatusLabel(s: EntryStatus, locale: 'de' | 'en' = 'de'): string {
  const de: Record<EntryStatus, string> = {
    planned: 'Geplant',
    running: 'Läuft',
    draft: 'Nicht abgesendet',
    submitted: 'Abgesendet',
    approved: 'Freigegeben',
  }
  const en: Record<EntryStatus, string> = {
    planned: 'Planned',
    running: 'Running',
    draft: 'Not submitted',
    submitted: 'Submitted',
    approved: 'Approved',
  }
  return (locale === 'de' ? de : en)[s]
}

export const ENTRY_STATUS_STYLE: Record<EntryStatus, string> = {
  planned: 'bg-violet-50 text-violet-700 border-violet-200',
  running: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  submitted: 'bg-sky-50 text-sky-700 border-sky-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** Columns + joins every time-entry screen loads. */
export const TIME_ENTRY_SELECT = [
  '*',
  'employee:profiles!employee_id(id, full_name, avatar_url, role)',
  'enterer:profiles!entered_by(id, full_name)',
  'verifier:profiles!verified_by(id, full_name)',
  'customer:customers(id, name)',
  'plan:plans(id, start_time, end_time, shift_name, route, location, customer:customers(id, name))',
  'start_location:operational_locations!start_location_id(id, name, short_code, type)',
  'destination_location:operational_locations!destination_location_id(id, name, short_code, type)',
].join(', ')

const EN_MESSAGES: Record<string, string> = {
  'Abgesendete Zeiten können nur über einen Korrekturantrag geändert werden.':
    'Submitted times can only be changed through a correction request.',
  'Nur Disposition oder Admin dürfen Zeiten freigeben.': 'Only dispatch or admin can approve times.',
  'Diese Änderung ist nur für Disposition oder Admin erlaubt.': 'Only dispatch or admin may make this change.',
  'Eine laufende Schicht kann nicht abgesendet werden.': 'A running shift cannot be submitted.',
  'Einträge ohne gültige Arbeitszeit (0 Stunden oder ohne Schichtende) können nicht freigegeben werden.':
    'Entries without valid working time (0 hours or no end) cannot be approved.',
  'Das Schichtende liegt vor dem Schichtbeginn.': 'The shift end is before the start.',
  'Die Pause darf nicht negativ sein.': 'The break cannot be negative.',
  'Dieser Korrekturantrag wurde bereits bearbeitet.': 'This correction request was already decided.',
  'Nur Disposition oder Admin dürfen Korrekturen bearbeiten.': 'Only dispatch or admin can decide corrections.',
  'Mitarbeiter dürfen bei Schichten nur Bestätigung oder Ablehnung setzen.':
    'Employees can only confirm or reject shifts.',
}

/** Human-readable message for a Supabase/Postgres error (DB rules raise German text). */
export function dbErrorMessage(err: unknown, locale: 'de' | 'en', fallback: string): string {
  const msg = (err as { message?: string } | null)?.message?.trim()
  if (!msg) return fallback
  if (msg in EN_MESSAGES) return locale === 'de' ? msg : EN_MESSAGES[msg]
  if (/duplicate key.*uq_time_entry_corrections_pending/i.test(msg)) {
    return locale === 'de'
      ? 'Für diesen Eintrag ist bereits ein Korrekturantrag offen.'
      : 'A correction request for this entry is already open.'
  }
  if (/row-level security/i.test(msg)) {
    return locale === 'de' ? 'Keine Berechtigung für diese Aktion.' : 'You are not allowed to do this.'
  }
  return fallback
}
