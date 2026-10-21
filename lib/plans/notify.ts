/**
 * Shift notifications (Kundenfeedback Punkt 8): in-app + email + push via
 * /api/notifications/dispatch. Every message carries date, time and shift
 * name so the recipient doesn't need to open the app to know what changed.
 */

import { sendNotification } from '@/lib/notifications/service'
import { formatDateDE, formatShiftRange, weekdayName } from '@/lib/time/format'
import { localDateKey } from '@/lib/time/shift-hours'

export interface PlanLike {
  id: string
  start_time: string
  end_time: string
  shift_name?: string | null
  route?: string | null
  customer?: { name?: string | null } | null
  start_location?: { short_code?: string | null; name?: string | null } | null
  destination_location?: { short_code?: string | null; name?: string | null } | null
}

export function describePlan(p: PlanLike): string {
  const day = localDateKey(new Date(p.start_time))
  const parts = [
    `${weekdayName(day, 'de', true)}, ${formatDateDE(day)}`,
    formatShiftRange(p.start_time, p.end_time, 'de'),
  ]
  if (p.shift_name || p.route) parts.push(String(p.shift_name || p.route))
  if (p.customer?.name) parts.push(p.customer.name)
  const a = p.start_location?.short_code || p.start_location?.name
  const b = p.destination_location?.short_code || p.destination_location?.name
  if (a || b) parts.push(`${a ?? '?'} → ${b ?? '?'}`)
  return parts.join(' · ')
}

function weekLink(p: PlanLike) {
  return `/dashboard/plans/my-week?date=${localDateKey(new Date(p.start_time))}`
}

export function notifyPlanAssigned(p: PlanLike, employeeId: string, from?: string | null) {
  return sendNotification({
    userId: employeeId,
    title: 'Neue Schicht zugewiesen',
    message: `${describePlan(p)}${from ? ` (übernommen von ${from})` : ''}. Bitte prüfen und bestätigen.`,
    module: 'plans',
    moduleId: p.id,
    link: weekLink(p),
  })
}

export function notifyPlanRemoved(p: PlanLike, employeeId: string, to?: string | null) {
  return sendNotification({
    userId: employeeId,
    title: 'Schicht entzogen',
    message: `Die Schicht ${describePlan(p)} wurde ${to ? `an ${to} ` : ''}umverteilt und ist nicht mehr Ihnen zugewiesen.`,
    module: 'plans',
    moduleId: p.id,
    link: weekLink(p),
  })
}

export function notifyPlanChanged(p: PlanLike, employeeId: string, before?: PlanLike) {
  const prev = before ? ` Bisher: ${formatShiftRange(before.start_time, before.end_time, 'de')} am ${formatDateDE(localDateKey(new Date(before.start_time)))}.` : ''
  return sendNotification({
    userId: employeeId,
    title: 'Schicht geändert',
    message: `Ihre Schicht wurde geändert: ${describePlan(p)}.${prev} Bitte erneut bestätigen.`,
    module: 'plans',
    moduleId: p.id,
    link: weekLink(p),
  })
}

/** The shift was deleted — no moduleId, the plan no longer exists. */
export function notifyPlanCancelled(p: PlanLike, employeeId: string) {
  return sendNotification({
    userId: employeeId,
    title: 'Schicht gestrichen',
    message: `Die Schicht ${describePlan(p)} wurde gestrichen und ist nicht mehr Ihnen zugewiesen.`,
    module: 'plans',
    link: weekLink(p),
  })
}
