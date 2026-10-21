/**
 * Notifications page — mobile port of the webapp's
 * /dashboard/notifications: "Benachrichtigungen" + subtitle, "Alle als
 * gelesen markieren", cards with module icon, title, relative time, body,
 * unread dot and delete. Live updates come from the shared
 * NotificationsProvider (one realtime channel for the whole app).
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { AlertCircle, Bell, Calendar, ChevronLeft, MessageSquare, Trash2 } from 'lucide-react-native'
import { formatDistanceToNow } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { safeParseISO } from '@/lib/safe-format'
import { useTranslation } from '@/lib/i18n'
import { useNotifications } from '@/lib/notifications-context'
import { routeForNotification } from '@/lib/notifications/push'
import { useSafeBack } from '@/lib/use-safe-back'
import { translateNotification } from '@/components/nav/notificationText'
import type { NotificationRow } from '@/lib/types'

/** Web iconForModule: plans/calendar/shifts blue, chat violet, system orange, else emerald. */
function iconForModule(type: string) {
  switch (type) {
    case 'plans':
    case 'calendar':
    case 'shifts':
      return { Icon: Calendar, bg: '#EFF6FF', fg: '#0064E0', border: '#DBEAFE' }
    case 'chat':
      return { Icon: MessageSquare, bg: '#F5F3FF', fg: '#7C3AED', border: '#EDE9FE' }
    case 'system':
      return { Icon: AlertCircle, bg: '#FFF7ED', fg: '#EA580C', border: '#FFEDD5' }
    default:
      return { Icon: Bell, bg: '#ECFDF5', fg: '#059669', border: '#D1FAE5' }
  }
}

export default function NotificationsScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const loc: 'de' | 'en' = locale === 'de' ? 'de' : 'en'
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/home')
  const { notifications, loading, unreadCount, markAllAsRead, markAsRead, deleteNotification, refetch } = useNotifications()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const allRead = unreadCount === 0

  const open = (n: NotificationRow) => {
    if (!n.is_read) markAsRead(n.id)
    const route = routeForNotification({ module: n.type, moduleId: n.module_id ?? null, link: n.link ?? null })
    if (route && route !== '/notifications') router.push(route as any)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
        >
          <Pressable
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
            accessibilityLabel={L('Zurück', 'Back')}
            style={{ width: 44, height: 44, marginLeft: -8, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={26} color="#0064E0" />
          </Pressable>

          {/* Header */}
          <View style={{ marginBottom: 20, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 30, fontWeight: '900', color: '#111827', letterSpacing: -0.5 }}>
              {L('Benachrichtigungen', 'Notifications')}
            </Text>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748B', marginTop: 4, lineHeight: 20 }}>
              {L(
                'Bleiben Sie über Ihre Einsätze und Systemereignisse auf dem Laufenden.',
                'Stay updated with your latest assignments and system events.',
              )}
            </Text>
            <Pressable
              onPress={markAllAsRead}
              disabled={loading || allRead}
              style={{ alignSelf: 'flex-start', marginTop: 10, height: 44, borderRadius: 16, paddingHorizontal: 12, marginLeft: -12, justifyContent: 'center', opacity: loading || allRead ? 0.5 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0064E0' }}>
                {L('Alle als gelesen markieren', 'Mark All as Read')}
              </Text>
            </Pressable>
          </View>

          {loading && notifications.length === 0 ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <ActivityIndicator color="#D1D5DB" />
            </View>
          ) : notifications.length === 0 ? (
            <View style={{ paddingVertical: 80, alignItems: 'center' }}>
              <Bell size={64} color="#E5E7EB" />
              <Text style={{ marginTop: 16, fontSize: 15, fontWeight: '700', color: '#9CA3AF' }}>
                {L('Sie sind auf dem neuesten Stand!', "You're all caught up!")}
              </Text>
            </View>
          ) : (
            notifications.map((n) => {
              const { Icon, bg, fg, border } = iconForModule(n.type ?? 'system')
              const text = translateNotification(n.title, n.body, loc)
              const created = safeParseISO(n.created_at)
              return (
                <Pressable key={n.id} onPress={() => open(n)}>
                  <View
                    style={{
                      flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF',
                      borderWidth: 1, borderColor: n.is_read ? '#F3F4F6' : 'rgba(0,100,224,0.2)',
                      borderRadius: 28, padding: 20, marginBottom: 8, opacity: n.is_read ? 0.8 : 1,
                    }}
                  >
                    <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <Icon size={22} color={fg} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 14 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>{text.title}</Text>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: '#9CA3AF', textTransform: 'uppercase', marginTop: 3 }}>
                        {created ? formatDistanceToNow(created, { addSuffix: true, locale: dateLocale }) : '—'}
                      </Text>
                      {text.body ? (
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#6B7280', lineHeight: 19, marginTop: 6 }}>
                          {text.body}
                        </Text>
                      ) : null}
                    </View>
                    {!n.is_read ? (
                      <View style={{ position: 'absolute', top: 22, right: 20, width: 8, height: 8, borderRadius: 999, backgroundColor: '#0064E0' }} />
                    ) : null}
                    <Pressable
                      onPress={() => deleteNotification(n.id)}
                      hitSlop={8}
                      accessibilityLabel={L('Löschen', 'Delete')}
                      style={{ position: 'absolute', bottom: 12, right: 12, padding: 6, borderRadius: 12 }}
                    >
                      <Trash2 size={16} color="#D1D5DB" />
                    </Pressable>
                  </View>
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </Screen>
    </View>
  )
}
