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
import { Calendar as CalendarIcon, X } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { CalendarEventForm } from '@/components/forms/CalendarEventForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'

export default function NewCalendarEventScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/calendar')
  const { date } = useLocalSearchParams<{ date?: string }>()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { createEvent } = useCalendarEvents()
  const [saving, setSaving] = useState(false)

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      {/* Header — same as the web's NewEventSheet: icon + "Neuer Termin" + close */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <CalendarIcon size={22} color="#0064E0" />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827' }} numberOfLines={1}>
            {L('Neuer Termin', 'New Event')}
          </Text>
        </View>
        <Pressable
          onPress={goBack}
          hitSlop={8}
          accessibilityLabel={L('Schließen', 'Close')}
          style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={20} color="#9CA3AF" />
        </Pressable>
      </View>
      <View style={{ height: 16 }} />

      <CalendarEventForm
        initialDate={date as string | undefined}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Termin erstellen', 'Create Event')}
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
            captureError(err, { tags: { action: 'calendar-event.create' } })
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
