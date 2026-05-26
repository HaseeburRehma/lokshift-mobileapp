/**
 * Customers list — admin/dispatcher only. Each row shows name + a row
 * of secondary info (contact, phone, mission stats). Tapping the row
 * edits; the FAB creates. Archived rows are dimmed and pushed below
 * active ones; a toggle reveals/hides them.
 */

import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Building2, Plus, Phone, Mail, MapPin, Archive } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'

export default function CustomersScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { customers, loading, fetchCustomers } = useCustomers()
  const [showArchived, setShowArchived] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchCustomers()
    } finally {
      setRefreshing(false)
    }
  }, [fetchCustomers])

  const visible = useMemo(() => {
    return [...customers].sort((a, b) => {
      // Active first, then alphabetical.
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [customers])

  const activeCount = customers.filter((c) => c.is_active).length
  const archivedCount = customers.length - activeCount

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Kunden verwalten.',
            'Only admins or dispatchers can manage customers.',
          )}
        </Text>
      </Screen>
    )
  }

  const rendered = showArchived ? visible : visible.filter((c) => c.is_active)

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Kunden', 'Customers')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Building2 size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {activeCount}{' '}
              {L(
                activeCount === 1 ? 'aktiver Kunde' : 'aktive Kunden',
                activeCount === 1 ? 'active customer' : 'active customers',
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
              <Building2 size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Kunden', 'No customers yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie auf „Kunde hinzufügen", um zu beginnen.',
                  'Tap "Add customer" to create one.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {rendered.map((c) => (
              <Pressable key={c.id} onPress={() => router.push(`/customers/${c.id}`)}>
                <Card style={c.is_active ? undefined : { opacity: 0.55 }}>
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-3">
                      <View className="flex-row items-center">
                        <Text className="text-[15px] font-black text-gray-900 dark:text-white">{c.name}</Text>
                        {!c.is_active && (
                          <View className="ml-2 px-2 py-0.5 rounded-full bg-gray-200">
                            <Text className="text-[9px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-400">
                              {L('Archiviert', 'Archived')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {c.contact_person && (
                        <Text className="text-[12px] text-gray-700 dark:text-slate-300 mt-1 font-semibold">
                          {c.contact_person}
                        </Text>
                      )}
                      <View className="mt-1.5">
                        {c.phone && (
                          <View className="flex-row items-center mt-0.5">
                            <Phone size={12} color="#9CA3AF" />
                            <Text className="text-[11px] text-gray-500 dark:text-slate-400 ml-1.5">{c.phone}</Text>
                          </View>
                        )}
                        {c.email && (
                          <View className="flex-row items-center mt-0.5">
                            <Mail size={12} color="#9CA3AF" />
                            <Text className="text-[11px] text-gray-500 dark:text-slate-400 ml-1.5">{c.email}</Text>
                          </View>
                        )}
                        {c.address && (
                          <View className="flex-row items-center mt-0.5">
                            <MapPin size={12} color="#9CA3AF" />
                            <Text
                              className="text-[11px] text-gray-500 dark:text-slate-400 ml-1.5"
                              numberOfLines={1}
                            >
                              {c.address}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {!c.is_active && <Archive size={16} color="#9CA3AF" />}
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/customers/new')}
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
