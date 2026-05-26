/**
 * Shift templates list — admin/dispatcher only. Each row is tappable to
 * edit; a FAB opens the create form. Deleting is done from the edit
 * screen to keep accidental taps off the list.
 */

import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, LayoutTemplate, Plus, Hotel, Users as UsersIcon } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useShiftTemplates } from '@/hooks/useShiftTemplates'
import { useSafeBack } from '@/lib/use-safe-back'

export default function ShiftTemplatesScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { templates, loading, fetchTemplates } = useShiftTemplates()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchTemplates()
    } finally {
      setRefreshing(false)
    }
  }, [fetchTemplates])

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Vorlagen verwalten.',
            'Only admins or dispatchers can manage templates.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Schichtvorlagen', 'Shift templates')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <LayoutTemplate size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Wiederkehrende Schichten', 'Recurring shifts')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Einmal anlegen, beim Plan-Erstellen mit einem Klick übernehmen.',
                'Define once, apply with one tap when creating a plan.',
              )}
            </Text>
          </View>
        </View>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : templates.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <LayoutTemplate size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Vorlagen', 'No templates yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie auf „Vorlage hinzufügen", um zu beginnen.',
                  'Tap "Add template" to create one.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {templates.map((tpl) => (
              <Pressable
                key={tpl.id}
                onPress={() => router.push(`/shift-templates/${tpl.id}`)}
              >
                <Card>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-[15px] font-black text-gray-900 dark:text-white">{tpl.name}</Text>
                      <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">
                        {tpl.start_time}–{tpl.end_time}
                        {tpl.duration_days > 1
                          ? ` · ${tpl.duration_days} ${L('Tage', 'days')}`
                          : ''}
                      </Text>
                      {tpl.customer?.name && (
                        <Text className="text-[12px] text-gray-700 dark:text-slate-300 mt-1 font-semibold">
                          {tpl.customer.name}
                        </Text>
                      )}
                      {(tpl.location || tpl.route) && (
                        <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                          {[tpl.location, tpl.route].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {tpl.overnight_stay && (
                      <View className="flex-row items-center ml-2 mt-0.5">
                        <Hotel size={16} color="#0064E0" />
                      </View>
                    )}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/shift-templates/new')}
        className="absolute bottom-8 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center"
        style={{
          shadowColor: '#0064E0',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Plus size={26} color="#fff" />
      </Pressable>
    </Screen>
  )
}
