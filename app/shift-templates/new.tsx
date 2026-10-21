/**
 * Create a new shift template. The form lives in
 * components/forms/ShiftTemplateForm so this screen stays a thin host
 * responsible for hook invocation and navigation.
 */

import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { ShiftTemplateForm } from '@/components/forms/ShiftTemplateForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useShiftTemplates } from '@/hooks/useShiftTemplates'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewShiftTemplateScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/shift-templates')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { createTemplate } = useShiftTemplates()
  const [saving, setSaving] = useState(false)

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Vorlagen erstellen.',
            'Only admins or dispatchers can create templates.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <PageHeader
          showBack
          onBack={goBack}
          title={L('Neue Vorlage', 'New template')}
          subtitle={L('Kunde, Route, Zeiten und Übernachtung als wiederverwendbare Vorlage', 'Customer, route, times and overnight stay as a reusable template')}
        />
      </View>

      <ShiftTemplateForm
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Vorlage speichern', 'Save template')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await createTemplate(input)
            toast.success(L('Vorlage erstellt', 'Template created'))
            router.replace('/shift-templates')
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
