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
        <Text style={{ marginTop: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>
          {L('Plan wird geladen …', 'Loading plan …')}
        </Text>
      </Screen>
    )
  }

  if (notFound || !plan) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text style={{ fontSize: 22, fontWeight: '900', color: '#0F172A', textAlign: 'center' }}>
          {L('Plan nicht gefunden', 'Plan not found')}
        </Text>
        <Pressable onPress={() => router.replace('/plans')} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>← {L('Zurück zu Plänen', 'Back to Plans')}</Text>
        </Pressable>
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
              backgroundColor: '#2563EB',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 14,
              shadowColor: '#2563EB',
              shadowOpacity: 0.25,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 4,
            }}
          >
            <PenSquare size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontWeight: '900', letterSpacing: -0.4, color: '#111827', lineHeight: 28 }}>
              {L('Plan bearbeiten', 'Edit Plan')}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#9CA3AF', marginTop: 4 }}>
              {L('Einsatzdetails aktualisieren', 'Update assignment details')}
            </Text>
          </View>
        </View>
      </View>

      <PlanForm
        initialPlan={plan}
        onSuccess={() => {
          // PlanForm already shows the "Plan gespeichert" toast.
          router.replace(`/plans/${plan.id}`)
        }}
      />
    </Screen>
  )
}
