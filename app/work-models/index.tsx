/**
 * Working-time-models list — admin only.
 */

import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Clock, Plus } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useWorkModels } from '@/hooks/useWorkModels'
import { useSafeBack } from '@/lib/use-safe-back'

export default function WorkModelsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { models, loading, fetchModels } = useWorkModels()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchModels()
    } finally {
      setRefreshing(false)
    }
  }, [fetchModels])

  const sorted = useMemo(() => {
    return [...models].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [models])

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können Arbeitszeitmodelle verwalten.',
            'Only administrators can manage working time models.',
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
          {L('Arbeitszeitmodelle', 'Work time models')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Clock size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Modelle definieren', 'Define models')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Sollstunden pro Woche, Mitarbeitern zugewiesen.',
                'Target hours per week, assigned to employees.',
              )}
            </Text>
          </View>
        </View>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <Clock size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Modelle', 'No models yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie auf das Plus-Symbol, um eines anzulegen.',
                  'Tap the plus button to create one.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {sorted.map((m) => (
              <Pressable key={m.id} onPress={() => router.push(`/work-models/${m.id}`)}>
                <Card style={m.is_active ? undefined : { opacity: 0.55 }}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center">
                        <Text className="text-[15px] font-black text-gray-900 dark:text-white">{m.name}</Text>
                        {!m.is_active && (
                          <View className="ml-2 px-2 py-0.5 rounded-full bg-gray-200">
                            <Text className="text-[9px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-400">
                              {L('Inaktiv', 'Inactive')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {m.description && (
                        <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">{m.description}</Text>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-[20px] font-black text-brand">
                        {m.target_hours_per_week}
                      </Text>
                      <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                        h/{L('W', 'wk')}
                      </Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/work-models/new')}
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
