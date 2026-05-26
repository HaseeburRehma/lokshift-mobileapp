/**
 * Create a new qualification — always for the current user. Admins
 * editing for another employee go via /users/[id] (follow-up).
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { QualificationForm } from '@/components/forms/QualificationForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useQualifications } from '@/hooks/useQualifications'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewQualificationScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/qualifications')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { createItem } = useQualifications()
  const [saving, setSaving] = useState(false)

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Neue Qualifikation', 'New qualification')}
        </Text>
      </View>

      <QualificationForm
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Hinzufügen', 'Add')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Bezeichnung ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await createItem(input)
            toast.success(L('Qualifikation hinzugefügt', 'Qualification added'))
            router.replace('/qualifications')
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
