/**
 * Submit a sick-leave entry — creates a calendar_event with
 * event_type='sick_leave'. Notifies admins/dispatchers via useAbsences.
 *
 * Defaults to "today only" since most sick-leave entries are filed on
 * the day of, and adjusted later if the absence runs longer.
 *
 * Field order / labels follow the web NewEventSheet (Terminart → Titel →
 * Zeit & Datum → Erinnerung → Beschreibung); type is fixed to
 * "Krankmeldung".
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Switch, TextInput, type TextInputProps } from 'react-native'
import { useRouter } from 'expo-router'
import { Calendar as CalendarIcon, Clock, Check } from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { ReminderPicker } from '@/components/forms/ReminderPicker'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useAbsences } from '@/hooks/useAbsences'
import { EVENT_COLORS } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewSickLeaveScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/absences')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { submit } = useAbsences()

  const today = format(new Date(), 'yyyy-MM-dd')
  const [title, setTitle] = useState(L('Krankmeldung', 'Sick leave'))
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [notes, setNotes] = useState('')
  const [reminder, setReminder] = useState<number | null>(null) // none by default
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
        kind: 'sick_leave',
        title: title.trim() || L('Krankmeldung', 'Sick leave'),
        start_date: startDate,
        end_date: endDate,
        notes: notes || null,
        reminder_minutes_before: reminder,
      })
      toast.success(L('Krankmeldung eingereicht', 'Sick leave submitted'))
      router.replace('/absences')
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const color = EVENT_COLORS.sick_leave

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          title={L('Krank melden', 'Report sick')}
          subtitle={L('Die Disposition wird sofort informiert.', 'Dispatch is notified immediately.')}
          showBack
          onBack={goBack}
        />

        <Card style={{ borderRadius: 28, padding: 0 }}>
          {/* Sheet header */}
          <View className="flex-row items-center px-5 py-5 border-b border-gray-100">
            <View className="w-10 h-10 rounded-2xl bg-blue-50 items-center justify-center mr-3">
              <CalendarIcon size={22} color="#0064E0" />
            </View>
            <Text className="text-[18px] font-black text-gray-900 flex-1" numberOfLines={1}>
              {L('Neue Krankmeldung', 'New sick leave')}
            </Text>
          </View>

          <View className="p-5" style={{ gap: 24 }}>
            {/* Terminart (fixed) */}
            <View>
              <SectionLabel>{L('Terminart', 'Event Type')}</SectionLabel>
              <View className="h-14 flex-row items-center px-4 bg-gray-50 border border-gray-100 rounded-2xl">
                <View
                  className="w-8 h-8 rounded-xl items-center justify-center mr-3"
                  style={{ backgroundColor: `${color}26` }}
                >
                  <Text style={{ fontSize: 14 }}>🏥</Text>
                </View>
                <Text className="text-[15px] font-bold text-gray-900">
                  {L('Krankmeldung', 'Sick Leave')}
                </Text>
              </View>
            </View>

            {/* Titel */}
            <View>
              <SectionLabel>{L('Titel', 'Title')}</SectionLabel>
              <SheetInput
                value={title}
                onChangeText={setTitle}
                placeholder={L('z. B. Grippe', 'e.g. Flu')}
              />
            </View>

            {/* Zeit & Datum */}
            <View>
              <View className="flex-row items-center justify-between mb-2 px-1">
                <Text className="text-[13px] font-black uppercase tracking-widest text-gray-400">
                  {L('Zeit & Datum', 'Time & Date')}
                </Text>
                <View className="flex-row items-center">
                  <Text className="text-[12px] font-bold text-gray-500 mr-2">
                    {L('Ganztägig', 'All day')}
                  </Text>
                  <Switch value disabled trackColor={{ true: '#0064E0', false: '#D1D5DB' }} />
                </View>
              </View>
              <View style={{ gap: 12 }}>
                <View>
                  <Text className="text-[11px] font-bold text-gray-500 mb-1 ml-1">{L('Von', 'From')}</Text>
                  <SheetInput
                    icon
                    value={startDate}
                    onChangeText={setStartDate}
                    placeholder="YYYY-MM-DD"
                    autoCorrect={false}
                  />
                </View>
                <View>
                  <Text className="text-[11px] font-bold text-gray-500 mb-1 ml-1">{L('Bis', 'To')}</Text>
                  <SheetInput
                    icon
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    autoCorrect={false}
                  />
                </View>
              </View>
            </View>

            {/* Erinnerung */}
            <ReminderPicker value={reminder} onChange={setReminder} />

            {/* Beschreibung */}
            <View>
              <SectionLabel>{L('Beschreibung', 'Description')}</SectionLabel>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder={L('Optionale Notizen oder Details…', 'Optional notes or details...')}
                placeholderTextColor="#9CA3AF"
                style={{
                  minHeight: 100,
                  backgroundColor: '#F9FAFB',
                  borderRadius: 16,
                  padding: 16,
                  fontSize: 15,
                  fontWeight: '500',
                  color: '#374151',
                  textAlignVertical: 'top',
                }}
              />
            </View>
          </View>
        </Card>

        <Button
          label={L('Krankmeldung einreichen', 'Submit sick leave')}
          leftIcon={<Check size={20} color="#fff" />}
          onPress={onSubmit}
          loading={saving}
          size="lg"
          style={{ marginTop: 16 }}
        />
      </ScrollView>
    </Screen>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-[13px] font-black uppercase tracking-widest text-gray-400 pl-1 mb-2">
      {children}
    </Text>
  )
}

function SheetInput({ icon, ...props }: TextInputProps & { icon?: boolean }) {
  return (
    <View className="h-14 flex-row items-center bg-gray-50 rounded-2xl px-4">
      {icon ? <Clock size={18} color="#9CA3AF" style={{ marginRight: 12 }} /> : null}
      <TextInput
        placeholderTextColor="#9CA3AF"
        style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' }}
        {...props}
      />
    </View>
  )
}
