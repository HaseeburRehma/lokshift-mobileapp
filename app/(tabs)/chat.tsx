/**
 * Team Chat — conversation list. Tap a row to open the thread; tap the
 * FAB to start a new DM or group.
 *
 * Online presence dots are driven by usePresence so the avatar shows a
 * green dot when the other party (or any group member) is currently
 * online in the org.
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, Pressable, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { MessageCircle, Plus, Users as UsersIcon } from 'lucide-react-native'
import { formatDistanceToNow } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useConversations } from '@/hooks/useConversations'
import { usePresence } from '@/hooks/usePresence'
import type { ChatConversation } from '@/lib/types'

function conversationDisplayName(
  conv: ChatConversation,
  myId: string | null,
  fallback: { de: string; en: string },
  locale: 'de' | 'en',
): string {
  if (conv.is_group) {
    return conv.name ?? (locale === 'de' ? 'Gruppe' : 'Group')
  }
  const other = conv.members?.find((m) => m.user_id !== myId)?.profile
  return other?.full_name ?? other?.email ?? (locale === 'de' ? fallback.de : fallback.en)
}

function conversationAvatar(conv: ChatConversation, myId: string | null): string | null {
  if (conv.is_group) return conv.avatar_url ?? null
  const other = conv.members?.find((m) => m.user_id !== myId)?.profile
  return other?.avatar_url ?? null
}

export default function ChatScreen() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const { conversations, loading } = useConversations()
  const { isOnline } = usePresence()

  const sorted = useMemo(() => {
    return [...conversations].sort(
      (a, b) =>
        new Date(b.last_message?.created_at ?? b.updated_at).getTime() -
        new Date(a.last_message?.created_at ?? a.updated_at).getTime(),
    )
  }, [conversations])

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140 }}>
        <Text className="text-[28px] font-black text-brand tracking-tight mb-1">
          {L('Chat', 'Chat')}
        </Text>
        <Text className="text-[13px] text-gray-400 dark:text-slate-500 mb-6">
          {L('Direkt- und Gruppenchats für das gesamte Team', 'Direct + group messaging for the team')}
        </Text>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <View className="items-center py-10">
              <MessageCircle size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Chats', 'No conversations yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center max-w-[260px]">
                {L(
                  'Tippen Sie auf das Plus-Symbol, um einen neuen Chat zu starten.',
                  'Tap the plus button to start a new conversation.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-2">
            {sorted.map((conv) => {
              const name = conversationDisplayName(conv, myId, { de: 'Chat', en: 'Chat' }, locale)
              const avatar = conversationAvatar(conv, myId)
              const otherId = conv.is_group
                ? null
                : conv.members?.find((m) => m.user_id !== myId)?.user_id ?? null
              const online = otherId ? isOnline(otherId) : false
              const initials = name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase() || '?'
              const unread = conv.unread_count ?? 0
              const lastMsg = conv.last_message
              const preview = (() => {
                if (!lastMsg) return locale === 'de' ? 'Neuer Chat' : 'New chat'
                if (lastMsg.content && lastMsg.content.trim()) return lastMsg.content
                if (lastMsg.attachment_type === 'image') return '📷 Bild'
                if (lastMsg.attachment_type === 'audio') return '🎤 Sprachnachricht'
                if (lastMsg.attachment_type === 'file')
                  return `📎 ${lastMsg.attachment_name ?? ''}`.trim()
                return locale === 'de' ? 'Anhang' : 'Attachment'
              })()
              const when = lastMsg?.created_at ?? conv.updated_at
              const ago = formatDistanceToNow(new Date(when), {
                addSuffix: false,
                locale: dateLocale,
              })

              return (
                <Pressable
                  key={conv.id}
                  onPress={() => router.push(`/chat/${conv.id}`)}
                >
                  <View className="flex-row items-center px-3 py-3 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
                    <View className="relative mr-3">
                      {avatar ? (
                        <Image
                          source={{ uri: avatar }}
                          style={{ width: 48, height: 48, borderRadius: 999 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 999,
                            backgroundColor: conv.is_group ? '#FEF3C7' : '#EEF2FF',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {conv.is_group ? (
                            <UsersIcon size={22} color="#B45309" />
                          ) : (
                            <Text style={{ color: '#0064E0', fontWeight: '900' }}>
                              {initials}
                            </Text>
                          )}
                        </View>
                      )}
                      {!conv.is_group && online && (
                        <View
                          style={{
                            position: 'absolute',
                            right: -2,
                            bottom: -2,
                            width: 14,
                            height: 14,
                            borderRadius: 999,
                            backgroundColor: '#10B981',
                            borderWidth: 2,
                            borderColor: '#fff',
                          }}
                        />
                      )}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center justify-between">
                        <Text
                          className="text-[14px] font-black text-gray-900 dark:text-white flex-1"
                          numberOfLines={1}
                        >
                          {name}
                        </Text>
                        <Text className="text-[10px] text-gray-400 dark:text-slate-500 ml-2">{ago}</Text>
                      </View>
                      <View className="flex-row items-center mt-0.5">
                        <Text
                          className="text-[12px] text-gray-500 dark:text-slate-400 flex-1"
                          numberOfLines={1}
                          style={{ fontWeight: unread > 0 ? '700' : '400' }}
                        >
                          {preview}
                        </Text>
                        {unread > 0 && (
                          <View className="ml-2 min-w-[20px] h-[20px] px-1.5 rounded-full bg-brand items-center justify-center">
                            <Text className="text-[10px] font-black text-white">
                              {unread > 99 ? '99+' : unread}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/chat/new')}
        className="absolute bottom-[110px] right-6 w-16 h-16 rounded-full bg-brand items-center justify-center"
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
