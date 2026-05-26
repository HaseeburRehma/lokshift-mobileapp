/**
 * Edit an existing plan. Admin/Dispatcher only — mirrors web
 * /dashboard/plans/[id]/edit. Reuses the shared <PlanForm /> in edit
 * mode (initialPlan pre-fills, submit updates).
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, Pressable } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, PenSquare } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PlanForm } from '@/components/forms/PlanForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'
import type { Plan } from '@/lib/types'

export default function EditPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack(id ? `/plans/${id}` : '/plans')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    if (!id) return
    ;(async () => {
      const { data, error } = await getSupabase()
        .from('plans')
        .select('*, employee:profiles!employee_id(*), customer:customers(*)')
        .eq('id', id)
        .single()
      if (!alive) return
      if (error || !data) {
        setNotFound(true)
      } else {
        setPlan(data as Plan)
      }
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [id])

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten dürfen Pläne bearbeiten.',
            'Only admins or dispatchers can edit plans.',
          )}
        </Text>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color="#0064E0" />
      </Screen>
    )
  }

  if (notFound || !plan) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L('Plan nicht gefunden.', 'Plan not found.')}
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
          {L('Plan bearbeiten', 'Edit plan')}
        </Text>
      </View>

      <View className="flex-row items-center px-5 mb-2">
        <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
          <PenSquare size={24} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-[15px] font-black text-gray-900 dark:text-white">
            {L('Schicht anpassen', 'Update shift')}
          </Text>
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
            {L('Einsatzdetails aktualisieren', 'Update assignment details')}
          </Text>
        </View>
      </View>

      <PlanForm
        initialPlan={plan}
        onSuccess={() => {
          toast.success(L('Plan gespeichert', 'Plan saved'))
          router.replace(`/plans/${plan.id}`)
        }}
      />
    </Screen>
  )
}
