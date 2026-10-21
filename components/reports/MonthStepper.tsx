/**
 * Month picker for the report screens — the phone replacement for the
 * webapp's `<input type="month">` (h-10, rounded-xl, slate-200 border,
 * bold text). Steps one month at a time with ‹ / › and shows the month
 * as "Oktober 2026".
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { monthLabel } from '@/lib/time/format'

/** "2026-10" + 1 → "2026-11". Invalid keys are returned unchanged. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Current month shifted by `offset` months, as "YYYY-MM". */
export function monthKeyFromNow(offset = 0): string {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface MonthStepperProps {
  value: string
  onChange: (next: string) => void
  /** Small uppercase caption above the control (optional). */
  label?: string
}

export function MonthStepper({ value, onChange, label }: MonthStepperProps) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  return (
    <View>
      {label ? (
        <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          backgroundColor: '#FFFFFF',
        }}
      >
        <Pressable
          onPress={() => onChange(shiftMonth(value, -1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={L('Vorheriger Monat', 'Previous month')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={18} color="#0064E0" />
        </Pressable>
        <Text
          numberOfLines={1}
          style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#0F172A' }}
        >
          {monthLabel(value, locale)}
        </Text>
        <Pressable
          onPress={() => onChange(shiftMonth(value, 1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={L('Nächster Monat', 'Next month')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronRight size={18} color="#0064E0" />
        </Pressable>
      </View>
    </View>
  )
}
