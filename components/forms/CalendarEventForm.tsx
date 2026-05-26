/**
 * Shared calendar-event form. Used by both /calendar-events/new and
 * /calendar-events/[id]. Host owns submit + navigation; this component
 * is pure presentation + local state.
 *
 * Inputs:
 *   - event_type (chip-row, excludes 'shift' since shifts come from /plans)
 *   - title, description
 *   - all-day toggle
 *   - date, start time, end time (or just date when all-day)
 *   - color (chip-row with the EVENT_COLORS palette)
 *   - location
 *   - member multi-picker
 *   - reminder offset
 */

import React, { useMemo, useState } from 'react'
import { ScrollView, View, Text, Pressable, Switch } from 'react-native'
import { format, parseISO } from 'date-fns'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { ReminderPicker } from '@/components/forms/ReminderPicker'
import { useTranslation } from '@/lib/i18n'
import {
  EVENT_COLORS,
  type CalendarEvent,
  type CalendarEventType,
} from '@/lib/types'
import type { CalendarEventInput } from '@/hooks/useCalendarEvents'

const SELECTABLE_TYPES: CalendarEventType[] = [
  'event',
  'meeting',
  'birthday',
  'other',
]

const TYPE_LABEL: Record<CalendarEventType, { de: string; en: string }> = {
  event: { de: 'Termin', en: 'Event' },
  meeting: { de: 'Meeting', en: 'Meeting' },
  birthday: { de: 'Geburtstag', en: 'Birthday' },
  sick_leave: { de: 'Krank', en: 'Sick leave' },
  holiday: { de: 'Urlaub', en: 'Vacation' },
  shift: { de: 'Schicht', en: 'Shift' },
  other: { de: 'Sonstige', en: 'Other' },
}

interface Props {
  initial?: Partial<CalendarEvent> & { member_ids?: string[] }
  /** Pre-fill the date when launched from a specific calendar day. */
  initialDate?: string
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: CalendarEventInput) => void | Promise<void>
}

function isoFromParts(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString()
}

function dateOnlyIso(date: string, endOfDay = false): string {
  return new Date(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}`).toISOString()
}

export function CalendarEventForm({
  initial,
  initialDate,
  submitting,
  submitLabel,
  onSubmit,
}: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const today = format(new Date(), 'yyyy-MM-dd')
  const startInitial = useMemo(() => {
    if (initial?.start_time) return parseISO(initial.start_time)
    if (initialDate) return new Date(`${initialDate}T09:00:00`)
    return new Date()
  }, [initial?.start_time, initialDate])
  const endInitial = useMemo(() => {
    if (initial?.end_time) return parseISO(initial.end_time)
    if (initialDate) return new Date(`${initialDate}T10:00:00`)
    return new Date(Date.now() + 60 * 60 * 1000)
  }, [initial?.end_time, initialDate])

  const [eventType, setEventType] = useState<CalendarEventType>(
    initial?.event_type ?? 'event',
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [allDay, setAllDay] = useState(initial?.is_all_day ?? false)
  const [date, setDate] = useState(format(startInitial, 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endInitial, 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState(format(startInitial, 'HH:mm'))
  const [endTime, setEndTime] = useState(format(endInitial, 'HH:mm'))
  const [color, setColor] = useState(initial?.color ?? EVENT_COLORS.event)
  const [location, setLocation] = useState(initial?.location ?? '')
  const [memberIds, setMemberIds] = useState<string[]>(initial?.member_ids ?? [])
  const [reminder, setReminder] = useState<number | null>(
    initial?.reminder_minutes_before ?? null,
  )

  // When the user changes the type, snap the color to that type's
  // default unless they already explicitly picked one.
  const onPickType = (t: CalendarEventType) => {
    setEventType(t)
    setColor(EVENT_COLORS[t])
  }

  const submit = () => {
    if (!title.trim()) return
    const start_iso = allDay ? dateOnlyIso(date) : isoFromParts(date, startTime)
    const end_iso = allDay ? dateOnlyIso(endDate || date, true) : isoFromParts(endDate || date, endTime)
    onSubmit({
      title: title.trim(),
      description: description || null,
      event_type: eventType,
      start_iso,
      end_iso,
      is_all_day: allDay,
      color,
      location: location || null,
      reminder_minutes_before: reminder,
      member_ids: memberIds,
    })
  }

  const COLOR_SWATCHES = [
    EVENT_COLORS.event,
    EVENT_COLORS.meeting,
    EVENT_COLORS.birthday,
    EVENT_COLORS.holiday,
    EVENT_COLORS.sick_leave,
    EVENT_COLORS.shift,
    EVENT_COLORS.other,
  ]

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <Card className="mb-3 space-y-4">
        {/* Type chips */}
        <View>
          <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-2">
            {L('Art', 'Type')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {SELECTABLE_TYPES.map((t) => {
              const sel = eventType === t
              return (
                <Pressable
                  key={t}
                  onPress={() => onPickType(t)}
                  className={`px-4 py-2 rounded-full border-2 ${
                    sel ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-[12px] font-bold ${
                      sel ? 'text-white' : 'text-gray-600 dark:text-slate-300'
                    }`}
                  >
                    {L(TYPE_LABEL[t].de, TYPE_LABEL[t].en)}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <FormField
          label={L('Titel', 'Title')}
          value={title}
          onChangeText={setTitle}
          placeholder={L('z. B. Sicherheitsbriefing', 'e.g. Safety briefing')}
        />
        <FormField
          label={L('Beschreibung', 'Description')}
          value={description}
          onChangeText={setDescription}
          multiline
        />
      </Card>

      <Card className="mb-3 space-y-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {L('Ganztägig', 'All day')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L('Ohne Uhrzeit', 'No specific time')}
            </Text>
          </View>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </View>

        <View className="flex-row gap-3">
          <View style={{ flex: 1 }}>
            <FormField
              label={L('Von', 'From')}
              value={date}
              onChangeText={setDate}
              placeholder={today}
              autoCapitalize="none"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label={L('Bis', 'To')}
              value={endDate}
              onChangeText={setEndDate}
              placeholder={date || today}
              autoCapitalize="none"
            />
          </View>
        </View>

        {!allDay && (
          <View className="flex-row gap-3">
            <View style={{ flex: 1 }}>
              <FormField
                label={L('Startzeit', 'Start time')}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label={L('Endzeit', 'End time')}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="10:00"
              />
            </View>
          </View>
        )}

        <FormField
          label={L('Ort', 'Location')}
          value={location}
          onChangeText={setLocation}
          placeholder={L('Optional', 'Optional')}
        />
      </Card>

      <Card className="mb-3 space-y-4">
        {/* Color picker */}
        <View>
          <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-2">
            {L('Farbe', 'Color')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {COLOR_SWATCHES.map((c) => {
              const sel = color === c
              return (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: c,
                    borderWidth: sel ? 3 : 1,
                    borderColor: sel ? '#0F172A' : '#E5E7EB',
                  }}
                />
              )
            })}
          </ScrollView>
        </View>

        <ReminderPicker value={reminder} onChange={setReminder} />
      </Card>

      <Card className="mb-3 space-y-4">
        <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400">
          {L('Teilnehmer (optional)', 'Members (optional)')}
        </Text>
        <EmployeePicker mode="multi" value={memberIds} onChange={setMemberIds} />
      </Card>

      <Button label={submitLabel} loading={submitting} onPress={submit} size="lg" />
    </ScrollView>
  )
}
