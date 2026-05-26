/**
 * Betriebsstellen list — admin/dispatcher only. Same shape as the
 * customers list (active sorted first, archived toggle, FAB to create).
 */

import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Building,
  Plus,
  Phone,
  MapPin,
  Archive,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useOperationalLocations } from '@/hooks/useOperationalLocations'
import type { OperationalLocationType } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

const TYPE_LABEL: Record<OperationalLocationType, { de: string; en: string }> = {
  depot: { de: 'Betriebshof', en: 'Depot' },
  station: { de: 'Bahnhof', en: 'Station' },
  yard: { de: 'Abstellanlage', en: 'Yard' },
  workshop: { de: 'Werkstatt', en: 'Workshop' },
  office: { de: 'Büro', en: 'Office' },
  other: { de: 'Sonstige', en: 'Other' },
}

export default function OperationalLocationsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { locations, loading, fetchLocations } = useOperationalLocations()
  const [showArchived, setShowArchived] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchLocations()
    } finally {
      setRefreshing(false)
    }
  }, [fetchLocations])

  const sorted = useMemo(() => {
    return [...locations].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [locations])

  const activeCount = locations.filter((l) => l.is_active).length
  const archivedCount = locations.length - activeCount

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Betriebsstellen verwalten.',
            'Only admins or dispatchers can manage operational locations.',
          )}
        </Text>
      </Screen>
    )
  }

  const rendered = showArchived ? sorted : sorted.filter((l) => l.is_active)

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Betriebsstellen', 'Operational locations')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Building size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {activeCount}{' '}
              {L(
                activeCount === 1 ? 'aktive Stelle' : 'aktive Stellen',
                activeCount === 1 ? 'active site' : 'active sites',
              )}
            </Text>
            {archivedCount > 0 && (
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                {archivedCount} {L('archiviert', 'archived')}
              </Text>
            )}
          </View>
          {archivedCount > 0 && (
            <Pressable
              onPress={() => setShowArchived((s) => !s)}
              className="px-3 py-2 rounded-full border-2 border-gray-200 dark:border-slate-700"
            >
              <Text className="text-[11px] font-bold text-gray-700 dark:text-slate-300">
                {showArchived
                  ? L('Archivierte ausblenden', 'Hide archived')
                  : L('Archivierte zeigen', 'Show archived')}
              </Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : rendered.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <Building size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Betriebsstellen', 'No locations yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie auf das Plus-Symbol, um zu beginnen.',
                  'Tap the plus button to create one.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {rendered.map((loc) => (
              <Pressable
                key={loc.id}
                onPress={() => router.push(`/operational-locations/${loc.id}`)}
              >
                <Card style={loc.is_active ? undefined : { opacity: 0.55 }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center flex-wrap">
                        <Text className="text-[15px] font-black text-gray-900 dark:text-white">
                          {loc.short_code ? `${loc.short_code} · ` : ''}
                          {loc.name}
                        </Text>
                        {!loc.is_active && (
                          <View className="ml-2 px-2 py-0.5 rounded-full bg-gray-200">
                            <Text className="text-[9px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-400">
                              {L('Archiviert', 'Archived')}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-[11px] uppercase tracking-widest text-brand font-black mt-1">
                        {L(TYPE_LABEL[loc.type].de, TYPE_LABEL[loc.type].en)}
                      </Text>
                      <View className="mt-1.5">
                        {loc.address && (
                          <View className="flex-row items-center mt-0.5">
                            <MapPin size={12} color="#9CA3AF" />
                            <Text
                              className="text-[11px] text-gray-500 dark:text-slate-400 ml-1.5"
                              numberOfLines={1}
                            >
                              {loc.address}
                            </Text>
                          </View>
                        )}
                        {loc.phone_number && (
                          <View className="flex-row items-center mt-0.5">
                            <Phone size={12} color="#9CA3AF" />
                            <Text className="text-[11px] text-gray-500 dark:text-slate-400 ml-1.5">
                              {loc.phone_number}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {!loc.is_active && <Archive size={16} color="#9CA3AF" />}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/operational-locations/new')}
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
