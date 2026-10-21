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
import { useLocalSearchParams } from 'expo-router'

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
  // Optional prefill from the dashboard "tap empty cell" flow.
  const { employeeId, date } = useLocalSearchParams<{
    employeeId?: string
    date?: string
  }>()

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
    <Screen background="#FFFFFF" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
        <Pressable onPress={goBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: 40, marginLeft: -6 }}>
          <ChevronLeft size={18} color="#64748B" />
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B', marginLeft: 2 }}>{L('Zurück', 'Back')}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 24,
              backgroundColor: '#0064E0',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
              shadowColor: '#0064E0',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <CalendarPlus size={26} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: '#0064E0', lineHeight: 28 }}>
              {L('Neuen Einsatzplan erstellen', 'Create New Operational Plan')}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 4 }}>
              {L('Mitarbeiter, Kunden und Touren zuweisen', 'Assign employees to customers and routes')}
            </Text>
          </View>
        </View>
      </View>

      <PlanForm
        showBulkCta
        initialEmployeeId={employeeId || undefined}
        initialDate={date || undefined}
      />
    </Screen>
  )
}
