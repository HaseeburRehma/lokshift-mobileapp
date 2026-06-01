/**
 * Crash-proof formatting helpers — wrap every date / number operation
 * that could throw if the underlying Supabase row has a null, malformed
 * value, or unexpected shape. Use these on every user-facing render
 * path so a single bad row never takes the whole screen down.
 *
 * RN's render thread is single-threaded; an uncaught exception bubbles
 * up to the React Error boundary (if any) or the global red-screen. We
 * choose to render a placeholder ("—" / "0.00") instead so the rest of
 * the list still works.
 */

import { format, parseISO } from 'date-fns'
import type { Locale } from 'date-fns'

/** Safe date format — returns fallback on null/undefined/invalid input. */
export function safeFormatDate(
  value: string | null | undefined,
  formatStr: string,
  opts?: { locale?: Locale; fallback?: string },
): string {
  const fallback = opts?.fallback ?? '—'
  if (!value) return fallback
  try {
    const d = parseISO(value)
    if (Number.isNaN(d.getTime())) return fallback
    return format(d, formatStr, opts?.locale ? { locale: opts.locale } : undefined)
  } catch {
    return fallback
  }
}

/** Safe time format (`HH:mm`) — same contract as safeFormatDate. */
export function safeFormatTime(
  value: string | null | undefined,
  fallback = '—',
): string {
  return safeFormatDate(value, 'HH:mm', { fallback })
}

/** Safe number → string. Handles null / undefined / NaN. */
export function safeNumber(
  value: number | string | null | undefined,
  decimals = 2,
): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return (0).toFixed(decimals)
  return n.toFixed(decimals)
}

/** Safe parseISO that never throws. Returns null on failure. */
export function safeParseISO(value: string | null | undefined): Date | null {
  if (!value) return null
  try {
    const d = parseISO(value)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/** Clamp a page number to a valid range — useful after a filter change. */
export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page) || page < 1) return 1
  if (page > totalPages) return Math.max(1, totalPages)
  return Math.floor(page)
}
