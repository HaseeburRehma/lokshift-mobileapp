/**
 * Notifications tab — in-app feed, live updates via Supabase realtime.
 * Push notifications (expo-notifications) are scaffolded but not wired
 * to a backend dispatch in v1.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { Bell, CheckCircle, Calendar, AlertCircle, Inbox } from 'lucide-react-native'
import { formatDistanceToNow } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { useTranslation } from '@/lib/i18n'
import { useNotifications } from '@/lib/notifications-context'

export default function NotificationsScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { notifications, loading, unreadCount, markAllAsRead, refetch } = useNotifications()
  const dateLocale = locale === 'de' ? deLocale : enUS

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        <PageHeader
          showBack
          title={L('Benachrichtigungen', 'Notifications')}
          subtitle={unreadCount > 0 ? `${unreadCount} ${L('ungelesen', 'unread')}` : undefined}
          rightSlot={unreadCount > 0 ? (
            <Pressable onPress={markAllAsRead}>
              <Text style={{ color: '#0064E0', fontWeight: '700', fontSize: 12 }}>
                {L('Alle als gelesen', 'Mark all read')}
              </Text>
            </Pressable>
          ) : null}
        />

        {notifications.length === 0 && !loading ? (
          <Card className="items-center py-12">
            <Inbox size={32} color="#D1D5DB" />
            <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">
              {L('Keine Benachrichtigungen.', 'No notifications.')}
            </Text>
          </Card>
        ) : null}

        {notifications.map((n) => {
          const Icon = iconForType(n.type)
          const accent = colorForType(n.type)
          return (
            <Card key={n.id} className={`mb-2 flex-row ${n.is_read ? 'opacity-70' : ''}`}>
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: `${accent}1A` }}
              >
                <Icon size={18} color={accent} />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[14px] font-black text-gray-900 dark:text-white flex-1">{n.title}</Text>
                  {!n.is_read && <View className="w-2 h-2 rounded-full bg-brand ml-2" />}
                </View>
                {n.body && (
                  <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">{n.body}</Text>
                )}
                <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-2">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: dateLocale })}
                </Text>
              </View>
            </Card>
          )
        })}
      </ScrollView>
      </Screen>
    </View>
  )
}

function iconForType(type: string) {
  if (type === 'plans' || type === 'calendar' || type === 'shifts') return Calendar
  if (type === 'system') return AlertCircle
  if (type === 'time_entries') return CheckCircle
  return Bell
}

function colorForType(type: string): string {
  if (type === 'plans' || type === 'calendar' || type === 'shifts') return '#0064E0'
  if (type === 'system') return '#F97316'
  if (type === 'time_entries') return '#10B981'
  return '#6B7280'
}
