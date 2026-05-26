/**
 * Horizontal chip-row for the calendar reminder offset. Values come
 * from REMINDER_OPTIONS in lib/types so mobile + web pick from the
 * same set.
 *
 * `value === null` means "no reminder" — explicitly distinct from the
 * `undefined` default so the picker is round-trippable.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Bell } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { REMINDER_OPTIONS } from '@/lib/types'

interface Props {
  value: number | null | undefined
  onChange: (v: number | null) => void
  label?: string
}

export function ReminderPicker({ value, onChange, label }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const current = value ?? null

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, marginLeft: 4 }}>
        <Bell size={14} color="#6B7280" />
        <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1.5 text-gray-500 dark:text-slate-400">
          {label ?? L('Erinnerung', 'Reminder')}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {REMINDER_OPTIONS.map((opt) => {
          const sel = current === opt.value
          return (
            <Pressable
              key={String(opt.value)}
              onPress={() => onChange(opt.value)}
              className={`px-4 py-2 rounded-full border-2 ${
                sel ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
              }`}
            >
              <Text
                className={`text-[12px] font-bold ${
                  sel ? 'text-white' : 'text-gray-600 dark:text-slate-300'
                }`}
              >
                {locale === 'de' ? opt.label_de : opt.label_en}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
