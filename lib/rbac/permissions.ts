/**
 * Role-based access helpers. Server-side RLS is the real authority — these
 * functions are UI gating only. Mirror the webapp's `lib/rbac/`.
 */

import type { UserRole } from '../types'

export const ROLE_LABELS: Record<UserRole, { de: string; en: string }> = {
  admin:      { de: 'Administrator', en: 'Admin' },
  dispatcher: { de: 'Disponent',     en: 'Dispatcher' },
  employee:   { de: 'Mitarbeiter',   en: 'Employee' },
}

export const ROLE_COLORS: Record<UserRole, string> = {
  admin:      '#7C3AED', // violet-600
  dispatcher: '#0064E0', // brand
  employee:   '#10B981', // emerald-500
}

/** Normalize anything the DB might return into the three canonical roles. */
export function normalizeRole(raw: string | null | undefined): UserRole {
  const r = (raw ?? 'employee').toLowerCase()
  if (r === 'administrator') return 'admin'
  if (r === 'disponent') return 'dispatcher'
  if (r === 'admin' || r === 'dispatcher' || r === 'employee') return r
  // Legacy "manager", "technician", "viewer", "partner_*" fall back to
  // the most restrictive role so they can't accidentally see operational
  // data they shouldn't.
  return 'employee'
}

export function isAdmin(role: UserRole | null | undefined) { return role === 'admin' }
export function isDispatcher(role: UserRole | null | undefined) { return role === 'dispatcher' }
export function isEmployee(role: UserRole | null | undefined) { return role === 'employee' }
export function canManageUsers(role: UserRole | null | undefined) { return role === 'admin' }
export function canCreatePlans(role: UserRole | null | undefined) { return role === 'admin' || role === 'dispatcher' }
export function canApproveTimes(role: UserRole | null | undefined) { return role === 'admin' || role === 'dispatcher' }
export function canGenerateReports(role: UserRole | null | undefined) { return role === 'admin' || role === 'dispatcher' }
