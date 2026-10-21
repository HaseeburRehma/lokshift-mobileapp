/**
 * Working-time-models list — admin only. Mirrors the webapp's work-model
 * admin page (/dashboard/settings/global): settings breadcrumb, title +
 * description, "Neues Modell", and one card per model (target hours /
 * week, policy line, description, last-updated) with edit / delete.
 */

import React, { useMemo, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Plus, Pencil, Trash2, ShieldCheck, BarChart } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useWorkModels } from '@/hooks/useWorkModels'
import { useSafeBack } from '@/lib/use-safe-back'
import { safeFormatDate } from '@/lib/safe-format'
import type { WorkingTimeModel } from '@/lib/types'

export default function WorkModelsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { models, loading, fetchModels, deleteModel } = useWorkModels()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchModels()
    } finally {
      setRefreshing(false)
    }
  }, [fetchModels])

  const sorted = useMemo(() => {
    return [...models].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [models])

  if (!canManageUsers(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Administratoren können Arbeitszeitmodelle verwalten.',
            'Only administrators can manage working time models.',
          )}
        </Text>
      </Screen>
    )
  }

  const openCreate = () => router.push('/work-models/new')

  const onDelete = (m: WorkingTimeModel) => {
    Alert.alert(
      L('Modell löschen', 'Delete model'),
      L(
        `Wirklich „${m.name}" löschen?\n\nMitarbeiter mit diesem Modell behalten ihre Zuweisung als „keines".`,
        `Really delete "${m.name}"?\n\nMembers using it will be reset to "none".`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(m.id)
            try {
              await deleteModel(m.id)
              toast.success(L('Arbeitszeitmodell gelöscht', 'Work model deleted'))
            } catch (err: any) {
              toast.error(err?.message ?? L('Löschen fehlgeschlagen', 'Failed to delete model'))
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const dateFmt = locale === 'de' ? 'dd.MM.yyyy' : 'MM/dd/yyyy'

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        {/* Breadcrumb back to settings, as on the web */}
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 24 }}
          className="flex-row items-center self-start mb-4"
          style={{ minHeight: 32 }}
        >
          <ChevronLeft size={16} color="#94A3B8" />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {L('Einstellungen', 'Settings hub')}
          </Text>
        </Pressable>

        <PageHeader
          title={L('Globale Einstellungen', 'Global Settings')}
          subtitle={L(
            'Systemweite Arbeitszeitmodelle und operative Standardwerte konfigurieren.',
            'Configure system-wide working time models and operational defaults.',
          )}
        />

        <Button
          label={L('Neues Modell', 'New model')}
          leftIcon={<Plus size={18} color="#fff" />}
          onPress={openCreate}
          style={{ marginBottom: 16 }}
        />

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#0064E0" />
            <Text
              className="text-[10px] font-black uppercase text-slate-400 mt-4 text-center"
              style={{ letterSpacing: 2.5 }}
            >
              {L('Globale Parameter werden geladen…', 'Loading global parameters…')}
            </Text>
          </View>
        ) : sorted.length === 0 ? (
          <View
            className="items-center py-16 px-6 rounded-[40px] border border-dashed border-slate-200"
            style={{ backgroundColor: 'rgba(248,250,252,0.5)' }}
          >
            <View
              className="w-16 h-16 rounded-[24px] bg-white items-center justify-center"
              style={{ shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
            >
              <BarChart size={32} color="#CBD5E1" />
            </View>
            <Text className="text-[15px] font-bold text-slate-900 text-center mt-4">
              {L('Noch keine Arbeitszeitmodelle angelegt', 'No work models registered yet')}
            </Text>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center mt-1">
              {L('Legen Sie das erste Modell für Ihre Organisation an.', 'Create the first organizational model to begin.')}
            </Text>
            <Pressable
              onPress={openCreate}
              className="flex-row items-center mt-4 h-10 px-6 rounded-xl border border-blue-200 bg-white"
            >
              <Plus size={14} color="#1D4ED8" />
              <Text className="text-[10px] font-bold uppercase tracking-widest text-blue-700 ml-2">
                {L('Erstes Modell anlegen', 'Initialize models')}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {sorted.map((m) => {
              const busy = busyId === m.id
              return (
                <Pressable key={m.id} onPress={() => router.push(`/work-models/${m.id}`)}>
                  <Card
                    style={{
                      borderColor: '#F1F5F9',
                      borderLeftWidth: 6,
                      borderLeftColor: m.is_active ? '#2563EB' : '#CBD5E1',
                      borderRadius: 24,
                      padding: 24,
                    }}
                  >
                    <View style={{ opacity: m.is_active ? 1 : 0.6 }}>
                      <View className="flex-row items-start justify-between">
                        <View className="flex-1 pr-3">
                          <Text className="text-[20px] font-bold tracking-tight text-slate-900">
                            {m.name ?? '—'}
                          </Text>
                          <Text
                            className={`text-[10px] font-black uppercase tracking-widest mt-1 ${
                              m.is_active ? 'text-blue-600/60' : 'text-slate-400'
                            }`}
                          >
                            {m.is_active
                              ? L('Aktives Arbeitszeitmodell', 'Active work model')
                              : L('Inaktives Arbeitszeitmodell', 'Inactive work model')}
                          </Text>
                        </View>
                        <View className="flex-row" style={{ gap: 4 }}>
                          <Pressable
                            onPress={() => router.push(`/work-models/${m.id}`)}
                            disabled={busy}
                            hitSlop={8}
                            accessibilityLabel={L('Bearbeiten', 'Edit')}
                            className="w-9 h-9 rounded-xl items-center justify-center bg-slate-50"
                          >
                            <Pencil size={15} color="#64748B" />
                          </Pressable>
                          <Pressable
                            onPress={() => onDelete(m)}
                            disabled={busy}
                            hitSlop={8}
                            accessibilityLabel={L('Löschen', 'Delete')}
                            className="w-9 h-9 rounded-xl items-center justify-center bg-red-50"
                          >
                            <Trash2 size={15} color={busy ? '#CBD5E1' : '#EF4444'} />
                          </Pressable>
                        </View>
                      </View>

                      <View className="rounded-2xl p-5 mt-5 border border-slate-50" style={{ backgroundColor: 'rgba(248,250,252,0.5)' }}>
                        <View className="flex-row items-center justify-between">
                          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {L('Sollstunden', 'Target hours')}
                          </Text>
                          <Text className="text-[20px] font-black text-slate-900 tracking-tighter">
                            {`${m.target_hours_per_week ?? 0}h`}
                            <Text className="text-[10px] font-bold text-slate-400 tracking-normal">
                              {` / ${L('Woche', 'week')}`}
                            </Text>
                          </Text>
                        </View>
                        <View className="h-[2px] w-full bg-blue-100 rounded-full overflow-hidden mt-4">
                          <View className="h-full w-full bg-blue-600" />
                        </View>
                        <View className="flex-row items-center mt-4">
                          <View className="w-8 h-8 rounded-xl bg-white border border-slate-100 items-center justify-center">
                            <ShieldCheck size={16} color="#2563EB" />
                          </View>
                          <Text className="text-[10px] font-bold uppercase tracking-tight text-slate-500 ml-3">
                            {L('Standardisierte Richtlinie', 'Standardized policy')}
                          </Text>
                        </View>
                      </View>

                      <Text className="text-[14px] font-medium italic text-slate-500 mt-5" style={{ lineHeight: 21 }}>
                        {m.description || L('Keine Beschreibung vorhanden.', 'No description provided.')}
                      </Text>

                      <Text
                        className="text-[9px] font-black uppercase text-slate-300 mt-5"
                        style={{ letterSpacing: 1.8 }}
                      >
                        {`${L('Zuletzt aktualisiert:', 'Last updated:')} ${safeFormatDate(m.updated_at, dateFmt)}`}
                      </Text>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}
