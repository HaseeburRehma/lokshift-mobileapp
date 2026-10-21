/**
 * Monatsnachweis — target of the "Monatsnachweis" card on the Reports
 * screen (webapp: /dashboard/times/monthly). One employee (or several),
 * one month, exported as PDF or Excel from the shared report model.
 */

import React from 'react'
import { ScrollView, Pressable, View, Text } from 'react-native'
import { Eye, ChevronRight } from 'lucide-react-native'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { MonatsnachweisPanel } from '@/components/reports/MonatsnachweisPanel'
import { useTranslation } from '@/lib/i18n'

export default function MonthlyStatementScreen() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/reports')
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}>
        <PageHeader
          title={L('Monatsnachweis', 'Monthly statement')}
          subtitle={L(
            'Export als PDF oder Excel – für einen oder mehrere Mitarbeiter in einer Datei',
            'Export as PDF or Excel – one or several employees in one file',
          )}
          showBack
          onBack={goBack}
        />
        {/* The on-screen statement (one employee, all days) lives under Zeiten. */}
        <Pressable onPress={() => router.push('/times/monthly' as any)} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', padding: 14 }}>
            <Eye size={18} color="#0064E0" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E3A8A' }}>{L('Am Bildschirm ansehen', 'View on screen')}</Text>
              <Text style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                {L('Alle Tage, Summen und Hinweise eines Mitarbeiters – mit PDF- und Excel-Export.', 'All days, totals and notes for one employee – with PDF and Excel export.')}
              </Text>
            </View>
            <ChevronRight size={18} color="#0064E0" />
          </View>
        </Pressable>
        <MonatsnachweisPanel />
      </ScrollView>
    </Screen>
  )
}
