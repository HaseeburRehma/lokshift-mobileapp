/**
 * Qualifications list. Employee view = own credentials only.
 * Admin / dispatcher view = every employee's credentials, grouped by
 * owner, with a "verify" toggle per row.
 *
 * FAB always creates a row for the current user; admins assigning
 * credentials on behalf of someone else can do so from /users/[id]
 * (follow-up).
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, Switch, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  GraduationCap,
  Plus,
  Shield,
  Calendar as CalendarIcon,
  Hash,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react-native'
import { format, parseISO, isBefore, addDays } from 'date-fns'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useQualifications } from '@/hooks/useQualifications'
import type { Qualification } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

function expiryState(q: Qualification): 'expired' | 'soon' | 'ok' | 'never' {
  if (!q.expires_at) return 'never'
  const d = parseISO(q.expires_at)
  const now = new Date()
  if (isBefore(d, now)) return 'expired'
  if (isBefore(d, addDays(now, 30))) return 'soon'
  return 'ok'
}

export default function QualificationsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { items, loading, fetchItems, isManagerial } = useQualifications()

  const grouped = useMemo(() => {
    if (!isManagerial) return [{ owner: null, items }]
    const m = new Map<string, { owner: Qualification['user']; items: Qualification[] }>()
    for (const q of items) {
      const key = q.user_id
      if (!m.has(key)) m.set(key, { owner: q.user, items: [] })
      m.get(key)!.items.push(q)
    }
    return Array.from(m.values()).sort((a, b) =>
      (a.owner?.full_name ?? '').localeCompare(b.owner?.full_name ?? ''),
    )
  }, [items, isManagerial])

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Qualifikationen', 'Qualifications')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchItems()} tintColor="#0064E0" />
        }
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <GraduationCap size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Zertifikate & Lizenzen', 'Certifications & licenses')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {isManagerial
                ? L('Alle Mitarbeiter (Sie können bestätigen).', 'All members (you can verify).')
                : L('Ihre eigenen Qualifikationen.', 'Your own qualifications.')}
            </Text>
          </View>
        </View>

        {items.length === 0 && !loading ? (
          <Card>
            <View className="items-center py-10">
              <GraduationCap size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Noch keine Einträge', 'No entries yet')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center max-w-[260px]">
                {L(
                  'Tippen Sie auf das Plus-Symbol, um Ihre erste Qualifikation hinzuzufügen.',
                  'Tap the plus button to add your first qualification.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          grouped.map(({ owner, items: rows }) => (
            <View key={owner?.id ?? 'self'} className="mb-4">
              {isManagerial && owner?.full_name && (
                <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
                  {owner.full_name}
                </Text>
              )}
              <View className="space-y-2">
                {rows.map((q) => {
                  const state = expiryState(q)
                  return (
                    <Pressable key={q.id} onPress={() => router.push(`/qualifications/${q.id}`)}>
                      <Card>
                        <View className="flex-row items-start">
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 12,
                              backgroundColor: q.is_verified ? '#ECFDF5' : '#EEF6FF',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 12,
                            }}
                          >
                            {q.is_verified ? (
                              <CheckCircle2 size={20} color="#10B981" />
                            ) : (
                              <Shield size={20} color="#0064E0" />
                            )}
                          </View>
                          <View className="flex-1">
                            <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                              {q.name}
                            </Text>
                            {q.issuer && (
                              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
                                {q.issuer}
                              </Text>
                            )}
                            <View className="flex-row items-center mt-1 flex-wrap" style={{ gap: 10 }}>
                              {q.issued_at && (
                                <View className="flex-row items-center" style={{ gap: 4 }}>
                                  <CalendarIcon size={11} color="#94A3B8" />
                                  <Text className="text-[10px] text-gray-500 dark:text-slate-400">
                                    {format(parseISO(q.issued_at), 'yyyy-MM-dd')}
                                  </Text>
                                </View>
                              )}
                              {q.reference && (
                                <View className="flex-row items-center" style={{ gap: 4 }}>
                                  <Hash size={11} color="#94A3B8" />
                                  <Text className="text-[10px] text-gray-500 dark:text-slate-400">
                                    {q.reference}
                                  </Text>
                                </View>
                              )}
                              {q.document_url && (
                                <Pressable onPress={() => Linking.openURL(q.document_url!).catch(() => {})}>
                                  <View className="flex-row items-center" style={{ gap: 4 }}>
                                    <ExternalLink size={11} color="#0064E0" />
                                    <Text className="text-[10px] text-brand font-bold">
                                      {L('Dokument', 'Document')}
                                    </Text>
                                  </View>
                                </Pressable>
                              )}
                            </View>
                          </View>
                          <View className="items-end ml-2">
                            {q.is_verified ? (
                              <View
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 999,
                                  backgroundColor: '#ECFDF5',
                                }}
                              >
                                <Text className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
                                  {L('Bestätigt', 'Verified')}
                                </Text>
                              </View>
                            ) : (
                              <View
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 3,
                                  borderRadius: 999,
                                  backgroundColor: '#FEF3C7',
                                }}
                              >
                                <Text className="text-[9px] font-black uppercase tracking-widest text-amber-700">
                                  {L('Offen', 'Pending')}
                                </Text>
                              </View>
                            )}
                            {state === 'expired' && (
                              <View className="flex-row items-center mt-2" style={{ gap: 4 }}>
                                <AlertTriangle size={11} color="#DC2626" />
                                <Text className="text-[10px] font-black text-red-600">
                                  {L('Abgelaufen', 'Expired')}
                                </Text>
                              </View>
                            )}
                            {state === 'soon' && q.expires_at && (
                              <Text className="text-[10px] text-amber-600 mt-2">
                                {L('Läuft bald ab', 'Expiring soon')}
                              </Text>
                            )}
                          </View>
                        </View>
                      </Card>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/qualifications/new')}
        className="absolute bottom-8 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center"
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
