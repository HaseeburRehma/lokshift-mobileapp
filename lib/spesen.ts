/**
 * Spesen (Verpflegungspauschale) calculator — ported 1:1 from the
 * webapp's `lib/spesen.ts`. Reference: §9 Abs. 4a EStG.
 *
 *   partial day  (>8h away, no overnight stay)        →  €14
 *   full day     (overnight stay away from home)      →  €28
 *   ≤8h, no overnight                                 →   €0
 *
 * Rates are organization-configurable
 * (organizations.spesen_rate_partial / _full). Defaults match
 * Rheinmaasrail's payroll setup.
 *
 * Pure module — no I/O.
 */

export interface SpesenRates {
  partial: number
  full: number
}

export const DEFAULT_SPESEN_RATES: SpesenRates = {
  partial: 14,
  full: 28,
}

export function calculateSpesen(
  hoursWorked: number,
  overnightStay: boolean,
  rates: Partial<SpesenRates> = {},
): number {
  const partial = rates.partial ?? DEFAULT_SPESEN_RATES.partial
  const full = rates.full ?? DEFAULT_SPESEN_RATES.full

  if (overnightStay) return full
  if (hoursWorked > 8) return partial
  return 0
}

export function spesenTierLabel(
  amount: number,
  rates: Partial<SpesenRates> = {},
  locale: 'de' | 'en' = 'de',
): string {
  const partial = rates.partial ?? DEFAULT_SPESEN_RATES.partial
  const full = rates.full ?? DEFAULT_SPESEN_RATES.full

  if (amount >= full) return locale === 'de' ? 'Vollsatz (Übernachtung)' : 'Full (overnight)'
  if (amount >= partial) return locale === 'de' ? 'Teilsatz (>8 Std.)' : 'Partial (>8h)'
  return locale === 'de' ? 'Kein Anspruch' : 'None'
}
