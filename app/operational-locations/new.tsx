/**
 * Create a new Betriebsstelle — mirrors the webapp's create dialog
 * ("Neue Betriebsstelle").
 */

import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { OperationalLocationForm } from '@/components/forms/OperationalLocationForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useOperationalLocations } from '@/hooks/useOperationalLocations'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewOperationalLocationScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/operational-locations')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { createLocation } = useOperationalLocations()
  const [saving, setSaving] = useState(false)

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Betriebsstellen anlegen.',
            'Only admins or dispatchers can create locations.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <PageHeader
          title={L('Neue Betriebsstelle', 'New location')}
          subtitle={L(
            'Diese Standorte stehen als Start- und Zielort bei der Schichtplanung zur Verfügung.',
            'These locations are available as start and end points in shift planning.',
          )}
          showBack
          onBack={goBack}
        />
      </View>

      <OperationalLocationForm
        submitting={saving}
        submitLabel={saving ? L('Speichert…', 'Saving…') : L('Anlegen', 'Create')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            const created = await createLocation(input)
            toast.success(
              L(`Betriebsstelle „${created?.name ?? input.name}" angelegt`, `Location "${created?.name ?? input.name}" created`),
            )
            router.replace('/operational-locations')
          } catch (err: any) {
            // Friendly UNIQUE-violation hint (matches the web's UX).
            if ((err as any)?.code === '23505') {
              toast.error(
                L(
                  'Eine Betriebsstelle mit diesem Namen existiert bereits.',
                  'A location with this name already exists.',
                ),
              )
            } else {
              toast.error(err?.message ?? t('common.error'))
            }
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
