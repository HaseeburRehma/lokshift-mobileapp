/**
 * Time entry verification queue — admin / dispatcher only.
 *
 * Layout:
 *   - Stat card: how many entries are awaiting review
 *   - Per-entry row: employee + date + hours + customer; tap to toggle
 *     selection
 *   - Sticky bottom bar: "X ausgewählt — bestätigen" (verify selected)
 *
 * Backed by useUnverifiedEntries, which subscribes to realtime so the
 * list shrinks as other admins verify in parallel.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Briefcase,
} from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canApproveTimes } from '@/lib/rbac/permissions'
import { useUnverifiedEntries } from '@/hooks/useUnverifiedEntries'
import { useSafeBack } from '@/lib/use-safe-back'

export default function VerifyTimeEntriesScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/times')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { role } = useUser()
  const { entries, loading, fetchEntries, verifyMany } = useUnverifiedEntries()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  if (!canApproveTimes(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 text-center">
          {L(
            'Nur Admins oder Disponenten dürfen Zeiten bestätigen.',
            'Only admins or dispatchers can verify time entries.',
          )}
        </Text>
      </Screen>
    )
  }

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(entries.map((e) => e.id)))
  const clearAll = () => setSelected(new Set())

  const verify = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const n = await verifyMany(Array.from(selected))
      toast.success(L(`${n} Einträge bestätigt`, `${n} entries verified`))
      setSelected(new Set())
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Zeiten bestätigen', 'Verify time entries')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: selected.size > 0 ? 140 : 80,
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchEntries()} tintColor="#0064E0" />
        }
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <ShieldCheck size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {entries.length}{' '}
              {L(
                entries.length === 1 ? 'offener Eintrag' : 'offene Einträge',
                entries.length === 1 ? 'pending entry' : 'pending entries',
              )}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Bestätigte Einträge erscheinen in der Lohnabrechnung.',
                'Verified entries roll into payroll.',
              )}
            </Text>
          </View>
          {entries.length > 0 && (
            <Pressable
              onPress={selected.size === entries.length ? clearAll : selectAll}
              className="px-3 py-2 rounded-full border-2 border-gray-200 dark:border-slate-700"
            >
              <Text className="text-[11px] font-bold text-gray-700 dark:text-slate-300">
                {selected.size === entries.length
                  ? L('Keine', 'None')
                  : L('Alle', 'All')}
              </Text>
            </Pressable>
          )}
        </View>

        {entries.length === 0 ? (
          <Card>
            <View className="items-center py-10">
              <ShieldCheck size={32} color="#10B981" />
              <Text className="text-[14px] font-bold text-gray-700 dark:text-slate-300 mt-3">
                {L('Alles bestätigt!', 'All caught up!')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Es gibt keine offenen Zeiteinträge zur Prüfung.',
                  'There are no time entries awaiting verification.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-2">
            {entries.map((e) => {
              const sel = selected.has(e.id)
              const initials = (e.employee?.full_name ?? '?')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              const start = e.start_time ? format(parseISO(e.start_time), 'HH:mm') : ''
              const end = e.end_time ? format(parseISO(e.end_time), 'HH:mm') : ''
              const dateLabel = format(parseISO(e.date), 'EEE, dd.MM.yyyy', { locale: dateLocale })
              return (
                <Pressable key={e.id} onPress={() => toggle(e.id)}>
                  <View
                    className="flex-row items-center bg-white dark:bg-slate-900 rounded-2xl px-3 py-3 border-2"
                    style={{ borderColor: sel ? '#0064E0' : '#E5E7EB' }}
                  >
                    <View className="mr-3">
                      {sel ? (
                        <CheckCircle2 size={22} color="#0064E0" />
                      ) : (
                        <Circle size={22} color="#CBD5E1" />
                      )}
                    </View>
                    {e.employee?.avatar_url ? (
                      <Image
                        source={{ uri: e.employee.avatar_url }}
                        style={{ width: 36, height: 36, borderRadius: 999, marginRight: 10 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 999,
                          backgroundColor: '#EEF2FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 10,
                        }}
                      >
                        <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 12 }}>
                          {initials}
                        </Text>
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-[13px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
                        {e.employee?.full_name ?? '—'}
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                        {dateLabel}
                        {start && end ? ` · ${start}–${end}` : ''}
                      </Text>
                      {e.customer?.name && (
                        <View className="flex-row items-center mt-1">
                          <Briefcase size={11} color="#94A3B8" />
                          <Text className="text-[11px] text-gray-500 dark:text-slate-400 ml-1">
                            {e.customer.name}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View className="items-end">
                      <Text className="text-[15px] font-black text-brand">
                        {(e.net_hours ?? 0).toFixed(2)} h
                      </Text>
                      {e.meal_allowance ? (
                        <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                          {(e.meal_allowance ?? 0).toFixed(0)} €
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>

      {selected.size > 0 && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: 28,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 1,
            borderTopColor: '#F1F5F9',
            shadowColor: '#000',
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
          }}
        >
          <Button
            label={
              busy
                ? t('common.loading')
                : L(`${selected.size} bestätigen`, `Verify ${selected.size}`)
            }
            onPress={verify}
            loading={busy}
            size="lg"
            leftIcon={<ShieldCheck size={18} color="#fff" />}
          />
        </View>
      )}
    </Screen>
  )
}
