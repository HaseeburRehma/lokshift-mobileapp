/**
 * Conversation thread — mobile port of the webapp's ChatRoom: header
 * with avatar, online dot, role badge and "ONLINE / OFFLINE / N
 * MITGLIEDER"; bubbles (own blue, others white with avatar), time and
 * read receipts under the bubble, typing indicator, composer with
 * attachment button, input and mic / send.
 *
 * Realtime messages, optimistic send, presence, typing and attachments
 * (image / file / voice) are unchanged.
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
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Send,
  Mic,
  Check,
  CheckCheck,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { safeFormatTime, safeParseISO } from '@/lib/safe-format'
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
import { RoleBadge } from '@/components/nav/RoleBadge'
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
  const { conversations, loading: convLoading } = useConversations()
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
  const headerRole = conv && !conv.is_group
    ? conv.members?.find((m) => m.user_id !== myId)?.profile?.role ?? null
    : null
  const online = otherId ? isOnline(otherId) : false

  const othersTyping = useMemo(() => {
    return Array.from(typingUserIds)
      .map((uid) => conv?.members?.find((m) => m.user_id === uid)?.profile)
      .filter(Boolean)
  }, [typingUserIds, conv?.members])

  // Precompute read-receipts ONCE per render instead of per message.
  // Map message.id → { readers, total } so the render loop is O(1) lookup.
  const readReceiptsByMsgId = useMemo(() => {
    const out = new Map<string, { readers: number; total: number }>()
    const otherMembers = (conv?.members ?? []).filter((mb) => mb.user_id !== myId)
    const total = otherMembers.length
    if (total === 0) return out
    const readerTimes: number[] = otherMembers
      .map((mb) => {
        if (!mb.last_read_at) return null
        const d = safeParseISO(mb.last_read_at)
        return d ? d.getTime() : null
      })
      .filter((t): t is number => t !== null)
    for (const m of messages) {
      if (m.sender_id !== myId || m.id.startsWith('optimistic-')) continue
      const msgD = safeParseISO(m.created_at)
      const msgTs = msgD ? msgD.getTime() : 0
      let readers = 0
      for (const rt of readerTimes) if (rt >= msgTs) readers++
      out.set(m.id, { readers, total })
    }
    return out
  }, [conv?.members, messages, myId])

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

  if (!convLoading && !conv) {
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 12, textAlign: 'center' }}>
            {L('Unterhaltung nicht gefunden', 'Conversation not found')}
          </Text>
          <Pressable onPress={goBack} hitSlop={8}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#2563EB' }}>{L('Zurück zu Chats', 'Back to chats')}</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  const typingNames = othersTyping.map((p: any) => (p?.full_name ?? '').split(' ')[0]).filter(Boolean)
  const typingLabel =
    typingNames.length === 0
      ? L('Jemand tippt…', 'Someone is typing…')
      : typingNames.length === 1
        ? L(`${typingNames[0]} tippt…`, `${typingNames[0]} is typing...`)
        : typingNames.length === 2
          ? L(`${typingNames[0]} und ${typingNames[1]} tippen…`, `${typingNames[0]} and ${typingNames[1]} are typing...`)
          : L(`${typingNames[0]} und ${typingNames.length - 1} weitere tippen…`, `${typingNames[0]} and ${typingNames.length - 1} others are typing...`)

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
        <Pressable onPress={goBack} hitSlop={8} style={{ padding: 6, marginLeft: -6, marginRight: 4 }} accessibilityLabel={L('Zurück', 'Back')}>
          <ChevronLeft size={22} color="#9CA3AF" />
        </Pressable>
        <View style={{ marginRight: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#F3F4F6', overflow: 'hidden', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            {headerAvatar ? (
              <Image source={{ uri: headerAvatar }} style={{ width: 40, height: 40 }} />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#9CA3AF' }}>{headerName?.[0]?.toUpperCase() || '?'}</Text>
            )}
          </View>
          {!conv?.is_group ? (
            <View
              style={{
                position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 999,
                backgroundColor: online ? '#22C55E' : '#D1D5DB', borderWidth: 2, borderColor: '#FFFFFF',
              }}
            />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
              {headerName}
            </Text>
            {headerRole ? <RoleBadge role={headerRole} /> : null}
          </View>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
            {conv?.is_group
              ? L(`${conv?.members?.length ?? 0} Mitglieder`, `${conv?.members?.length ?? 0} members`)
              : online
                ? L('Online', 'Online')
                : L('Offline', 'Offline')}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#FAFBFC' }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          ref={(r) => {
            scrollRef.current = r
          }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 20, flexGrow: 1 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {loading || convLoading ? (
            <ActivityIndicator color="#3B82F6" style={{ marginTop: 32 }} />
          ) : messages.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
              <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <Send size={20} color="#D1D5DB" />
              </View>
              <Text style={{ fontSize: 14, color: '#9CA3AF', textAlign: 'center', maxWidth: 260 }}>
                {L('Sende die erste Nachricht, um die Unterhaltung zu beginnen.', 'Send the first message to start the conversation.')}
              </Text>
            </View>
          ) : (
            messages.map((m, idx) => {
              const mine = m.sender_id === myId
              const prev = messages[idx - 1]
              const showSender = !!conv?.is_group && !mine && (!prev || prev.sender_id !== m.sender_id)
              const senderName = m.sender?.full_name ?? L('Mitarbeiter', 'Member')
              const senderAvatar = (m.sender as any)?.avatar_url ?? null
              const receipt = mine && !m.id.startsWith('optimistic-') ? readReceiptsByMsgId.get(m.id) ?? null : null
              return (
                <View key={m.id} style={{ marginBottom: 12, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {showSender ? (
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#6B7280', marginBottom: 4, marginLeft: 44 }}>
                      {senderName}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', maxWidth: '82%' }}>
                    {!mine ? (
                      <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: '#F3F4F6', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                        {senderAvatar ? (
                          <Image source={{ uri: senderAvatar }} style={{ width: 32, height: 32 }} />
                        ) : (
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#9CA3AF' }}>{senderName?.[0]?.toUpperCase() || '?'}</Text>
                        )}
                      </View>
                    ) : null}
                    <View style={{ flexShrink: 1 }}>
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 16,
                          borderBottomRightRadius: mine ? 4 : 16,
                          borderBottomLeftRadius: mine ? 16 : 4,
                          backgroundColor: mine ? '#0064E0' : '#FFFFFF',
                          borderColor: mine ? '#0064E0' : '#F3F4F6',
                          borderWidth: 1,
                        }}
                      >
                        {m.attachment_url && m.attachment_type ? (
                          <AttachmentBubble
                            url={m.attachment_url}
                            type={m.attachment_type}
                            name={m.attachment_name}
                            mine={mine}
                          />
                        ) : null}
                        {m.content && !(m.attachment_type === 'audio' && m.content === '🎤 Voice message') ? (
                          <Text
                            style={{
                              color: mine ? '#FFFFFF' : '#1F2937',
                              fontSize: 14,
                              lineHeight: 21,
                              marginTop: m.attachment_url ? 6 : 0,
                            }}
                          >
                            {m.content}
                          </Text>
                        ) : null}
                      </View>
                      {/* Time + read receipt under the bubble (web) */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: mine ? 'flex-end' : 'flex-start', gap: 4, marginTop: 3, paddingHorizontal: 4 }}>
                        <Text style={{ color: '#9CA3AF', fontSize: 10, fontWeight: '500' }}>
                          {safeFormatTime(m.created_at)}
                        </Text>
                        {mine && !m.id.startsWith('optimistic-') ? (() => {
                          if (!receipt) return <Check size={12} color="#93C5FD" />
                          const { readers, total } = receipt
                          const allRead = total > 0 && readers === total
                          const someRead = readers > 0
                          const tint = allRead ? '#3B82F6' : '#93C5FD'
                          if (conv?.is_group && total > 1 && someRead) {
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                <CheckCheck size={12} color={tint} />
                                <Text style={{ color: tint, fontSize: 9, fontWeight: '700' }}>
                                  {readers}/{total}
                                </Text>
                              </View>
                            )
                          }
                          return someRead || allRead ? (
                            <CheckCheck size={12} color={tint} />
                          ) : (
                            <Check size={12} color="#93C5FD" />
                          )
                        })() : null}
                      </View>
                    </View>
                  </View>
                </View>
              )
            })
          )}

          {othersTyping.length > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 6 }}>
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 16, borderBottomLeftRadius: 0 }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#9CA3AF' }} />
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#9CA3AF' }} />
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#9CA3AF' }} />
              </View>
              <Text style={{ marginLeft: 10, fontSize: 12, fontWeight: '500', color: '#6B7280', fontStyle: 'italic' }} numberOfLines={1}>
                {typingLabel}
              </Text>
            </View>
          ) : null}
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
            style={{
              flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12,
              paddingBottom: Platform.OS === 'ios' ? 12 : 14,
              backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 8,
            }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <AttachmentButton
                disabled={sending || uploading}
                onPick={sendAttachment}
                onStartVoice={() => setRecording(true)}
              />
            </View>
            <View
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 120,
                backgroundColor: '#F9FAFB',
                borderWidth: 1,
                borderColor: '#F3F4F6',
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: Platform.OS === 'ios' ? 12 : 6,
                justifyContent: 'center',
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
                    : L('Nachricht eingeben...', 'Type a message...')
                }
                placeholderTextColor="#9CA3AF"
                multiline
                editable={!uploading}
                style={{ fontSize: 14, fontWeight: '500', color: '#111827', maxHeight: 100, padding: 0 }}
              />
            </View>
            {!draft.trim() ? (
              <Pressable
                onPress={() => setRecording(true)}
                disabled={sending || uploading}
                accessibilityLabel={L('Sprachnotiz aufnehmen', 'Record voice note')}
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Mic size={20} color="#9CA3AF" />
              </Pressable>
            ) : (
              <Pressable
                onPress={onSend}
                disabled={sending || uploading}
                accessibilityLabel={L('Senden', 'Send')}
                style={{
                  width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: !sending && !uploading ? '#0064E0' : '#F3F4F6',
                }}
              >
                {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Send size={20} color={!uploading ? '#FFFFFF' : '#D1D5DB'} />}
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}
