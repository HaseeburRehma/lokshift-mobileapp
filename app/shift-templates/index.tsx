/**
 * Schichtvorlagen — admin/dispatcher only. Mobile home of the webapp's
 * "Vorlagen verwalten" (components/shared/ShiftTemplatePicker.tsx): every
 * template with name, times (+1 when it ends the next day), duration,
 * customer, location/route and overnight marker. Tap to edit (delete
 * lives in the edit screen so a stray tap never removes a template).
 */

import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { BookMarked, Plus, Hotel, Moon, ChevronRight } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useShiftTemplates } from '@/hooks/useShiftTemplates'
import { useSafeBack } from '@/lib/use-safe-back'

export default function ShiftTemplatesScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { templates, loading, fetchTemplates } = useShiftTemplates()
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchTemplates()
    } finally {
      setRefreshing(false)
    }
  }, [fetchTemplates])

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Vorlagen verwalten.',
            'Only admins or dispatchers can manage templates.',
          )}
        </Text>
      </Screen>
    )
  }

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        <PageHeader
          showBack
          onBack={goBack}
          title={L('Schichtvorlagen', 'Shift templates')}
          subtitle={L(
            'Einmal anlegen, beim Plan-Erstellen mit einem Klick übernehmen.',
            'Define once, apply with one tap when creating a plan.',
          )}
        />

        <Pressable onPress={() => router.push('/shift-templates/new')} style={{ marginTop: -8, marginBottom: 16 }}>
          <View style={{ height: 50, borderRadius: 16, backgroundColor: '#0064E0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color="#FFFFFF" />
            <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{L('Vorlage hinzufügen', 'Add template')}</Text>
          </View>
        </Pressable>

        {loading ? (
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color="#0064E0" />
            <Text style={{ marginTop: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>
              {L('Lade Vorlagen …', 'Loading templates …')}
            </Text>
          </View>
        ) : templates.length === 0 ? (
          <Card style={{ borderColor: '#F1F5F9' }}>
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <BookMarked size={30} color="#CBD5E1" />
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#64748B', marginTop: 12 }}>
                {L('Keine Vorlagen vorhanden', 'No templates yet')}
              </Text>
              <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 4, textAlign: 'center' }}>
                {L(
                  'Tippen Sie auf „Vorlage hinzufügen“ oder speichern Sie beim Plan-Erstellen „Als Vorlage“.',
                  'Tap "Add template" or use "Save as template" while creating a plan.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {templates.map((tpl) => {
              const nextDay = !!tpl.start_time && !!tpl.end_time && tpl.end_time < tpl.start_time
              const extra = [tpl.location, tpl.route].filter(Boolean).join(' · ')
              return (
                <Pressable key={tpl.id} onPress={() => router.push(`/shift-templates/${tpl.id}`)}>
                  <View style={{ borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <BookMarked size={18} color="#0064E0" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>{tpl.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#334155', fontVariant: ['tabular-nums'] }}>
                          {tpl.start_time}–{tpl.end_time}
                        </Text>
                        {nextDay ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4, borderRadius: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 4 }}>
                            <Moon size={9} color="#4338CA" />
                            <Text style={{ fontSize: 10, fontWeight: '900', color: '#4338CA', marginLeft: 1 }}>+1</Text>
                          </View>
                        ) : null}
                        {tpl.duration_days > 1 ? (
                          <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>{` · ${tpl.duration_days} ${L('Tage', 'days')}`}</Text>
                        ) : null}
                        {tpl.overnight_stay ? <Hotel size={13} color="#0064E0" style={{ marginLeft: 6 }} /> : null}
                      </View>
                      {tpl.customer?.name ? (
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B', marginTop: 2 }} numberOfLines={1}>{tpl.customer.name}</Text>
                      ) : null}
                      {extra ? (
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }} numberOfLines={1}>{extra}</Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color="#CBD5E1" />
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}
