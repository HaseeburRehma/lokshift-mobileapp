/**
 * Start a new chat — mobile port of the webapp's contact picker overlay
 * ("Neuer Chat", search, 4-column contact grid with role badges). Mobile
 * also supports groups: switch to "Gruppe", tap several people and name it.
 *
 * Params:
 *   ?mode=group  — open in group mode (FAB "Neue Gruppe")
 *   ?with=<id>   — open / create the DM with that person right away
 *                  (Live → "Kontakt")
 *
 * For a DM, getOrCreateDm dedupes against an existing 1-on-1 so we
 * never end up with two parallel chats between the same pair.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, TextInput, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Search, Users as UsersIcon, User as UserIcon, X } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { RoleBadge } from '@/components/nav/RoleBadge'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useProfiles } from '@/hooks/useProfiles'
import { useConversations } from '@/hooks/useConversations'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewChatScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/chat')
  const params = useLocalSearchParams<{ mode?: string; with?: string }>()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const { profiles, loading: profilesLoading } = useProfiles(false)
  const { getOrCreateDm, createGroup } = useConversations()

  const [mode, setMode] = useState<'dm' | 'group'>(params.mode === 'group' ? 'group' : 'dm')
  const [selected, setSelected] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)

  const others = useMemo(
    () => profiles.filter((p) => p.id !== myId).sort((a, b) =>
      (a.full_name ?? '').localeCompare(b.full_name ?? ''),
    ),
    [profiles, myId],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return others
    return others.filter((p) => (p.full_name ?? p.email ?? '').toLowerCase().includes(q))
  }, [others, search])

  const openDm = async (userId: string) => {
    setBusy(true)
    try {
      const id = await getOrCreateDm(userId)
      router.replace(`/chat/${id}`)
    } catch (err: any) {
      toast.error(err?.message ?? L('Chat konnte nicht gestartet werden', 'Failed to start chat'))
    } finally {
      setBusy(false)
    }
  }

  // ?with=<id> — jump straight into the DM (once).
  const autoStarted = useRef(false)
  useEffect(() => {
    const target = typeof params.with === 'string' ? params.with : null
    if (!target || autoStarted.current || !myId || target === myId) return
    autoStarted.current = true
    openDm(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.with, myId])

  // Web behaviour: tapping a contact starts the DM; in group mode it toggles.
  const onContact = (id: string) => {
    if (busy) return
    if (mode === 'dm') {
      openDm(id)
      return
    }
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const create = async () => {
    if (selected.length < 1) {
      toast.error(L('Mindestens ein Mitglied wählen.', 'Pick at least one member.'))
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

  const loadingContacts = !!profilesLoading && others.length === 0

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
          {mode === 'group' ? L('Neue Gruppe', 'New Group') : L('Neuer Chat', 'New Chat')}
        </Text>
        <Pressable onPress={goBack} hitSlop={8} accessibilityLabel={L('Schließen', 'Close')} style={{ padding: 6, borderRadius: 8 }}>
          <X size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* Mode toggle (mobile: groups) */}
        <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 14, padding: 4, marginBottom: 16 }}>
          {(['dm', 'group'] as const).map((m) => {
            const active = mode === m
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m)
                  setSelected([])
                }}
                style={{ flex: 1 }}
              >
                <View style={{
                  height: 38, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? '#FFFFFF' : 'transparent',
                }}>
                  {m === 'dm' ? <UserIcon size={15} color={active ? '#0064E0' : '#6B7280'} /> : <UsersIcon size={15} color={active ? '#0064E0' : '#6B7280'} />}
                  <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: active ? '#0064E0' : '#6B7280' }}>
                    {m === 'dm' ? L('Direktnachricht', 'Direct message') : L('Gruppe', 'Group')}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        {mode === 'group' ? (
          <Card style={{ marginBottom: 16 }}>
            <FormField
              label={L('Gruppenname', 'Group name')}
              value={groupName}
              onChangeText={setGroupName}
              placeholder={L('z. B. Schicht-Köln', 'e.g. Shift-Cologne')}
            />
          </Card>
        ) : null}

        {/* Search */}
        <View style={{
          height: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
          borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 14, marginBottom: 24,
        }}>
          <Search size={18} color="#9CA3AF" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={L('Hier suchen…', 'Search here…')}
            placeholderTextColor="#9CA3AF"
            autoCorrect={false}
            style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '500', color: '#111827', paddingVertical: 0 }}
          />
        </View>

        {busy && mode === 'dm' ? (
          <ActivityIndicator color="#0064E0" style={{ marginBottom: 16 }} />
        ) : null}

        {loadingContacts ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <ActivityIndicator color="#3B82F6" />
            <Text style={{ marginTop: 14, fontSize: 14, fontWeight: '500', color: '#6B7280' }}>
              {L('Kontakte werden geladen…', 'Loading organization contacts…')}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 48 }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#9CA3AF', textAlign: 'center' }}>
              {L('Keine Kontakte in Ihrer Organisation gefunden.', 'No contacts found in your organization.')}
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {filtered.map((p) => {
              const sel = selected.includes(p.id)
              const first = (p.full_name ?? p.email ?? '?').split(' ')[0]
              return (
                <Pressable key={p.id} onPress={() => onContact(p.id)} style={{ width: '25%', paddingHorizontal: 4, marginBottom: 24 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{
                      width: 64, height: 64, borderRadius: 999, backgroundColor: '#F9FAFB', overflow: 'hidden',
                      borderWidth: 2, borderColor: sel ? '#3B82F6' : '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={{ width: 64, height: 64 }} />
                      ) : (
                        <Text style={{ fontSize: 20, fontWeight: '700', color: '#9CA3AF' }}>{p.full_name?.[0]?.toUpperCase() || '?'}</Text>
                      )}
                      {sel ? (
                        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                          <View style={{ backgroundColor: '#3B82F6', borderRadius: 999, padding: 4, borderWidth: 2, borderColor: '#FFFFFF' }}>
                            <Check size={14} color="#FFFFFF" />
                          </View>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 8, marginBottom: 4, textAlign: 'center' }} numberOfLines={1}>
                      {first}
                    </Text>
                    <RoleBadge role={(p as any).role ?? null} />
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        {mode === 'group' ? (
          <Button
            label={busy ? t('common.loading') : L(`Gruppe erstellen (${selected.length})`, `Create group (${selected.length})`)}
            onPress={create}
            loading={busy}
            size="lg"
            style={{ marginTop: 8 }}
            disabled={selected.length === 0}
          />
        ) : null}
      </ScrollView>
    </Screen>
  )
}
