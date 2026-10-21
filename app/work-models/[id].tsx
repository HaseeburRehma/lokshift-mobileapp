/**
 * Edit / delete a working-time model — admin only. Copy mirrors the
 * webapp's WorkModelForm dialog ("Modell bearbeiten").
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
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
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
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
      <Screen background="#F8FAFC" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400">{t('common.loading')}</Text>
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
              toast.success(L('Arbeitszeitmodell gelöscht', 'Work model deleted'))
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
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <PageHeader
          title={L('Modell bearbeiten', 'Edit Model')}
          subtitle={model.name}
          showBack
          onBack={goBack}
          rightSlot={
            <Pressable
              onPress={onDelete}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel={L('Löschen', 'Delete')}
              className="w-10 h-10 rounded-xl border border-red-100 bg-red-50 items-center justify-center"
            >
              <Trash2 size={18} color={busy ? '#CBD5E1' : '#EF4444'} />
            </Pressable>
          }
        />
      </View>

      <WorkModelForm
        initial={model}
        submitting={saving}
        submitLabel={saving ? L('Speichern...', 'Saving...') : L('Aktualisieren', 'Update')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateModel(model.id, input)
            toast.success(L('Arbeitszeitmodell aktualisiert', 'Work model updated'))
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
