/**
 * Verpflegungsmehraufwand ("Spesen") — identical copy in the webapp and the
 * mobile app. Billing spec (Nov 2026), section 4:
 *
 *   shift under 8 h net                    →  0 €
 *   shift of 8 h or more                   →  partial rate (default 14 €)
 *   shift of 8 h or more WITH overnight    →  full rate    (default 28 €)
 *
 * Never additive: exactly one value per shift (0, 14 or 28 €). The database
 * trigger time_entries_normalize applies the same rule on every write.
 *
 * Rates are configurable per organisation (organizations.spesen_rate_partial
 * / spesen_rate_full). The amount is stored per time entry
 * (time_entries.meal_allowance) when the shift is saved or submitted; the
 * monthly report counts at most one allowance per calendar day.
 */

export interface SpesenRates {
  partial: number
  full: number
}

export const DEFAULT_SPESEN_RATES: SpesenRates = {
  partial: 14,
  full: 28,
}

export function resolveSpesenRates(org?: {
  spesen_rate_partial?: number | string | null
  spesen_rate_full?: number | string | null
} | null): SpesenRates {
  const partial = Number(org?.spesen_rate_partial)
  const full = Number(org?.spesen_rate_full)
  return {
    partial: Number.isFinite(partial) && partial > 0 ? partial : DEFAULT_SPESEN_RATES.partial,
    full: Number.isFinite(full) && full > 0 ? full : DEFAULT_SPESEN_RATES.full,
  }
}

export function calculateSpesen(
  hoursWorked: number,
  overnightStay: boolean,
  rates: Partial<SpesenRates> = {},
): number {
  const partial = rates.partial ?? DEFAULT_SPESEN_RATES.partial
  const full = rates.full ?? DEFAULT_SPESEN_RATES.full
  // Whole minutes, like net_hours: 7:59 h stays under 8 h.
  const minutes = Math.round((Number(hoursWorked) || 0) * 60)
  if (minutes < 8 * 60) return 0
  return overnightStay ? full : partial
}

export type SpesenKind = 'full' | 'partial' | 'other' | 'none'

export function spesenKind(amount: number | null | undefined, rates: Partial<SpesenRates> = {}): SpesenKind {
  const a = Number(amount) || 0
  if (a <= 0) return 'none'
  if (a === (rates.full ?? DEFAULT_SPESEN_RATES.full)) return 'full'
  if (a === (rates.partial ?? DEFAULT_SPESEN_RATES.partial)) return 'partial'
  return 'other'
}

export function spesenTierLabel(
  amount: number,
  rates: Partial<SpesenRates> = {},
  locale: 'de' | 'en' = 'de',
): string {
  const kind = spesenKind(amount, rates)
  if (kind === 'full') return locale === 'de' ? 'Vollsatz (ab 8 Std. mit Übernachtung)' : 'Full (8 h+ with overnight)'
  if (kind === 'partial') return locale === 'de' ? 'Teilsatz (ab 8 Std.)' : 'Partial (8 h or more)'
  if (kind === 'other') return locale === 'de' ? 'Abweichender Betrag' : 'Custom amount'
  return locale === 'de' ? 'Kein Anspruch' : 'None'
}
