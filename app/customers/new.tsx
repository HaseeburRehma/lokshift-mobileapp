/**
 * Create a new customer. Thin host around CustomerForm — handles submit,
 * navigation, and the access check for non-managerial roles. Copy
 * mirrors the webapp's CustomerForm dialog ("Neuen Kunden anlegen").
 */

import React, { useState } from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'

export default function NewCustomerScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/customers')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { createCustomer } = useCustomers()
  const [saving, setSaving] = useState(false)

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Kunden anlegen.',
            'Only admins or dispatchers can create customers.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <PageHeader
          title={L('Neuen Kunden anlegen', 'Create New Customer')}
          subtitle={L('Einsatzorte und Kundenkontakte verwalten', 'Organize project sites & client contacts')}
          showBack
          onBack={goBack}
        />
      </View>

      <CustomerForm
        submitting={saving}
        submitLabel={saving ? L('Wird gespeichert…', 'Processing...') : L('Kunde speichern', 'Save Customer')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Kundenname ist erforderlich', 'Customer name is required'))
            return
          }
          setSaving(true)
          try {
            await createCustomer(input)
            toast.success(L('Kunde angelegt', 'Customer added'))
            router.replace('/customers')
          } catch (err: any) {
            captureError(err, { tags: { action: 'customer.create' } })
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
