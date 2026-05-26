/**
 * Create a new Betriebsstelle.
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
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
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Betriebsstellen anlegen.',
            'Only admins or dispatchers can create locations.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Neue Betriebsstelle', 'New location')}
        </Text>
      </View>

      <OperationalLocationForm
        submitting={saving}
        submitLabel={
          saving ? t('common.loading') : L('Betriebsstelle speichern', 'Save location')
        }
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await createLocation(input)
            toast.success(L('Betriebsstelle angelegt', 'Location created'))
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
