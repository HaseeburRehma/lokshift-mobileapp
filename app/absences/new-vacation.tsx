/**
 * Submit a vacation request — creates a calendar_event with
 * event_type='holiday'. Notifies admins/dispatchers via useAbsences.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Palmtree } from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { ReminderPicker } from '@/components/forms/ReminderPicker'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useAbsences } from '@/hooks/useAbsences'
import { EVENT_COLORS } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewVacationScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/absences')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { submit } = useAbsences()

  const today = format(new Date(), 'yyyy-MM-dd')
  const [title, setTitle] = useState(L('Urlaub', 'Vacation'))
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [reminder, setReminder] = useState<number | null>(1440) // 1 day default
  const [saving, setSaving] = useState(false)

  const onSubmit = async () => {
    if (!startDate || !endDate) {
      toast.error(L('Datum erforderlich.', 'Dates are required.'))
      return
    }
    if (endDate < startDate) {
      toast.error(L('Enddatum vor Startdatum.', 'End is before start.'))
      return
    }
    setSaving(true)
    try {
      await submit({
        kind: 'holiday',
        title: title.trim() || L('Urlaub', 'Vacation'),
        start_date: startDate,
        end_date: endDate,
        notes: notes || null,
        reminder_minutes_before: reminder,
      })
      toast.success(L('Urlaubsantrag gestellt', 'Vacation request submitted'))
      router.replace('/absences')
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Urlaub beantragen', 'Request vacation')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <View className="flex-row items-center mb-4">
          <View
            className="w-14 h-14 rounded-3xl items-center justify-center mr-3"
            style={{ backgroundColor: EVENT_COLORS.holiday }}
          >
            <Palmtree size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Neuer Urlaubsantrag', 'New vacation request')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Die Disposition wird informiert.',
                'Dispatch will be notified.',
              )}
            </Text>
          </View>
        </View>

        <Card className="mb-3 space-y-4">
          <FormField
            label={L('Titel', 'Title')}
            value={title}
            onChangeText={setTitle}
            placeholder={L('z. B. Sommerurlaub', 'e.g. Summer holiday')}
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Von', 'From')}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Bis', 'To')}
                value={endDate}
                onChangeText={setEndDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
          <FormField
            label={L('Bemerkung', 'Notes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder={L('Optional', 'Optional')}
          />
          <ReminderPicker value={reminder} onChange={setReminder} />
        </Card>

        <Button
          label={saving ? t('common.loading') : L('Antrag stellen', 'Submit request')}
          onPress={onSubmit}
          loading={saving}
          size="lg"
        />
      </ScrollView>
    </Screen>
  )
}
