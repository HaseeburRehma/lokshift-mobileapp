/**
 * Create a working-time model — admin only. Copy mirrors the webapp's
 * WorkModelForm dialog ("Neues Arbeitszeitmodell").
 */

import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
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
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Administratoren können Arbeitszeitmodelle anlegen.',
            'Only administrators can create work models.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <PageHeader
          title={L('Neues Arbeitszeitmodell', 'New Work Model')}
          subtitle={L(
            'Systemweite Arbeitszeitmodelle und operative Standardwerte konfigurieren.',
            'Configure system-wide working time models and operational defaults.',
          )}
          showBack
          onBack={goBack}
        />
      </View>

      <WorkModelForm
        submitting={saving}
        submitLabel={saving ? L('Speichern...', 'Saving...') : L('Modell erstellen', 'Create Model')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await createModel(input)
            toast.success(L('Arbeitszeitmodell erstellt', 'Work model created'))
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
