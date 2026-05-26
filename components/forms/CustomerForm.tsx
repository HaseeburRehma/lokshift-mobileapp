/**
 * Shared customer form — used by both /customers/new and /customers/[id].
 * Host owns submit / nav; this component is pure presentation + local
 * state.
 *
 * Now wires the LocationPicker so admins can drop / drag a pin to set
 * customers.latitude / longitude. The Live Operations map and the
 * plan-customer popup use those coords to plot the site.
 */

import React, { useState } from 'react'
import { ScrollView } from 'react-native'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { LocationPicker } from '@/components/forms/LocationPicker'
import { useTranslation } from '@/lib/i18n'
import type { Customer } from '@/lib/types'
import type { CustomerInput } from '@/hooks/useCustomers'

interface Props {
  initial?: Partial<Customer>
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: CustomerInput) => void | Promise<void>
}

export function CustomerForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [name, setName] = useState(initial?.name ?? '')
  const [contactPerson, setContactPerson] = useState(initial?.contact_person ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [latitude, setLatitude] = useState<number | null>(initial?.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(initial?.longitude ?? null)

  const submit = () => {
    onSubmit({
      name: name.trim(),
      contact_person: contactPerson || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      notes: notes || null,
      latitude,
      longitude,
    })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Firmenname', 'Company name')}
          value={name}
          onChangeText={setName}
          placeholder={L('z. B. Rheinmaasrail GmbH', 'e.g. Rheinmaasrail GmbH')}
        />
        <FormField
          label={L('Ansprechpartner', 'Contact person')}
          value={contactPerson}
          onChangeText={setContactPerson}
          placeholder={L('Vor- und Nachname', 'First and last name')}
        />
        <FormField
          label={L('E-Mail', 'Email')}
          value={email}
          onChangeText={setEmail}
          placeholder="kontakt@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <FormField
          label={L('Telefon', 'Phone')}
          value={phone}
          onChangeText={setPhone}
          placeholder="+49 …"
          keyboardType="phone-pad"
        />
      </Card>

      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Adresse', 'Address')}
          value={address}
          onChangeText={setAddress}
          placeholder={L('Straße, PLZ Ort', 'Street, ZIP city')}
          multiline
        />
        <LocationPicker
          latitude={latitude}
          longitude={longitude}
          onChange={(lat, lng) => {
            setLatitude(lat)
            setLongitude(lng)
          }}
          label={L('Standort auf Karte', 'Map location')}
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
