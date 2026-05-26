/**
 * Notification panel — dropdown overlay that anchors to the bell icon
 * in the AppHeader. Mirrors the webapp's NotificationPanel:
 *
 *   "Benachrichtigungen" 18px bold blue-600 + small "X neu" red pill
 *   right-side "Alle gelesen" link + close button
 *   scrollable list of notifications with module-typed icons,
 *   "VOR N TAG(EN)" relative timestamps, and a blue unread dot.
 *
 * Tapping a row marks it read; long-press deletes (handled by the
 * provider). Tapping outside (the scrim) closes the panel.
 */

import React from 'react'
import { Modal, View, Text, Pressable, ScrollView } from 'react-native'
import { Bell, CheckCircle2, Calendar, AlertCircle, X, Trash2, Briefcase, MessageCircle } from 'lucide-react-native'
import { formatDistanceToNow } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { useTranslation } from '@/lib/i18n'
import { useNotifications } from '@/lib/notifications-context'
import type { NotificationRow } from '@/lib/types'

interface NotificationPanelProps {
  visible: boolean
  onClose: () => void
}

function iconForType(type: string) {
  switch (type) {
    case 'plans':
    case 'shifts':
      return { Icon: Briefcase, color: '#0064E0', bg: 'rgba(0,100,224,0.08)' }
    case 'calendar':
      return { Icon: Calendar, color: '#0064E0', bg: 'rgba(0,100,224,0.08)' }
    case 'time_entries':
      return { Icon: CheckCircle2, color: '#10B981', bg: 'rgba(16,185,129,0.08)' }
    case 'chat':
      return { Icon: MessageCircle, color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' }
    case 'system':
      return { Icon: AlertCircle, color: '#F97316', bg: 'rgba(249,115,22,0.08)' }
    default:
      return { Icon: Bell, color: '#64748B', bg: 'rgba(100,116,139,0.08)' }
  }
}

export function NotificationPanel({ visible, onClose }: NotificationPanelProps) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { notifications, unreadCount, markAllAsRead, markAsRead, deleteNotification } = useNotifications()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Scrim — taps anywhere outside close the panel */}
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            marginTop: 92, marginHorizontal: 12,
            backgroundColor: '#FFFFFF', borderRadius: 24,
            shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
            elevation: 16, maxHeight: 560, overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View style={{
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#0064E0' }}>
                {L('Benachrichtigungen', 'Notifications')}
              </Text>
              {unreadCount > 0 && (
                <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                  <Text style={{ color: '#DC2626', fontSize: 10, fontWeight: '900' }}>
                    {unreadCount} {L('neu', 'new')}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {unreadCount > 0 && (
                <Pressable onPress={markAllAsRead} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                  <Text style={{ color: '#0064E0', fontSize: 12, fontWeight: '700' }}>
                    ✓ {L('Alle gelesen', 'Mark all read')}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={onClose} hitSlop={8} style={{ padding: 6 }}>
                <X size={18} color="#64748B" />
              </Pressable>
            </View>
          </View>

          {/* List */}
          <ScrollView style={{ maxHeight: 480 }} contentContainerStyle={{ paddingVertical: 4 }}>
            {notifications.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                <Bell size={32} color="#D1D5DB" />
                <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 12 }}>
                  {L('Keine Benachrichtigungen.', 'No notifications.')}
                </Text>
              </View>
            ) : (
              notifications.map((n: NotificationRow) => {
                const { Icon, color, bg } = iconForType((n as any).type ?? 'system')
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => !n.is_read && markAsRead(n.id)}
                    onLongPress={() => deleteNotification(n.id)}
                    style={({ pressed }: { pressed: boolean }) => ({
                      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
                      paddingHorizontal: 20, paddingVertical: 14,
                      backgroundColor: pressed ? '#F8FAFC' : 'transparent',
                      borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
                    })}
                  >
                    <View style={{
                      width: 36, height: 36, borderRadius: 10, backgroundColor: bg,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={16} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text
                          style={{
                            fontSize: 13, fontWeight: '900', color: '#0F172A', flex: 1,
                            opacity: n.is_read ? 0.7 : 1,
                          }}
                          numberOfLines={1}
                        >
                          {n.title}
                        </Text>
                        {!n.is_read && (
                          <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: '#0064E0', marginLeft: 8 }} />
                        )}
                      </View>
                      {n.body ? (
                        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }} numberOfLines={2}>
                          {n.body}
                        </Text>
                      ) : null}
                      <Text style={{
                        fontSize: 9, fontWeight: '900', color: '#94A3B8',
                        textTransform: 'uppercase', letterSpacing: 1, marginTop: 6,
                      }}>
                        {L('Vor', '')} {formatDistanceToNow(new Date(n.created_at), { locale: dateLocale })}
                      </Text>
                    </View>
                  </Pressable>
                )
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
