/**
 * Team Chat — conversation list. Mobile port of the webapp's ChatSidebar
 * (full width on phones) + FabMenu:
 *
 *   "Chats" + round blue "+" button, "Suche hier..." search,
 *   rows with avatar, online dot, name + role badge, time, last message
 *   and a blue unread counter; FAB opens "Neuer Chat" / "Neue Gruppe".
 *
 * Online presence dots are driven by usePresence.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Plus, Search, User as UserIcon, Users as UsersIcon, X } from 'lucide-react-native'
import { format, isToday } from 'date-fns'

import { Screen } from '@/components/Screen'
import { RoleBadge } from '@/components/nav/RoleBadge'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useConversations } from '@/hooks/useConversations'
import { usePresence } from '@/hooks/usePresence'
import type { ChatConversation } from '@/lib/types'

function otherMember(conv: ChatConversation, myId: string | null) {
  if (conv.is_group) return null
  return conv.members?.find((m) => m.user_id !== myId) ?? null
}

function conversationDisplayName(conv: ChatConversation, myId: string | null, locale: 'de' | 'en'): string {
  if (conv.is_group) return conv.name ?? (locale === 'de' ? 'Gruppe' : 'Group')
  const other = otherMember(conv, myId)?.profile
  return other?.full_name ?? other?.email ?? 'Chat'
}

export default function ChatScreen() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const { conversations, loading } = useConversations()
  const { isOnline } = usePresence()
  const [search, setSearch] = useState('')
  const [fabOpen, setFabOpen] = useState(false)

  const sorted = useMemo(() => {
    return [...conversations].sort(
      (a, b) =>
        new Date(b.last_message?.created_at ?? b.updated_at).getTime() -
        new Date(a.last_message?.created_at ?? a.updated_at).getTime(),
    )
  }, [conversations])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((c) => conversationDisplayName(c, myId, locale).toLowerCase().includes(q))
  }, [sorted, search, myId, locale])

  const startNew = (mode: 'dm' | 'group') => {
    setFabOpen(false)
    router.push(`/chat/new?mode=${mode}` as any)
  }

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingBottom: 160 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 }}>
              {L('Chats', 'Chats')}
            </Text>
            <Pressable
              onPress={() => startNew('dm')}
              accessibilityLabel={L('Neuer Chat', 'New Chat')}
              style={{
                width: 40, height: 40, borderRadius: 999, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center',
                shadowColor: '#3B82F6', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4,
              }}
            >
              <Plus size={24} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Search */}
          <View style={{
            height: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
            borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14,
          }}>
            <Search size={18} color="#9CA3AF" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={L('Suche hier...', 'Search here...')}
              placeholderTextColor="#9CA3AF"
              autoCorrect={false}
              style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '500', color: '#111827', paddingVertical: 0 }}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={16} color="#9CA3AF" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* List */}
        <View style={{ marginTop: 12 }}>
          {loading ? (
            <ActivityIndicator color="#0064E0" style={{ marginTop: 40 }} />
          ) : filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 }}>
              <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Search size={24} color="#D1D5DB" />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#9CA3AF', textAlign: 'center', lineHeight: 21 }}>
                {search
                  ? L('Keine Unterhaltungen gefunden', 'No conversations found')
                  : L('Starte eine Unterhaltung mit deinem Team', 'Start a conversation with your team')}
              </Text>
            </View>
          ) : (
            filtered.map((conv) => {
              const name = conversationDisplayName(conv, myId, locale)
              const other = otherMember(conv, myId)
              const avatar = conv.is_group ? conv.avatar_url ?? null : other?.profile?.avatar_url ?? null
              const role = other?.profile?.role ?? null
              const online = other?.user_id ? isOnline(other.user_id) : false
              const unread = conv.unread_count ?? 0
              const lastMsg = conv.last_message
              const preview = (() => {
                if (!lastMsg) return L('Keine Nachrichten', 'No messages')
                if (lastMsg.content && lastMsg.content.trim()) return lastMsg.content
                if (lastMsg.attachment_type === 'image') return `📷 ${L('Foto', 'Photo')}`
                if (lastMsg.attachment_type === 'audio') return `🎤 ${L('Sprachnachricht', 'Voice message')}`
                if (lastMsg.attachment_type === 'file') return `📎 ${lastMsg.attachment_name ?? L('Datei', 'File')}`.trim()
                return L('Anhang', 'Attachment')
              })()
              const ts = lastMsg?.created_at ? new Date(lastMsg.created_at) : null
              const when = ts && !isNaN(ts.getTime()) ? (isToday(ts) ? format(ts, 'HH:mm') : format(ts, 'dd.MM.')) : ''

              return (
                <Pressable key={conv.id} onPress={() => router.push(`/chat/${conv.id}`)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' }}>
                    <View style={{ marginRight: 12 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 999, backgroundColor: '#F3F4F6', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                        {avatar ? (
                          <Image source={{ uri: avatar }} style={{ width: 48, height: 48 }} />
                        ) : (
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#9CA3AF' }}>{name?.[0]?.toUpperCase() || '?'}</Text>
                        )}
                      </View>
                      {!conv.is_group ? (
                        <View
                          style={{
                            position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 999,
                            backgroundColor: online ? '#22C55E' : '#D1D5DB', borderWidth: 2, borderColor: '#FFFFFF',
                          }}
                        />
                      ) : null}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
                            {name}
                          </Text>
                          {role ? <RoleBadge role={role} /> : null}
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '500', color: '#9CA3AF', marginLeft: 8 }}>{when}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text
                          style={{ fontSize: 13, color: '#6B7280', flex: 1, paddingRight: 12, fontWeight: unread > 0 ? '700' : '400' }}
                          numberOfLines={1}
                        >
                          {preview}
                        </Text>
                        {unread > 0 ? (
                          <View style={{ minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>{unread > 99 ? '99+' : String(unread)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Pressable>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* FAB menu (web FabMenu) */}
      {fabOpen ? (
        <Pressable onPress={() => setFabOpen(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : null}
      <View style={{ position: 'absolute', right: 24, bottom: 110, alignItems: 'flex-end' }} pointerEvents="box-none">
        {fabOpen ? (
          <View style={{ alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
            <FabItem label={L('Neue Gruppe', 'New Group')} icon={<UsersIcon size={20} color="#2563EB" />} onPress={() => startNew('group')} />
            <FabItem label={L('Neuer Chat', 'New Chat')} icon={<UserIcon size={20} color="#2563EB" />} onPress={() => startNew('dm')} />
          </View>
        ) : null}
        <Pressable
          onPress={() => setFabOpen((o) => !o)}
          accessibilityLabel={fabOpen ? L('Schließen', 'Close') : L('Neuer Chat', 'New Chat')}
          style={{
            width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
            backgroundColor: fabOpen ? '#FFFFFF' : '#0064E0',
            borderWidth: fabOpen ? 1 : 0, borderColor: '#F3F4F6',
            shadowColor: fabOpen ? '#000' : '#3B82F6', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
            elevation: 10,
          }}
        >
          {fabOpen ? <X size={24} color="#2563EB" /> : <Plus size={28} color="#FFFFFF" />}
        </Pressable>
      </View>
    </Screen>
  )
}

function FabItem({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 999,
          borderWidth: 1, borderColor: '#F3F4F6', paddingLeft: 16, paddingRight: 6, paddingVertical: 6,
          shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginRight: 12 }}>{label}</Text>
        <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
      </View>
    </Pressable>
  )
}
