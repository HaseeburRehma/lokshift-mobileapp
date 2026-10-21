/**
 * Plan status labels + colours — mobile copy of the webapp's
 * `PLAN_STATUS` (components/plans/PlanCard.tsx). Used by the week grid,
 * the plan detail and "Meine Woche" so a status reads the same everywhere:
 * Offen (amber), Bestätigt (emerald), Abgelehnt (red), Entwurf / Storniert
 * (slate). Chip = web `rounded-md border px-2 py-0.5 text-[10px]
 * font-black uppercase tracking-wider`.
 */

import React from 'react'
import { Text, View } from 'react-native'

export interface PlanStatusStyle {
  de: string
  en: string
  bg: string
  fg: string
  border: string
}

export const PLAN_STATUS: Record<string, PlanStatusStyle> = {
  draft: { de: 'Entwurf', en: 'Draft', bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  assigned: { de: 'Offen', en: 'Open', bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  confirmed: { de: 'Bestätigt', en: 'Confirmed', bg: '#ECFDF5', fg: '#065F46', border: '#A7F3D0' },
  rejected: { de: 'Abgelehnt', en: 'Rejected', bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  cancelled: { de: 'Storniert', en: 'Cancelled', bg: '#F1F5F9', fg: '#64748B', border: '#E2E8F0' },
}

export function planStatusStyle(status: string | null | undefined): PlanStatusStyle {
  return PLAN_STATUS[status ?? ''] ?? PLAN_STATUS.assigned
}

export function planStatusLabel(status: string | null | undefined, locale: 'de' | 'en'): string {
  const s = planStatusStyle(status)
  return locale === 'de' ? s.de : s.en
}

/** Card border colour by status (web PlanCard). */
export function planCardBorder(status: string | null | undefined): string {
  if (status === 'rejected') return '#FECACA'
  if (status === 'confirmed') return '#A7F3D0'
  return '#FDE68A'
}

/** Small uppercase chip — `size="sm"` is the dense variant used inside grid cards. */
export function Chip({
  label,
  bg,
  fg,
  border,
  dashed,
  size = 'md',
}: {
  label: string
  bg: string
  fg: string
  border?: string
  dashed?: boolean
  size?: 'sm' | 'md'
}) {
  const sm = size === 'sm'
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 6,
        borderWidth: 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: border ?? bg,
        backgroundColor: bg,
        paddingHorizontal: sm ? 5 : 8,
        paddingVertical: sm ? 0 : 2,
      }}
    >
      <Text
        allowFontScaling={!sm}
        numberOfLines={1}
        style={{
          fontSize: sm ? 8.5 : 10,
          lineHeight: sm ? 12 : 14,
          fontWeight: '900',
          letterSpacing: sm ? 0.5 : 0.8,
          textTransform: 'uppercase',
          color: fg,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

export function PlanStatusChip({
  status,
  locale,
  size = 'md',
}: {
  status: string | null | undefined
  locale: 'de' | 'en'
  size?: 'sm' | 'md'
}) {
  const s = planStatusStyle(status)
  return <Chip label={locale === 'de' ? s.de : s.en} bg={s.bg} fg={s.fg} border={s.border} size={size} />
}

/** Absence chip colours (web: teal = Urlaub, rose = Krank, dashed = beantragt). */
export const ABSENCE_STYLE = {
  sick: { bg: '#FFE4E6', fg: '#BE123C', border: '#FFE4E6', cellBg: '#FFF1F2' },
  vacation: { bg: '#CCFBF1', fg: '#0F766E', border: '#CCFBF1', cellBg: '#F0FDFA' },
  pending: { bg: 'transparent', fg: '#0F766E', border: '#2DD4BF', cellBg: '#F0FDFA' },
} as const

export function absenceLabel(kind: string, pending: boolean | undefined, locale: 'de' | 'en'): string {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  if (kind === 'sick') return L('Krank', 'Sick')
  return pending ? L('Urlaub beantragt', 'Vacation requested') : L('Urlaub', 'Vacation')
}

export function absenceStyle(kind: string, pending: boolean | undefined) {
  if (kind === 'sick') return ABSENCE_STYLE.sick
  return pending ? ABSENCE_STYLE.pending : ABSENCE_STYLE.vacation
}
