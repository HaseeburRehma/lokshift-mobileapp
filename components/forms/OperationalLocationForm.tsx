/**
 * Shared Betriebsstelle form — used by /operational-locations/new and
 * /operational-locations/[id]. Host owns submit / navigation.
 *
 * Type picker is a chip row (depot, station, yard, workshop, office,
 * other) so it stays one-thumb-tappable.
 */

import React, { useState } from 'react'
import { ScrollView, View, Text, Pressable } from 'react-native'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { useTranslation } from '@/lib/i18n'
import type { OperationalLocation, OperationalLocationType } from '@/lib/types'
import type { OperationalLocationInput } from '@/hooks/useOperationalLocations'

const TYPES: OperationalLocationType[] = [
  'depot',
  'station',
  'yard',
  'workshop',
  'office',
  'other',
]

const TYPE_LABEL: Record<OperationalLocationType, { de: string; en: string }> = {
  depot: { de: 'Betriebshof', en: 'Depot' },
  station: { de: 'Bahnhof', en: 'Station' },
  yard: { de: 'Abstellanlage', en: 'Yard' },
  workshop: { de: 'Werkstatt', en: 'Workshop' },
  office: { de: 'Büro', en: 'Office' },
  other: { de: 'Sonstige', en: 'Other' },
}

interface Props {
  initial?: Partial<OperationalLocation>
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: OperationalLocationInput) => void | Promise<void>
}

export function OperationalLocationForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
}: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [name, setName] = useState(initial?.name ?? '')
  const [shortCode, setShortCode] = useState(initial?.short_code ?? '')
  const [type, setType] = useState<OperationalLocationType>(initial?.type ?? 'depot')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [phone, setPhone] = useState(initial?.phone_number ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  const submit = () => {
    onSubmit({
      name: name.trim(),
      short_code: shortCode.trim() || null,
      type,
      address: address || null,
      phone_number: phone || null,
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
          placeholder={L('z. B. Bahnhof Köln Hbf', 'e.g. Köln Hbf station')}
        />
        <FormField
          label={L('Kürzel', 'Short code')}
          value={shortCode}
          onChangeText={setShortCode}
          placeholder="KK"
          autoCapitalize="characters"
        />

        <View>
          <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-1.5">
            {L('Typ', 'Type')}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {TYPES.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => setType(opt)}
                className={`px-4 py-2 rounded-full border-2 ${
                  type === opt ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    type === opt ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {L(TYPE_LABEL[opt].de, TYPE_LABEL[opt].en)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Card>

      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Adresse', 'Address')}
          value={address}
          onChangeText={setAddress}
          placeholder={L('Straße, PLZ Ort', 'Street, ZIP city')}
          multiline
        />
        <FormField
          label={L('Telefon', 'Phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder="+49 …"
          keyboardType="phone-pad"
        />
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
