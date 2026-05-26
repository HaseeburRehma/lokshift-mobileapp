/**
 * Conversation thread — realtime messages, optimistic send, typing
 * indicator, presence dot, scroll-to-bottom on new messages.
 *
 * No media yet (image / file / voice attachments arrive in priorities
 * #17/#18 once the picker / recorder deps are approved).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Send,
  Users as UsersIcon,
  User as UserIcon,
  Check,
  CheckCheck,
} from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { toast } from '@/components/Toast'
import { AttachmentButton } from '@/components/chat/AttachmentButton'
import { VoiceRecorder } from '@/components/chat/VoiceRecorder'
import { AttachmentBubble } from '@/components/chat/AttachmentBubble'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useConversations } from '@/hooks/useConversations'
import { useMessages } from '@/hooks/useMessages'
import { usePresence } from '@/hooks/usePresence'
import { useTyping } from '@/hooks/useTyping'
import { ROLE_COLORS } from '@/lib/rbac/permissions'
import { uploadChatAttachment, type ChatAttachmentSource } from '@/lib/chat/storage'
import { useSafeBack } from '@/lib/use-safe-back'

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/chat')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const myId = session?.user?.id ?? null

  const conversationId = id ?? null
  const { conversations } = useConversations()
  const conv = useMemo(
    () => conversations.find((c) => c.id === conversationId) ?? null,
    [conversations, conversationId],
  )

  const { messages, loading, sendMessage } = useMessages(conversationId)
  const { isOnline } = usePresence()
  const { typingUserIds, broadcastTyping } = useTyping(conversationId)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const scrollRef = useRef<ScrollView | null>(null)

  // Scroll to bottom on new messages.
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80)
    return () => clearTimeout(t)
  }, [messages.length])

  const otherId =
    conv && !conv.is_group
      ? conv.members?.find((m) => m.user_id !== myId)?.user_id ?? null
      : null
  const headerName = conv?.is_group
    ? conv.name ?? L('Gruppe', 'Group')
    : conv?.members?.find((m) => m.user_id !== myId)?.profile?.full_name ??
      L('Chat', 'Chat')
  const headerAvatar = conv?.is_group
    ? conv.avatar_url ?? null
    : conv?.members?.find((m) => m.user_id !== myId)?.profile?.avatar_url ?? null
  const online = otherId ? isOnline(otherId) : false

  const othersTyping = useMemo(() => {
    return Array.from(typingUserIds)
      .map((uid) => conv?.members?.find((m) => m.user_id === uid)?.profile)
      .filter(Boolean)
  }, [typingUserIds, conv?.members])

  const onSend = async () => {
    const content = draft.trim()
    if (!content) return
    setSending(true)
    setDraft('')
    try {
      await sendMessage(content)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
      setDraft(content)
    } finally {
      setSending(false)
    }
  }

  const sendAttachment = async (source: ChatAttachmentSource) => {
    if (!conversationId) return
    setUploading(true)
    try {
      const uploaded = await uploadChatAttachment(source, conversationId)
      await sendMessage('', {
        url: uploaded.url,
        type: uploaded.type,
        name: uploaded.name,
      })
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      {/* Header */}
      <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={24} color="#0064E0" />
        </Pressable>
        <View className="relative mx-2">
          {headerAvatar ? (
            <Image
              source={{ uri: headerAvatar }}
              style={{ width: 36, height: 36, borderRadius: 999 }}
            />
          ) : (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: conv?.is_group ? '#FEF3C7' : '#EEF2FF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {conv?.is_group ? (
                <UsersIcon size={18} color="#B45309" />
              ) : (
                <UserIcon size={18} color="#0064E0" />
              )}
            </View>
          )}
          {!conv?.is_group && online && (
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 12,
                height: 12,
                borderRadius: 999,
                backgroundColor: '#10B981',
                borderWidth: 2,
                borderColor: '#fff',
              }}
            />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
            {headerName}
          </Text>
          <Text className="text-[11px] text-gray-500 dark:text-slate-400" numberOfLines={1}>
            {conv?.is_group
              ? L(
                  `${conv?.members?.length ?? 0} Mitglieder`,
                  `${conv?.members?.length ?? 0} members`,
                )
              : online
              ? L('Online', 'Online')
              : L('Offline', 'Offline')}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r
          }}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {loading ? (
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          ) : messages.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400">
                {L('Noch keine Nachrichten', 'No messages yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center max-w-[260px]">
                {L(
                  'Schreiben Sie unten die erste Nachricht.',
                  'Type the first message below.',
                )}
              </Text>
            </View>
          ) : (
            messages.map((m, idx) => {
              const mine = m.sender_id === myId
              const prev = messages[idx - 1]
              const showHeader =
                !mine && (!prev || prev.sender_id !== m.sender_id)
              const senderName = m.sender?.full_name ?? L('Mitarbeiter', 'Member')
              const senderColor =
                m.sender?.role && (m.sender.role as keyof typeof ROLE_COLORS) in ROLE_COLORS
                  ? ROLE_COLORS[m.sender.role as keyof typeof ROLE_COLORS]
                  : '#0064E0'
              return (
                <View key={m.id} style={{ marginBottom: 4 }}>
                  {showHeader && (
                    <Text
                      className="text-[10px] font-black uppercase tracking-widest ml-3 mb-0.5"
                      style={{ color: senderColor }}
                    >
                      {senderName}
                    </Text>
                  )}
                  <View
                    style={{
                      alignSelf: mine ? 'flex-end' : 'flex-start',
                      maxWidth: '78%',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 18,
                      backgroundColor: mine ? '#0064E0' : '#fff',
                      borderColor: mine ? '#0064E0' : '#E5E7EB',
                      borderWidth: 1,
                    }}
                  >
                    {m.attachment_url && m.attachment_type && (
                      <AttachmentBubble
                        url={m.attachment_url}
                        type={m.attachment_type}
                        name={m.attachment_name}
                        mine={mine}
                      />
                    )}
                    {m.content ? (
                      <Text
                        style={{
                          color: mine ? '#fff' : '#111827',
                          fontSize: 14,
                          marginTop: m.attachment_url ? 6 : 0,
                        }}
                      >
                        {m.content}
                      </Text>
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        marginTop: 2,
                        gap: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: mine ? '#BFDBFE' : '#94A3B8',
                          fontSize: 9,
                        }}
                      >
                        {format(new Date(m.created_at), 'HH:mm')}
                      </Text>
                      {mine && !m.id.startsWith('optimistic-') && (() => {
                        const otherMembers = (conv?.members ?? []).filter(
                          (mb) => mb.user_id !== myId,
                        )
                        const msgTs = new Date(m.created_at).getTime()
                        const readers = otherMembers.filter(
                          (mb) =>
                            mb.last_read_at &&
                            new Date(mb.last_read_at).getTime() >= msgTs,
                        ).length
                        const allRead = otherMembers.length > 0 && readers === otherMembers.length
                        const someRead = readers > 0
                        const tint = allRead ? '#7FB6FF' : '#BFDBFE'
                        if (conv?.is_group && otherMembers.length > 1 && someRead) {
                          return (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <CheckCheck size={12} color={tint} />
                              <Text style={{ color: tint, fontSize: 9, fontWeight: '700' }}>
                                {readers}/{otherMembers.length}
                              </Text>
                            </View>
                          )
                        }
                        return someRead || allRead ? (
                          <CheckCheck size={12} color={tint} />
                        ) : (
                          <Check size={12} color="#BFDBFE" />
                        )
                      })()}
                    </View>
                  </View>
                </View>
              )
            })
          )}

          {othersTyping.length > 0 && (
            <View className="flex-row items-center px-3 mt-1">
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  backgroundColor: '#F1F5F9',
                }}
              >
                <Text className="text-[11px] text-gray-500 dark:text-slate-400 italic">
                  {othersTyping.length === 1
                    ? L(
                        `${othersTyping[0]?.full_name ?? 'Jemand'} tippt…`,
                        `${othersTyping[0]?.full_name ?? 'Someone'} is typing…`,
                      )
                    : L('Mehrere tippen…', 'Multiple typing…')}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Composer — VoiceRecorder takes over the bar while recording */}
        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onSend={async (source) => {
              setRecording(false)
              await sendAttachment(source)
            }}
          />
        ) : (
          <View
            className="flex-row items-end px-3 py-2 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800"
            style={{ paddingBottom: Platform.OS === 'ios' ? 8 : 12 }}
          >
            <AttachmentButton
              disabled={sending || uploading}
              onPick={sendAttachment}
              onStartVoice={() => setRecording(true)}
            />
            <View
              style={{
                flex: 1,
                backgroundColor: '#F1F5F9',
                borderRadius: 22,
                paddingHorizontal: 14,
                paddingVertical: 8,
                maxHeight: 120,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              <TextInput
                value={draft}
                onChangeText={(v) => {
                  setDraft(v)
                  broadcastTyping()
                }}
                placeholder={
                  uploading
                    ? L('Anhang wird hochgeladen…', 'Uploading attachment…')
                    : L('Nachricht…', 'Message…')
                }
                placeholderTextColor="#94A3B8"
                multiline
                editable={!uploading}
                style={{ fontSize: 14, color: '#111827', maxHeight: 100 }}
              />
            </View>
            <Pressable
              onPress={onSend}
              disabled={!draft.trim() || sending || uploading}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor:
                  draft.trim() && !sending && !uploading ? '#0064E0' : '#CBD5E1',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 8,
              }}
            >
              <Send size={20} color="#fff" />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}
