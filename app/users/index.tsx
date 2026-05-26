/**
 * Org members list — admin-only. Lists every profile with role + status
 * pill. Tap a row to manage. "Add user" lives on the web (admin
 * service-role required); the FAB info card explains why.
 */

import React, { useState, useMemo, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Image, Linking, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import { ChevronLeft, Users as UsersIcon, Info, ExternalLink } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers, ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useSafeBack } from '@/lib/use-safe-back'

export default function UsersScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { profiles, loading, fetchProfiles } = useProfiles()
  const [showInactive, setShowInactive] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchProfiles()
    } finally {
      setRefreshing(false)
    }
  }, [fetchProfiles])

  const webappUrl =
    (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_WEBAPP_URL ??
    process.env.EXPO_PUBLIC_WEBAPP_URL ??
    null

  const sorted = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })
  }, [profiles])

  const activeCount = profiles.filter((p) => p.is_active).length
  const inactiveCount = profiles.length - activeCount

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L('Nur Administratoren können Benutzer verwalten.', 'Only administrators can manage users.')}
        </Text>
      </Screen>
    )
  }

  const rendered = showInactive ? sorted : sorted.filter((p) => p.is_active)

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Mitarbeiter', 'Members')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <UsersIcon size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {activeCount}{' '}
              {L(
                activeCount === 1 ? 'aktiver Mitarbeiter' : 'aktive Mitarbeiter',
                activeCount === 1 ? 'active member' : 'active members',
              )}
            </Text>
            {inactiveCount > 0 && (
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                {inactiveCount} {L('deaktiviert', 'deactivated')}
              </Text>
            )}
          </View>
          {inactiveCount > 0 && (
            <Pressable
              onPress={() => setShowInactive((s) => !s)}
              className="px-3 py-2 rounded-full border-2 border-gray-200 dark:border-slate-700"
            >
              <Text className="text-[11px] font-bold text-gray-700 dark:text-slate-300">
                {showInactive
                  ? L('Inaktive ausblenden', 'Hide inactive')
                  : L('Inaktive zeigen', 'Show inactive')}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Invite-from-web notice */}
        <Card className="mb-4" style={{ backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 } as any}>
          <View className="flex-row items-start">
            <Info size={18} color="#0064E0" style={{ marginTop: 2, marginRight: 10 }} />
            <View className="flex-1">
              <Text className="text-[13px] font-black text-blue-900">
                {L('Neue Mitarbeiter anlegen', 'Add new members')}
              </Text>
              <Text className="text-[12px] text-blue-800 mt-1">
                {L(
                  'Das Anlegen neuer Konten erfolgt in der LokShift-Web-App (Service-Role-Berechtigung erforderlich).',
                  'New accounts are created in the LokShift web app (service-role required).',
                )}
              </Text>
              {webappUrl && (
                <Pressable
                  onPress={() => Linking.openURL(`${webappUrl}/dashboard/users`)}
                  className="flex-row items-center mt-2"
                >
                  <Text className="text-[12px] font-black text-brand">
                    {L('In Web-App öffnen', 'Open in web app')}
                  </Text>
                  <ExternalLink size={14} color="#0064E0" style={{ marginLeft: 4 }} />
                </Pressable>
              )}
            </View>
          </View>
        </Card>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : rendered.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <UsersIcon size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Keine Mitarbeiter', 'No members')}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {rendered.map((p) => {
              const initials = (p.full_name ?? p.email ?? 'U')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              const roleLabel = ROLE_LABELS[p.role][locale]
              const roleColor = ROLE_COLORS[p.role]
              return (
                <Pressable key={p.id} onPress={() => router.push(`/users/${p.id}`)}>
                  <Card style={p.is_active ? undefined : { opacity: 0.55 }}>
                    <View className="flex-row items-center">
                      {p.avatar_url ? (
                        <Image
                          source={{ uri: p.avatar_url }}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 999,
                            marginRight: 12,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 999,
                            backgroundColor: '#EEF2FF',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Text style={{ color: '#0064E0', fontWeight: '900' }}>
                            {initials}
                          </Text>
                        </View>
                      )}
                      <View className="flex-1">
                        <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                          {p.full_name ?? p.email ?? '—'}
                        </Text>
                        {p.email && p.full_name && (
                          <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{p.email}</Text>
                        )}
                        <View className="flex-row items-center mt-1.5">
                          <View
                            className="px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${roleColor}1A` }}
                          >
                            <Text
                              className="text-[9px] font-black uppercase tracking-widest"
                              style={{ color: roleColor }}
                            >
                              {roleLabel}
                            </Text>
                          </View>
                          {!p.is_active && (
                            <View className="ml-2 px-2 py-0.5 rounded-full bg-gray-200">
                              <Text className="text-[9px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-400">
                                {L('Deaktiviert', 'Inactive')}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}
