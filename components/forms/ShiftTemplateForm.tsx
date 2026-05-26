/**
 * Shared form for creating or editing a shift template. Lives in
 * components/forms/ so both new and [id] screens render the same UI.
 *
 * The host provides initial values + an onSubmit. Submit-handling and
 * navigation stay with the host so we can keep this component pure.
 */

import React, { useState } from 'react'
import { View, Text, Switch, ScrollView } from 'react-native'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { CustomerPicker } from '@/components/forms/CustomerPicker'
import { useTranslation } from '@/lib/i18n'
import type { ShiftTemplate } from '@/lib/types'
import type { ShiftTemplateInput } from '@/hooks/useShiftTemplates'

interface Props {
  initial?: Partial<ShiftTemplate>
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: ShiftTemplateInput) => void | Promise<void>
}

export function ShiftTemplateForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [name, setName] = useState(initial?.name ?? '')
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? '')
  const [startTime, setStartTime] = useState(initial?.start_time ?? '08:00')
  const [endTime, setEndTime] = useState(initial?.end_time ?? '16:00')
  const [durationDays, setDurationDays] = useState(String(initial?.duration_days ?? 1))
  const [route, setRoute] = useState(initial?.route ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [overnight, setOvernight] = useState(initial?.overnight_stay ?? false)
  const [hotelAddress, setHotelAddress] = useState(initial?.hotel_address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const submit = () => {
    const parsedDays = parseInt(durationDays, 10)
    onSubmit({
      name: name.trim(),
      customer_id: customerId || null,
      start_time: startTime,
      end_time: endTime,
      duration_days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 1,
      route: route || null,
      location: location || null,
      overnight_stay: overnight,
      hotel_address: overnight ? hotelAddress || null : null,
      notes: notes || null,
    })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Name', 'Name')}
          value={name}
          onChangeText={setName}
          placeholder={L('z. B. Frühschicht Köln–Aachen', 'e.g. Early shift Köln–Aachen')}
        />
        <CustomerPicker value={customerId} onChange={setCustomerId} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField
              label={L('Startzeit', 'Start time')}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="08:00"
            />
          </View>
          <View className="flex-1">
            <FormField
              label={L('Endzeit', 'End time')}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="16:00"
            />
          </View>
        </View>
        <FormField
          label={L('Dauer (Tage)', 'Duration (days)')}
          value={durationDays}
          onChangeText={setDurationDays}
          placeholder="1"
          keyboardType="number-pad"
        />
      </Card>

      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Strecke', 'Route')}
          value={route}
          onChangeText={setRoute}
          placeholder={L('z. B. Köln – Aachen', 'e.g. Köln – Aachen')}
        />
        <FormField label={L('Ort', 'Location')} value={location} onChangeText={setLocation} />

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {L('Übernachtung', 'Overnight stay')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Wird in jeden erzeugten Plan übernommen.',
                'Will be applied to every plan made from this template.',
              )}
            </Text>
          </View>
          <Switch
            value={overnight}
            onValueChange={setOvernight}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </View>

        {overnight && (
          <FormField
            label={L('Hoteladresse', 'Hotel address')}
            value={hotelAddress}
            onChangeText={setHotelAddress}
            placeholder={L('Adresse oder Hotelname', 'Address or hotel name')}
          />
        )}
      </Card>

      <Card className="mb-3">
        <FormField
          label={L('Notizen', 'Notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </Card>

      <Button label={submitLabel} loading={submitting} onPress={submit} size="lg" />
    </ScrollView>
  )
}
