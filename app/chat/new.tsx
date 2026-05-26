/**
 * Start a new chat — DM (tap one member) or group (tap several +
 * provide a name).
 *
 * For a DM, getOrCreateDm dedupes against an existing 1-on-1 so we
 * never end up with two parallel chats between the same pair.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Check, Users as UsersIcon, User as UserIcon } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useProfiles } from '@/hooks/useProfiles'
import { useConversations } from '@/hooks/useConversations'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewChatScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/chat')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const { profiles } = useProfiles(false)
  const { getOrCreateDm, createGroup } = useConversations()

  const [mode, setMode] = useState<'dm' | 'group'>('dm')
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [busy, setBusy] = useState(false)

  const others = useMemo(
    () => profiles.filter((p) => p.id !== myId).sort((a, b) =>
      (a.full_name ?? '').localeCompare(b.full_name ?? ''),
    ),
    [profiles, myId],
  )

  const toggle = (id: string) => {
    if (mode === 'dm') {
      setSelected(selected[0] === id ? [] : [id])
      return
    }
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const start = async () => {
    if (mode === 'dm') {
      if (selected.length !== 1) {
        toast.error(L('Bitte eine Person wählen.', 'Pick one person.'))
        return
      }
      setBusy(true)
      try {
        const id = await getOrCreateDm(selected[0])
        router.replace(`/chat/${id}`)
      } catch (err: any) {
        toast.error(err?.message ?? t('common.error'))
      } finally {
        setBusy(false)
      }
    } else {
      if (selected.length < 1) {
        toast.error(
          L('Mindestens ein Mitglied wählen.', 'Pick at least one member.'),
        )
        return
      }
      if (!groupName.trim()) {
        toast.error(L('Gruppenname erforderlich.', 'Group name is required.'))
        return
      }
      setBusy(true)
      try {
        const id = await createGroup(groupName.trim(), selected)
        router.replace(`/chat/${id}`)
      } catch (err: any) {
        toast.error(err?.message ?? t('common.error'))
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Neuer Chat', 'New chat')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Mode toggle */}
        <View className="flex-row gap-2 mb-4">
          <Pressable
            onPress={() => {
              setMode('dm')
              setSelected([])
            }}
            className={`flex-1 py-3 rounded-2xl border-2 items-center ${
              mode === 'dm' ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
            }`}
          >
            <UserIcon size={18} color={mode === 'dm' ? '#fff' : '#4B5563'} />
            <Text
              className="text-[12px] font-black mt-1"
              style={{ color: mode === 'dm' ? '#fff' : '#4B5563' }}
            >
              {L('Direktnachricht', 'Direct message')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setMode('group')
              setSelected([])
            }}
            className={`flex-1 py-3 rounded-2xl border-2 items-center ${
              mode === 'group' ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
            }`}
          >
            <UsersIcon size={18} color={mode === 'group' ? '#fff' : '#4B5563'} />
            <Text
              className="text-[12px] font-black mt-1"
              style={{ color: mode === 'group' ? '#fff' : '#4B5563' }}
            >
              {L('Gruppe', 'Group')}
            </Text>
          </Pressable>
        </View>

        {mode === 'group' && (
          <Card className="mb-3">
            <FormField
              label={L('Gruppenname', 'Group name')}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={L('z. B. Schicht-Köln', 'e.g. Shift-Cologne')}
            />
          </Card>
        )}

        <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
          {mode === 'dm'
            ? L('Mitarbeiter wählen', 'Pick a member')
            : L('Mitglieder hinzufügen', 'Add members')}
        </Text>

        <View className="space-y-2">
          {others.length === 0 ? (
            <Card>
              <Text className="text-gray-400 dark:text-slate-500 text-center py-4">
                {L('Keine weiteren Mitarbeiter.', 'No other members.')}
              </Text>
            </Card>
          ) : (
            others.map((p) => {
              const sel = selected.includes(p.id)
              const initials = (p.full_name ?? p.email ?? 'U')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              return (
                <Pressable key={p.id} onPress={() => toggle(p.id)}>
                  <View
                    className="flex-row items-center px-3 py-3 bg-white dark:bg-slate-900 rounded-2xl border-2"
                    style={{ borderColor: sel ? '#0064E0' : '#E5E7EB' }}
                  >
                    {p.avatar_url ? (
                      <Image
                        source={{ uri: p.avatar_url }}
                        style={{ width: 40, height: 40, borderRadius: 999, marginRight: 12 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          backgroundColor: '#EEF2FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: '#0064E0', fontWeight: '900' }}>{initials}</Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                        {p.full_name ?? p.email ?? '—'}
                      </Text>
                      {p.email && p.full_name && (
                        <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{p.email}</Text>
                      )}
                    </View>
                    {sel && (
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          backgroundColor: '#0064E0',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={14} color="#fff" />
                      </View>
                    )}
                  </View>
                </Pressable>
              )
            })
          )}
        </View>

        <Button
          label={
            busy
              ? t('common.loading')
              : mode === 'dm'
              ? L('Chat starten', 'Start chat')
              : L(
                  `Gruppe erstellen (${selected.length})`,
                  `Create group (${selected.length})`,
                )
          }
          onPress={start}
          loading={busy}
          size="lg"
          style={{ marginTop: 16 }}
          disabled={mode === 'dm' ? selected.length !== 1 : selected.length === 0}
        />
      </ScrollView>
    </Screen>
  )
}
