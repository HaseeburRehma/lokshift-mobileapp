/**
 * Per-employee Time Account Overview (admin / dispatcher drill-in).
 *
 * Mirrors the webapp's `TimeAccountOverview` component when an admin
 * drills into a specific employee from the personnel screen:
 *   - Sticky back nav with the employee's name
 *   - Big page title ("Zeitkonto von [Name]")
 *   - 4 stat cards (Hours Balance YTD · Overtime Paid · Latest-month
 *     Total Hours · Latest-month Working Days)
 *   - Monthly Breakdown card — each row tappable → /account/[month]?employeeId=…
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useTimeAccount } from '@/hooks/useTimeAccount'
import { useSafeBack } from '@/lib/use-safe-back'
import { getSupabase } from '@/lib/supabase/client'
import { FourStatsGrid, MonthRow } from '../index'

export default function EmployeeOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/account')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')

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

  const overtimePaid = monthlyData.reduce(
    (s, m) => s + (m.difference > 0 ? m.difference : 0),
    0,
  )
  const latest = monthlyData[0]

  if (loading && monthlyData.length === 0) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color="#0064E0" />
        <Text className="text-[12px] font-medium text-gray-400 dark:text-slate-500 mt-3">
          {L('Zeitkonto wird geladen…', 'Loading time account…')}
        </Text>
      </Screen>
    )
  }

  const displayName = employeeName ?? L('Mitarbeiter', 'Employee')

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      {/* Sticky back nav */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderColor: '#F1F5F9',
          backgroundColor: '#FFFFFF',
          position: 'relative',
        }}
      >
        <Pressable
          onPress={goBack}
          style={({ pressed }: { pressed: boolean }) => ({
            position: 'absolute',
            left: 16,
            width: 32,
            height: 32,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: '#E5E7EB',
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={16} color="#2563EB" />
        </Pressable>
        <Text className="text-[15px] font-bold text-gray-900 dark:text-white tracking-tight" numberOfLines={1}>
          {displayName}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        <View className="mb-4 px-1">
          <Text className="text-[26px] font-black text-[#0064E0] tracking-tight leading-tight">
            {L(`Zeitkonto von ${displayName}`, `${displayName}'s Account`)}
          </Text>
          <Text className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5">
            {L('Überstunden und Konto-Salden verfolgen', 'Track overtime and account balances')}
          </Text>
        </View>

        <FourStatsGrid
          totalBalance={totalBalance}
          overtimePaid={overtimePaid}
          latestActual={latest?.actualHours ?? 0}
          latestMonthLabel={latest?.label ?? '—'}
          workingDays={latest?.workingDays ?? 0}
          hr={hr}
        />

        <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1 mt-2">
          {L('Monatsübersicht', 'Monthly Breakdown')}
        </Text>

        {monthlyData.length === 0 && !loading ? (
          <Card className="items-center py-10">
            <Text className="text-[14px] text-gray-400 dark:text-slate-500">
              {L('Keine Zeiteinträge gefunden.', 'No time records found.')}
            </Text>
          </Card>
        ) : null}

        {monthlyData.map((m) => (
          <MonthRow
            key={m.key}
            monthLabel={m.label}
            workingDays={m.workingDays}
            actualHours={m.actualHours}
            targetHours={m.targetHours}
            difference={m.difference}
            hr={hr}
            onPress={() => router.push(`/account/${m.key}?employeeId=${id}` as any)}
          />
        ))}
      </ScrollView>
    </Screen>
  )
}
