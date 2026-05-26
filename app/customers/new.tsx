/**
 * Create a new customer. Thin host around CustomerForm — handles submit,
 * navigation, and the access check for non-managerial roles.
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'

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
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Kunden anlegen.',
            'Only admins or dispatchers can create customers.',
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
          {L('Neuer Kunde', 'New customer')}
        </Text>
      </View>

      <CustomerForm
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Kunde speichern', 'Save customer')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Firmenname ist erforderlich.', 'Company name is required.'))
            return
          }
          setSaving(true)
          try {
            await createCustomer(input)
            toast.success(L('Kunde angelegt', 'Customer created'))
            router.replace('/customers')
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
