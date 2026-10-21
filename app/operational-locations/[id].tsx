/**
 * Edit an existing Betriebsstelle — mirrors the webapp's edit dialog
 * ("Betriebsstelle bearbeiten"). Activate/deactivate (soft) and delete
 * (hard, confirm-gated, may fail on FK) sit in the header like the web
 * row actions. Deactivating is the recommended action; delete is
 * reserved for never-used rows.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2, Power, PowerOff } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { OperationalLocationForm } from '@/components/forms/OperationalLocationForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useOperationalLocations } from '@/hooks/useOperationalLocations'
import type { OperationalLocation } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

export default function EditOperationalLocationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/operational-locations')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { locations, updateLocation, toggleArchive, deleteLocation, loading } =
    useOperationalLocations()
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const loc: OperationalLocation | undefined = locations.find((l) => l.id === id)

  useEffect(() => {
    if (!loading && !loc) router.replace('/operational-locations')
  }, [loading, loc, router])

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Betriebsstellen bearbeiten.',
            'Only admins or dispatchers can edit locations.',
          )}
        </Text>
      </Screen>
    )
  }

  if (!loc) {
    return (
      <Screen background="#F8FAFC" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const onArchive = async () => {
    setBusy(true)
    try {
      await toggleArchive(loc.id, loc.is_active)
      toast.success(
        loc.is_active
          ? L('Betriebsstelle deaktiviert', 'Location deactivated')
          : L('Betriebsstelle aktiviert', 'Location activated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = () => {
    Alert.alert(
      L('Betriebsstelle löschen', 'Delete location'),
      L(
        `Betriebsstelle „${loc.name}" wirklich löschen? Bestehende Einsätze verlieren die Verknüpfung, bleiben aber erhalten.\n\nWenn diese Betriebsstelle in Plänen oder Zeiteinträgen verwendet wird, kann das Löschen fehlschlagen.`,
        `Really delete location "${loc.name}"? Existing shifts lose the link but are kept.\n\nIf this location is referenced by plans or time entries, the delete may fail.`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteLocation(loc.id)
              toast.success(L('Betriebsstelle gelöscht', 'Location deleted'))
              router.replace('/operational-locations')
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <PageHeader
          title={L('Betriebsstelle bearbeiten', 'Edit location')}
          subtitle={L(
            'Diese Standorte stehen als Start- und Zielort bei der Schichtplanung zur Verfügung.',
            'These locations are available as start and end points in shift planning.',
          )}
          showBack
          onBack={goBack}
        />
        <View className="flex-row items-center -mt-2 mb-4">
          <View
            className={`rounded-md border px-2 py-0.5 ${
              loc.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <Text
              className={`text-[10px] font-black uppercase tracking-wider ${
                loc.is_active ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {loc.is_active ? L('Aktiv', 'Active') : L('Inaktiv', 'Inactive')}
            </Text>
          </View>
          <Text className="text-[13px] font-bold text-slate-900 ml-2 mr-3 flex-1" numberOfLines={1}>
            {loc.short_code ? `${loc.short_code} · ${loc.name}` : loc.name}
          </Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <Pressable
              onPress={onArchive}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel={loc.is_active ? L('Deaktivieren', 'Deactivate') : L('Aktivieren', 'Activate')}
              className="w-10 h-10 rounded-xl border border-slate-200 bg-white items-center justify-center"
            >
              {loc.is_active ? (
                <PowerOff size={18} color={busy ? '#CBD5E1' : '#64748B'} />
              ) : (
                <Power size={18} color={busy ? '#CBD5E1' : '#059669'} />
              )}
            </Pressable>
            <Pressable
              onPress={onDelete}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel={L('Löschen', 'Delete')}
              className="w-10 h-10 rounded-xl border border-red-100 bg-red-50 items-center justify-center"
            >
              <Trash2 size={18} color={busy ? '#CBD5E1' : '#EF4444'} />
            </Pressable>
          </View>
        </View>
      </View>

      <OperationalLocationForm
        initial={loc}
        submitting={saving}
        submitLabel={saving ? L('Speichert…', 'Saving…') : L('Speichern', 'Save')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateLocation(loc.id, input)
            toast.success(L('Betriebsstelle aktualisiert', 'Location updated'))
            router.replace('/operational-locations')
          } catch (err: any) {
            if ((err as any)?.code === '23505') {
              toast.error(
                L(
                  'Eine Betriebsstelle mit diesem Namen existiert bereits.',
                  'A location with this name already exists.',
                ),
              )
            } else {
              toast.error(err?.message ?? t('common.error'))
            }
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
