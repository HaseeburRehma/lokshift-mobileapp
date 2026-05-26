/**
 * Horizontal Shift-Template picker — lists templates as chips so the
 * user can populate a plan form with one tap. Tapping a chip fires
 * onSelect with the full template row; the host screen is responsible
 * for copying fields into its own form state.
 *
 * The "Vorlagen verwalten" link routes to the management screen so the
 * user doesn't need to back out to settings.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { LayoutTemplate } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useShiftTemplates } from '@/hooks/useShiftTemplates'
import type { ShiftTemplate } from '@/lib/types'

interface Props {
  onSelect: (template: ShiftTemplate) => void
  /** Show a link to the templates management screen. */
  showManageLink?: boolean
}

export function ShiftTemplatePicker({ onSelect, showManageLink = true }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { templates, loading } = useShiftTemplates()

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400">
          {L('Vorlage', 'Template')}
        </Text>
        {showManageLink && (
          <Pressable onPress={() => router.push('/shift-templates')}>
            <Text className="text-[11px] font-bold text-brand">
              {L('Verwalten', 'Manage')}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl h-14 px-4 justify-center">
          <Text className="text-[13px] text-gray-400 dark:text-slate-500">{L('Lädt…', 'Loading…')}</Text>
        </View>
      ) : templates.length === 0 ? (
        <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl py-5 items-center">
          <LayoutTemplate size={20} color="#D1D5DB" />
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-2">
            {L('Keine Vorlagen angelegt', 'No templates yet')}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {templates.map((tpl) => (
            <Pressable
              key={tpl.id}
              onPress={() => onSelect(tpl)}
              className="px-4 py-2 rounded-full border-2 bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700"
            >
              <Text className="text-[12px] font-bold text-gray-700 dark:text-slate-300">
                {tpl.name} · {tpl.start_time}–{tpl.end_time}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  )
}
