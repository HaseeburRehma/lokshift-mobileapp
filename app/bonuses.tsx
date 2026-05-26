/**
 * Holiday Bonus tab.
 * Employee: read-only year-to-date total + history list.
 * Managerial: same view + floating "+" to grant bonus + summary cards.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { Plus, Gift } from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { HolidayBonusSheet, bonusTypeLabel } from '@/components/HolidayBonusSheet'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useHolidayBonus } from '@/hooks/useHolidayBonus'
import { canApproveTimes } from '@/lib/rbac/permissions'

export default function HolidayBonusScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const canGrant = canApproveTimes(role)

  const { items, loading, fetchItems, grantBonus, ytdTotal } = useHolidayBonus()
  const [sheetOpen, setSheetOpen] = useState(false)
  const dateLocale = locale === 'de' ? deLocale : enUS

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} tintColor="#0064E0" />}
      >
        <PageHeader
          showBack
          title={L('Boni', 'Bonuses')}
          subtitle={L('Urlaubsgeld & Sonderzahlungen', 'Holiday & special payments')}
        />

        <Card className="mb-4" style={{ backgroundColor: '#0064E0' } as any}>
          <Text className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">
            {L('Jahresbetrag', 'Year-to-date')} {new Date().getFullYear()}
          </Text>
          <Text className="text-[32px] font-black text-white">€{ytdTotal.toFixed(2)}</Text>
        </Card>

        {items.length === 0 && !loading ? (
          <Card className="items-center py-10">
            <Gift size={32} color="#D1D5DB" />
            <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">
              {L('Keine Bonuszahlungen.', 'No bonus payments yet.')}
            </Text>
          </Card>
        ) : null}

        {items.map((b) => (
          <Card key={b.id} className="mb-2 flex-row items-center">
            <View className="w-12 h-12 rounded-2xl bg-emerald-50 items-center justify-center mr-3">
              <Gift size={20} color="#10B981" />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-black text-gray-900 dark:text-white">
                €{Number(b.amount).toFixed(2)}
              </Text>
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
                {bonusTypeLabel(b.bonus_type, locale)}
                {' · '}{format(parseISO(b.created_at), 'dd MMM yyyy', { locale: dateLocale })}
              </Text>
              {b.notes && (
                <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{b.notes}</Text>
              )}
              {canGrant && b.employee?.full_name && (
                <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{b.employee.full_name}</Text>
              )}
            </View>
          </Card>
        ))}
      </ScrollView>

      {canGrant && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          className="absolute bottom-24 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center shadow-xl"
        >
          <Plus size={28} color="#fff" />
        </Pressable>
      )}

      <HolidayBonusSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={grantBonus} />
      </Screen>
    </View>
  )
}
