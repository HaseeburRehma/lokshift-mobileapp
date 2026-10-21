/**
 * Notification panel — sheet that drops down under the bell in the
 * AppHeader. Mobile port of the webapp's header NotificationPanel:
 *
 *   "Benachrichtigungen" (blue) + red "N neu" pill, "Alle gelesen" and
 *   close; rows with module icon (plans / calendar / customers / shifts /
 *   chat / system), title + body translated to the UI language, blue
 *   unread dot, "VOR 5 MIN." timestamp; empty state "Alles erledigt!".
 *
 * Tapping a row marks it read and opens the linked screen; long-press
 * deletes. "Alle anzeigen" opens the full notifications page.
 */

import React from 'react'
import { Modal, View, Text, Pressable, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Bell, Calendar, CheckCheck, FileText, MessageCircle, Users, X } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useNotifications } from '@/lib/notifications-context'
import { routeForNotification } from '@/lib/notifications/push'
import { timeAgo, translateNotification } from '@/components/nav/notificationText'
import type { NotificationRow } from '@/lib/types'

interface NotificationPanelProps {
  visible: boolean
  onClose: () => void
}

/** Web moduleIcons + moduleBg. */
function iconForModule(type: string) {
  switch (type) {
    case 'plans':
    case 'new_lead':
      return { Icon: type === 'plans' ? FileText : Users, color: '#2563EB', bg: '#EFF6FF' }
    case 'calendar':
      return { Icon: Calendar, color: '#9333EA', bg: '#FAF5FF' }
    case 'customers':
      return { Icon: Users, color: '#059669', bg: '#ECFDF5' }
    case 'shifts':
    case 'job_assigned':
      return { Icon: FileText, color: '#D97706', bg: '#FFFBEB' }
    case 'chat':
      return { Icon: MessageCircle, color: '#4F46E5', bg: '#EEF2FF' }
    case 'system':
      return { Icon: Bell, color: '#6B7280', bg: '#F9FAFB' }
    default:
      return { Icon: Bell, color: '#9CA3AF', bg: '#F9FAFB' }
  }
}

export function NotificationPanel({ visible, onClose }: NotificationPanelProps) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const loc: 'de' | 'en' = locale === 'de' ? 'de' : 'en'
  const { notifications, unreadCount, loading, markAllAsRead, markAsRead, deleteNotification } = useNotifications()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const open = (n: NotificationRow) => {
    if (!n.is_read) markAsRead(n.id)
    const route = routeForNotification({ module: n.type, moduleId: n.module_id ?? null, link: n.link ?? null })
    onClose()
    router.push((route || '/notifications') as any)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop — tap outside closes the sheet */}
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            marginTop: insets.top + 60, marginHorizontal: 8,
            backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#F3F4F6',
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
            elevation: 16, maxHeight: '80%', overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingVertical: 14,
            flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0064E0' }}>
                {L('Benachrichtigungen', 'Notifications')}
              </Text>
              {unreadCount > 0 ? (
                <View style={{ backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: '#DC2626', fontSize: 11, fontWeight: '700' }}>
                    {unreadCount} {L('neu', 'new')}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
              {unreadCount > 0 ? (
                <Pressable onPress={markAllAsRead} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                  <CheckCheck size={14} color="#0064E0" />
                  <Text style={{ marginLeft: 5, color: '#0064E0', fontSize: 11, fontWeight: '600' }}>
                    {L('Alle gelesen', 'Mark all read')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={L('Schließen', 'Close')} style={{ padding: 6, borderRadius: 12 }}>
                <X size={16} color="#9CA3AF" />
              </Pressable>
            </View>
          </View>

          {/* List */}
          <ScrollView style={{ flexGrow: 0 }}>
            {loading && notifications.length === 0 ? (
              <View style={{ padding: 32, gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={{ height: 48, borderRadius: 16, backgroundColor: '#F3F4F6' }} />
                ))}
              </View>
            ) : notifications.length === 0 ? (
              <View style={{ alignItems: 'center', padding: 40 }}>
                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <Bell size={24} color="#D1D5DB" />
                </View>
                <Text style={{ color: '#9CA3AF', fontSize: 14, fontWeight: '700' }}>{L('Alles erledigt!', 'All caught up!')}</Text>
                <Text style={{ color: '#D1D5DB', fontSize: 12, marginTop: 4 }}>{L('Keine neuen Benachrichtigungen.', 'No new notifications.')}</Text>
              </View>
            ) : (
              notifications.map((n: NotificationRow, i: number) => {
                const { Icon, color, bg } = iconForModule(n.type ?? 'system')
                const text = translateNotification(n.title, n.body, loc)
                return (
                  <Pressable key={n.id} onPress={() => open(n)} onLongPress={() => deleteNotification(n.id)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                        backgroundColor: n.is_read ? '#FFFFFF' : 'rgba(239,246,255,0.4)',
                        borderBottomWidth: i === notifications.length - 1 ? 0 : 1,
                        borderBottomColor: '#F9FAFB',
                      }}
                    >
                      <View style={{
                        width: 36, height: 36, borderRadius: 16, backgroundColor: bg,
                        alignItems: 'center', justifyContent: 'center', marginTop: 2, marginRight: 12,
                      }}>
                        <Icon size={16} color={color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                          <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: n.is_read ? '500' : '700', color: n.is_read ? '#4B5563' : '#111827' }}>
                            {text.title}
                          </Text>
                          {!n.is_read ? <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#0064E0', marginTop: 6 }} /> : null}
                        </View>
                        {text.body ? (
                          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={2}>
                            {text.body}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 }}>
                          {timeAgo(n.created_at, loc)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                )
              })
            )}
          </ScrollView>

          {/* Footer — full page (mobile) */}
          <Pressable
            onPress={() => {
              onClose()
              router.push('/notifications')
            }}
            style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Alle anzeigen', 'View all')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
