/**
 * Shared working-time-model form. Hosts (/work-models/new and
 * /work-models/[id]) own submit + navigation.
 */

import React, { useState } from 'react'
import { ScrollView, View, Text, Switch } from 'react-native'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { useTranslation } from '@/lib/i18n'
import type { WorkingTimeModel } from '@/lib/types'
import type { WorkModelInput } from '@/hooks/useWorkModels'

interface Props {
  initial?: Partial<WorkingTimeModel>
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: WorkModelInput) => void | Promise<void>
}

export function WorkModelForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [hours, setHours] = useState(String(initial?.target_hours_per_week ?? 40))
  const [active, setActive] = useState(initial?.is_active ?? true)

  const submit = () => {
    const parsed = parseFloat(hours.replace(',', '.'))
    onSubmit({
      name: name.trim(),
      description: description || null,
      target_hours_per_week: Number.isFinite(parsed) && parsed > 0 ? parsed : 40,
      is_active: active,
    })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Name', 'Name')}
          value={name}
          onChangeText={setName}
          placeholder={L('z. B. Vollzeit 40h', 'e.g. Full-time 40h')}
        />
        <FormField
          label={L('Beschreibung', 'Description')}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder={L(
            'Optional, z. B. Mo–Fr, 8 Std/Tag',
            'Optional, e.g. Mon–Fri, 8 h/day',
          )}
        />
        <FormField
          label={L('Sollstunden pro Woche', 'Target hours per week')}
          value={hours}
          onChangeText={setHours}
          keyboardType="decimal-pad"
          placeholder="40"
        />

        <View className="flex-row items-center justify-between mt-2">
          <View className="flex-1 pr-3">
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {L('Aktiv', 'Active')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Inaktive Modelle stehen in Pickern nicht zur Auswahl.',
                'Inactive models are hidden from pickers.',
              )}
            </Text>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </View>
      </Card>

      <Button label={submitLabel} loading={submitting} onPress={submit} size="lg" />
    </ScrollView>
  )
}
