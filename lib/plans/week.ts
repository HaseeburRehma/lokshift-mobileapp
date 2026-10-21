/**
 * Weekly planning helpers (Kundenfeedback Punkte 7–10) — identical copy in
 * the webapp and the mobile app. Pure functions, no I/O.
 */

import { addDays, localDateKey } from '@/lib/time/shift-hours'

export interface WeekPlan {
  id: string
  employee_id: string | null
  start_time: string
  end_time: string
  status: string
}

export interface WeekAbsence {
  employee_id: string
  start_date: string
  end_date: string
  kind: 'vacation' | 'sick' | 'other'
  pending?: boolean
}

export interface WeekQualification {
  user_id: string
  name: string
  doc_type?: string | null
  expires_at: string | null
  is_required?: boolean | null
  archived_at?: string | null
}

/** Monday (YYYY-MM-DD) of the week containing `date`. */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return addDays(date, -((dow + 6) % 7))
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** ISO-8601 week number. */
export function isoWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function planStartDay(p: Pick<WeekPlan, 'start_time'>): string {
  return localDateKey(new Date(p.start_time))
}

/** Local day of the end (an end exactly at midnight belongs to the day before). */
export function planEndDay(p: Pick<WeekPlan, 'end_time'>): string {
  return localDateKey(new Date(new Date(p.end_time).getTime() - 1))
}

export function overlaps(a: Pick<WeekPlan, 'start_time' | 'end_time'>, b: Pick<WeekPlan, 'start_time' | 'end_time'>): boolean {
  return new Date(a.start_time) < new Date(b.end_time) && new Date(b.start_time) < new Date(a.end_time)
}

export function hasStarted(p: Pick<WeekPlan, 'start_time'>, now: Date = new Date()): boolean {
  return new Date(p.start_time) <= now
}

export function absenceOn(absences: WeekAbsence[], employeeId: string, day: string): WeekAbsence | undefined {
  return absences.find((a) => a.employee_id === employeeId && day >= a.start_date && day <= a.end_date)
}

export type ReassignWarning =
  | { kind: 'started' }
  | { kind: 'overlap'; planId: string; start_time: string; end_time: string }
  | { kind: 'absence'; absence: WeekAbsence }
  | { kind: 'qualification_expired'; name: string; expires_at: string }
  | { kind: 'fitness_missing' }

/**
 * Checks before a shift is moved to `targetEmployeeId` (Punkt 8,
 * Ergänzende Empfehlung): overlaps, absences, expired/missing required
 * qualifications, already started shifts.
 */
export function reassignWarnings(
  plan: WeekPlan,
  targetEmployeeId: string,
  ctx: { plans: WeekPlan[]; absences: WeekAbsence[]; qualifications: WeekQualification[]; now?: Date },
): ReassignWarning[] {
  const warnings: ReassignWarning[] = []
  if (hasStarted(plan, ctx.now)) warnings.push({ kind: 'started' })

  for (const other of ctx.plans) {
    if (other.id === plan.id || other.employee_id !== targetEmployeeId) continue
    if (other.status === 'cancelled' || other.status === 'rejected') continue
    if (overlaps(plan, other)) warnings.push({ kind: 'overlap', planId: other.id, start_time: other.start_time, end_time: other.end_time })
  }

  const days = new Set([planStartDay(plan), planEndDay(plan)])
  for (const day of days) {
    const a = absenceOn(ctx.absences, targetEmployeeId, day)
    if (a) {
      warnings.push({ kind: 'absence', absence: a })
      break
    }
  }

  const shiftDay = planStartDay(plan)
  const active = ctx.qualifications.filter((q) => !q.archived_at)
  const mine = active.filter((q) => q.user_id === targetEmployeeId)
  for (const q of mine) {
    if ((q.is_required || q.doc_type === 'fitness') && q.expires_at && q.expires_at < shiftDay) {
      warnings.push({ kind: 'qualification_expired', name: q.name, expires_at: q.expires_at })
    }
  }
  const orgTracksFitness = active.some((q) => q.doc_type === 'fitness')
  const hasValidFitness = mine.some((q) => q.doc_type === 'fitness' && (!q.expires_at || q.expires_at >= shiftDay))
  if (orgTracksFitness && !hasValidFitness && !warnings.some((w) => w.kind === 'qualification_expired')) {
    warnings.push({ kind: 'fitness_missing' })
  }
  return warnings
}

export type DutyStatus = 'not_checked_in' | 'checked_in' | 'finished' | 'overrun'

/**
 * "Laut Planung aktuell im Einsatz" (Punkt 10): the planned time decides
 * who is on the list; the actual tracking adds the status.
 */
export function dutyStatus(
  plan: Pick<WeekPlan, 'start_time' | 'end_time'>,
  entry: { start_time: string; end_time: string | null } | null | undefined,
  now: Date = new Date(),
): DutyStatus {
  if (!entry) return 'not_checked_in'
  if (entry.end_time) return 'finished'
  return now > new Date(plan.end_time) ? 'overrun' : 'checked_in'
}

export function dutyStatusLabel(s: DutyStatus, locale: 'de' | 'en' = 'de'): string {
  const de: Record<DutyStatus, string> = {
    not_checked_in: 'Noch nicht eingecheckt',
    checked_in: 'Eingecheckt',
    finished: 'Bereits beendet',
    overrun: 'Planzeit überschritten',
  }
  const en: Record<DutyStatus, string> = {
    not_checked_in: 'Not checked in yet',
    checked_in: 'Checked in',
    finished: 'Already finished',
    overrun: 'Planned time exceeded',
  }
  return (locale === 'de' ? de : en)[s]
}
