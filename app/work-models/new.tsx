/**
 * Create a working-time model — admin only.
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { WorkModelForm } from '@/components/forms/WorkModelForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useWorkModels } from '@/hooks/useWorkModels'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewWorkModelScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/work-models')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { createModel } = useWorkModels()
  const [saving, setSaving] = useState(false)

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können Arbeitszeitmodelle anlegen.',
            'Only administrators can create work models.',
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
          {L('Neues Modell', 'New model')}
        </Text>
      </View>

      <WorkModelForm
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Modell speichern', 'Save model')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await createModel(input)
            toast.success(L('Modell erstellt', 'Model created'))
            router.replace('/work-models')
          } catch (err: any) {
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
