/**
 * Anträge (vacation + sick leave) overview.
 *
 * Employee view: shows own holiday + sick_leave entries from
 * calendar_events.
 * Admin/Dispatcher view: shows the whole org so they can audit and
 * withdraw entries that were submitted in error.
 *
 * "Approval" is implicit — the web app has no approval column on
 * calendar_events. Withdraw = delete. When/if the web ships a full
 * absence_requests table, this screen can be extended to honor
 * pending / approved / rejected statuses.
 */

import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  PalmtreeIcon as Palmtree,
  ThermometerSnowflake,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
} from 'lucide-react-native'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useAbsences } from '@/hooks/useAbsences'
import { EVENT_COLORS } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

type Filter = 'all' | 'holiday' | 'sick_leave'

export default function AbsencesScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { events, loading, withdraw, isManagerial, fetchAbsences } = useAbsences()
  const [filter, setFilter] = useState<Filter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchAbsences()
    } finally {
      setRefreshing(false)
    }
  }, [fetchAbsences])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((e) => e.event_type === filter)
  }, [events, filter])

  const onWithdraw = (id: string, title: string) => {
    Alert.alert(
      L('Antrag zurücknehmen', 'Withdraw request'),
      L(`„${title}" zurücknehmen?`, `Withdraw "${title}"?`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Zurücknehmen', 'Withdraw'),
          style: 'destructive',
          onPress: async () => {
            try {
              await withdraw(id)
              toast.success(L('Zurückgenommen', 'Withdrawn'))
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            }
          },
        },
      ],
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Anträge', 'Requests')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <CalendarIcon size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Urlaub & Krankmeldungen', 'Vacation & sick leave')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {isManagerial
                ? L('Alle Anträge im Team', 'All team requests')
                : L('Deine Anträge', 'Your requests')}
            </Text>
          </View>
        </View>

        {/* Action chips */}
        <View className="flex-row gap-2 mb-4">
          <Pressable
            onPress={() => router.push('/absences/new-vacation')}
            className="flex-1 rounded-2xl items-center justify-center py-4"
            style={{ backgroundColor: EVENT_COLORS.holiday }}
          >
            <Palmtree size={20} color="#fff" />
            <Text className="text-[12px] font-black text-white mt-1.5">
              {L('Urlaub beantragen', 'Request vacation')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/absences/new-sick-leave')}
            className="flex-1 rounded-2xl items-center justify-center py-4"
            style={{ backgroundColor: EVENT_COLORS.sick_leave }}
          >
            <ThermometerSnowflake size={20} color="#fff" />
            <Text className="text-[12px] font-black text-white mt-1.5">
              {L('Krank melden', 'Report sick')}
            </Text>
          </Pressable>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          className="mb-3"
        >
          {(['all', 'holiday', 'sick_leave'] as Filter[]).map((opt) => {
            const selected = filter === opt
            return (
              <Pressable
                key={opt}
                onPress={() => setFilter(opt)}
                className={`px-4 py-2 rounded-full border-2 ${
                  selected ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {opt === 'all'
                    ? L('Alle', 'All')
                    : opt === 'holiday'
                    ? L('Urlaub', 'Vacation')
                    : L('Krank', 'Sick leave')}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <CalendarIcon size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Keine Anträge', 'No requests')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie auf eine der Aktionen oben, um einen Antrag zu stellen.',
                  'Tap one of the actions above to submit a request.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-3">
            {filtered.map((e) => {
              const start = parseISO(e.start_time)
              const end = parseISO(e.end_time)
              const days = Math.max(1, differenceInCalendarDays(end, start) + 1)
              const isHoliday = e.event_type === 'holiday'
              const color = isHoliday ? EVENT_COLORS.holiday : EVENT_COLORS.sick_leave
              const Icon = isHoliday ? Palmtree : ThermometerSnowflake
              return (
                <Card key={e.id}>
                  <View className="flex-row items-start">
                    <View
                      className="w-11 h-11 rounded-2xl items-center justify-center mr-3"
                      style={{ backgroundColor: `${color}1F` }}
                    >
                      <Icon size={20} color={color} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center flex-wrap">
                        <Text className="text-[14px] font-black text-gray-900 dark:text-white mr-2">
                          {e.title}
                        </Text>
                        <View
                          className="px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${color}1F` }}
                        >
                          <Text
                            className="text-[9px] font-black uppercase tracking-widest"
                            style={{ color }}
                          >
                            {isHoliday ? L('Urlaub', 'Vacation') : L('Krank', 'Sick leave')}
                          </Text>
                        </View>
                      </View>
                      <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">
                        {format(start, 'dd.MM.yyyy', { locale: dateLocale })}
                        {' – '}
                        {format(end, 'dd.MM.yyyy', { locale: dateLocale })}
                        {' · '}
                        {days} {L(days === 1 ? 'Tag' : 'Tage', days === 1 ? 'day' : 'days')}
                      </Text>
                      {isManagerial && e.creator?.full_name && (
                        <Text className="text-[11px] text-gray-700 dark:text-slate-300 mt-1 font-semibold">
                          {e.creator.full_name}
                        </Text>
                      )}
                      {e.description && (
                        <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">{e.description}</Text>
                      )}
                    </View>
                    <Pressable
                      onPress={() => onWithdraw(e.id, e.title)}
                      className="p-1.5 -mr-1"
                    >
                      <Trash2 size={18} color="#DC2626" />
                    </Pressable>
                  </View>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/absences/new-vacation')}
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
