/**
 * Verpflegungsmehraufwand ("Spesen") — identical copy in the webapp and the
 * mobile app. Reference: §9 Abs. 4a EStG.
 *
 *   more than 8 h net working time, no overnight →  partial rate (default 14 €)
 *   overnight stay away from home           →  full rate    (default 28 €)
 *   otherwise                               →  0 €
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
  if (overnightStay) return full
  if (hoursWorked > 8) return partial
  return 0
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
  if (kind === 'full') return locale === 'de' ? 'Vollsatz (Übernachtung)' : 'Full (overnight)'
  if (kind === 'partial') return locale === 'de' ? 'Teilsatz (über 8 Std.)' : 'Partial (over 8 h)'
  if (kind === 'other') return locale === 'de' ? 'Abweichender Betrag' : 'Custom amount'
  return locale === 'de' ? 'Kein Anspruch' : 'None'
}
