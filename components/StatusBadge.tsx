/**
 * Coloured pill for plan / time entry status. The colour map mirrors the
 * webapp so the two clients feel like the same product.
 */

import React from 'react'
import { Text, View } from 'react-native'
import type { PlanStatus } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'

const STYLES: Record<PlanStatus, { bg: string; text: string; border: string }> = {
  draft:     { bg: 'bg-gray-100 dark:bg-slate-800',     text: 'text-gray-600 dark:text-slate-400',    border: 'border-gray-200 dark:border-slate-700' },
  assigned:  { bg: 'bg-blue-100',     text: 'text-blue-700',    border: 'border-blue-200' },
  confirmed: { bg: 'bg-emerald-100',  text: 'text-emerald-700', border: 'border-emerald-200' },
  rejected:  { bg: 'bg-red-100',      text: 'text-red-600',     border: 'border-red-200' },
  cancelled: { bg: 'bg-gray-100 dark:bg-slate-800',     text: 'text-gray-400 dark:text-slate-500',    border: 'border-gray-200 dark:border-slate-700' },
}

export function StatusBadge({ status }: { status: PlanStatus }) {
  const { t } = useTranslation()
  const s = STYLES[status] ?? STYLES.draft
  return (
    <View className={`px-3 py-1 rounded-full border ${s.bg} ${s.border}`}>
      <Text className={`text-[10px] font-black uppercase tracking-widest ${s.text}`}>
        {t(`plans.status.${status}`)}
      </Text>
    </View>
  )
}
