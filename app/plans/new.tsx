/**
 * Create a single plan. Mirrors the webapp's plans/new page including
 * Betriebsstellen (start/destination), Gastfahrt, overnight + hotel,
 * and a template picker that pre-fills the form.
 *
 * Access control: managerial roles only (admin / dispatcher).
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { ChevronLeft, CalendarPlus } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PlanForm } from '@/components/forms/PlanForm'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useSafeBack } from '@/lib/use-safe-back'

export default function NewPlanScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const goBack = useSafeBack('/plans')
  const { role } = useUser()

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten dürfen Pläne anlegen.',
            'Only admins or dispatchers can create plans.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen className="bg-gray-50 dark:bg-slate-950" background="#F9FAFB" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Plan erstellen', 'Create plan')}
        </Text>
      </View>

      <View className="flex-row items-center px-5 mb-2">
        <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
          <CalendarPlus size={26} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-black text-gray-900 dark:text-white">
            {L('Neue Schicht', 'New shift')}
          </Text>
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
            {L('Einem Mitarbeiter zuweisen', 'Assign to one employee')}
          </Text>
        </View>
      </View>

      <PlanForm showBulkCta />
    </Screen>
  )
}
