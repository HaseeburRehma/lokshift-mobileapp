/**
 * Create a generic calendar event. Anyone can create an event; only
 * admins / dispatchers can fan it out to attendees beyond themselves
 * (the form picker filters to active employees regardless).
 *
 * Supports an optional `?date=YYYY-MM-DD` query param so the calendar
 * tab can pre-fill the day the user tapped.
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, CalendarPlus } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { CalendarEventForm } from '@/components/forms/CalendarEventForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewCalendarEventScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/calendar')
  const { date } = useLocalSearchParams<{ date?: string }>()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { createEvent } = useCalendarEvents()
  const [saving, setSaving] = useState(false)

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Neuer Termin', 'New event')}
        </Text>
      </View>

      <View className="flex-row items-center px-5 pb-2">
        <View className="w-12 h-12 rounded-2xl bg-brand items-center justify-center mr-3">
          <CalendarPlus size={22} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white">
            {L('Termin im Kalender erstellen', 'Add a calendar event')}
          </Text>
          <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
            {L(
              'Sichtbar für Sie und ausgewählte Teilnehmer.',
              'Visible to you and any members you add.',
            )}
          </Text>
        </View>
      </View>

      <CalendarEventForm
        initialDate={date as string | undefined}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Termin speichern', 'Save event')}
        onSubmit={async (input) => {
          if (!input.title) {
            toast.error(L('Titel ist erforderlich.', 'Title is required.'))
            return
          }
          if (new Date(input.end_iso).getTime() < new Date(input.start_iso).getTime()) {
            toast.error(L('Endzeit vor Startzeit.', 'End is before start.'))
            return
          }
          setSaving(true)
          try {
            await createEvent(input)
            toast.success(L('Termin angelegt', 'Event created'))
            router.replace('/(tabs)/calendar')
          } catch (err: any) {
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
