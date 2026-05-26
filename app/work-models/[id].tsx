/**
 * Edit / delete a working-time model — admin only.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { WorkModelForm } from '@/components/forms/WorkModelForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useWorkModels } from '@/hooks/useWorkModels'
import type { WorkingTimeModel } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

export default function EditWorkModelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/work-models')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { models, updateModel, deleteModel, loading } = useWorkModels()
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const model: WorkingTimeModel | undefined = models.find((m) => m.id === id)

  useEffect(() => {
    if (!loading && !model) router.replace('/work-models')
  }, [loading, model, router])

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können Arbeitszeitmodelle bearbeiten.',
            'Only administrators can edit work models.',
          )}
        </Text>
      </Screen>
    )
  }

  if (!model) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const onDelete = () => {
    Alert.alert(
      L('Modell löschen', 'Delete model'),
      L(
        `Wirklich „${model.name}" löschen?\n\nMitarbeiter mit diesem Modell behalten ihre Zuweisung als „keines".`,
        `Really delete "${model.name}"?\n\nMembers using it will be reset to "none".`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteModel(model.id)
              toast.success(L('Modell gelöscht', 'Model deleted'))
              router.replace('/work-models')
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
        <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={busy}>
          <Trash2 size={22} color={busy ? '#9CA3AF' : '#DC2626'} />
        </Pressable>
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {L('Modell bearbeiten', 'Edit model')}
        </Text>
      </View>

      <WorkModelForm
        initial={model}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateModel(model.id, input)
            toast.success(L('Modell gespeichert', 'Model saved'))
            router.replace('/work-models')
          } catch (err: any) {
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
