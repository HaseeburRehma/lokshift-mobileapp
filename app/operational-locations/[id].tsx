/**
 * Edit an existing Betriebsstelle. Archive (soft) and delete (hard,
 * confirm-gated, may fail on FK). Archive is the recommended action;
 * delete is reserved for never-used rows.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2, Archive, ArchiveRestore } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
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
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
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
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
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
          ? L('Betriebsstelle archiviert', 'Location archived')
          : L('Betriebsstelle reaktiviert', 'Location reactivated'),
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
        `Wirklich „${loc.name}" endgültig löschen?\n\nWenn diese Betriebsstelle in Plänen oder Zeiteinträgen verwendet wird, kann das Löschen fehlschlagen.`,
        `Really delete "${loc.name}" permanently?\n\nIf this location is referenced by plans or time entries, the delete may fail.`,
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
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={onArchive} className="p-2" disabled={busy}>
            {loc.is_active ? (
              <Archive size={22} color={busy ? '#9CA3AF' : '#0064E0'} />
            ) : (
              <ArchiveRestore size={22} color={busy ? '#9CA3AF' : '#10B981'} />
            )}
          </Pressable>
          <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={busy}>
            <Trash2 size={22} color={busy ? '#9CA3AF' : '#DC2626'} />
          </Pressable>
        </View>
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {L('Betriebsstelle bearbeiten', 'Edit location')}
        </Text>
      </View>

      <OperationalLocationForm
        initial={loc}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateLocation(loc.id, input)
            toast.success(L('Betriebsstelle gespeichert', 'Location saved'))
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
