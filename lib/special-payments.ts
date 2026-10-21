/**
 * Sonderzahlungen (Kundenfeedback Punkt 6) — labels and period helpers,
 * identical copy in the webapp and the mobile app. Stored in the table
 * `holiday_bonuses` (historic name).
 */

export type SpecialPaymentType = 'holiday_pay' | 'christmas' | 'vacation' | 'performance' | 'other'
export type SpecialPaymentDistribution = 'once' | 'monthly' | 'prorata'

export const SPECIAL_PAYMENT_TYPES: Record<SpecialPaymentType, { de: string; en: string }> = {
  holiday_pay: { de: 'Urlaubsgeld', en: 'Holiday pay' },
  christmas: { de: 'Weihnachtsgeld', en: 'Christmas bonus' },
  vacation: { de: 'Urlaubsabgeltung', en: 'Vacation compensation' },
  performance: { de: 'Prämie', en: 'Bonus' },
  other: { de: 'Sonstige Zahlung', en: 'Other payment' },
}

export const DISTRIBUTIONS: Record<SpecialPaymentDistribution, { de: string; en: string; hintDe: string; hintEn: string }> = {
  once: {
    de: 'Einmalig',
    en: 'One-off',
    hintDe: 'Erscheint im gewählten Abrechnungsmonat.',
    hintEn: 'Appears in the chosen billing month.',
  },
  monthly: {
    de: 'Monatlich wiederkehrend',
    en: 'Monthly recurring',
    hintDe: 'Der volle Betrag erscheint in jedem Monat des Zeitraums.',
    hintEn: 'The full amount appears in every month of the period.',
  },
  prorata: {
    de: 'Anteilig verteilt',
    en: 'Split pro rata',
    hintDe: 'Der Betrag wird gleichmäßig auf die Monate des Zeitraums verteilt.',
    hintEn: 'The amount is split evenly across the months of the period.',
  },
}

export function specialPaymentTypeLabel(t: string | null | undefined, locale: 'de' | 'en' = 'de'): string {
  const entry = SPECIAL_PAYMENT_TYPES[(t ?? 'other') as SpecialPaymentType] ?? SPECIAL_PAYMENT_TYPES.other
  return locale === 'de' ? entry.de : entry.en
}

export function distributionLabel(d: string | null | undefined, locale: 'de' | 'en' = 'de'): string {
  const entry = DISTRIBUTIONS[(d ?? 'once') as SpecialPaymentDistribution] ?? DISTRIBUTIONS.once
  return locale === 'de' ? entry.de : entry.en
}

const mmYYYY = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`

export function monthsInPeriod(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
}

/** "10/2026" or "01/2026 – 03/2026 · monatlich wiederkehrend". */
export function paymentPeriodLabel(
  p: { distribution?: string | null; billing_month?: string | null; period_start?: string | null; period_end?: string | null; created_at?: string },
  locale: 'de' | 'en' = 'de',
): string {
  if ((p.distribution ?? 'once') === 'once') {
    const m = p.billing_month ?? p.period_start ?? p.created_at ?? ''
    return m ? mmYYYY(m) : '–'
  }
  if (!p.period_start || !p.period_end) return '–'
  const n = monthsInPeriod(p.period_start, p.period_end)
  return `${mmYYYY(p.period_start)} – ${mmYYYY(p.period_end)} · ${distributionLabel(p.distribution, locale).toLowerCase()} (${n} ${locale === 'de' ? (n === 1 ? 'Monat' : 'Monate') : n === 1 ? 'month' : 'months'})`
}
