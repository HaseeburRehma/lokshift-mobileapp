/**
 * Per-employee Time Account Overview (admin / dispatcher drill-in).
 *
 * Mirrors the webapp's `TimeAccountOverview` when an admin drills into an
 * employee from the personnel screen:
 *   - Back nav bar with the employee's name (web mobile layout)
 *   - Title "Zeitkonto von [Name]" + subtitle
 *   - 4 stat cards (Stundensaldo · Bezahlte Überstunden · Gesamtstunden
 *     of the latest month · Arbeitstage)
 *   - Monatsübersicht card — each row → /account/[month]?employeeId=…
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { BackNavBar, C } from '@/components/time/ui'
import { FourStatsGrid, MonthlyBreakdownCard } from '@/components/time/account'
import { useTranslation } from '@/lib/i18n'
import { useTimeAccount } from '@/hooks/useTimeAccount'
import { useSafeBack } from '@/lib/use-safe-back'
import { getSupabase } from '@/lib/supabase/client'

export default function EmployeeOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/account')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const { monthlyData, totalBalance, loading, refetch } = useTimeAccount(id)

  // Light employee-name lookup — avoids waiting for the org-accounts hook
  // (which only runs when this screen is reached from /account).
  const [employeeName, setEmployeeName] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    getSupabase()
      .from('profiles')
      .select('id, full_name')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }: any) => {
        if (alive && data?.full_name) setEmployeeName(data.full_name as string)
      })
    return () => {
      alive = false
    }
  }, [id])

  const overtimePaid = monthlyData.reduce((s, m) => s + (m.difference > 0 ? m.difference : 0), 0)

  if (loading && monthlyData.length === 0) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color={C.blue600} />
        <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400, marginTop: 16 }}>
          {L('Zeitkonto wird geladen…', 'Loading time account…')}
        </Text>
      </Screen>
    )
  }

  const displayName = employeeName ?? L('Mitarbeiter', 'Employee')

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <BackNavBar title={displayName} onBack={goBack} backLabel={L('Zurück zur Personalliste', 'Back to Personnel')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={C.brand} />}
      >
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: C.brand, letterSpacing: -0.5, lineHeight: 30 }}>
            {L(`Zeitkonto von ${displayName}`, `${displayName}'s Account`)}
          </Text>
          <Text style={{ fontSize: 13, color: C.slate500, marginTop: 4 }}>
            {L('Überstunden und Konto-Salden verfolgen', 'Track overtime and account balances')}
          </Text>
        </View>

        <FourStatsGrid totalBalance={totalBalance} overtimePaid={overtimePaid} latest={monthlyData[0] ?? null} />

        <View style={{ marginTop: 24 }}>
          <MonthlyBreakdownCard
            data={monthlyData}
            onMonthPress={(key) => router.push(`/account/${key}?employeeId=${id}` as any)}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
