/**
 * Edit an existing shift template — same form as `new.tsx`, pre-filled
 * with the current row. Delete lives here (not in the list) so it
 * requires a deliberate intent.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { ShiftTemplateForm } from '@/components/forms/ShiftTemplateForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useShiftTemplates } from '@/hooks/useShiftTemplates'
import type { ShiftTemplate } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

export default function EditShiftTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/shift-templates')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { templates, updateTemplate, deleteTemplate, loading } = useShiftTemplates()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const tpl: ShiftTemplate | undefined = templates.find((t) => t.id === id)

  useEffect(() => {
    if (!loading && !tpl) {
      // Template doesn't exist (or got deleted in another session) —
      // route back so the user doesn't sit on a blank form.
      router.replace('/shift-templates')
    }
  }, [loading, tpl, router])

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Vorlagen bearbeiten.',
            'Only admins or dispatchers can edit templates.',
          )}
        </Text>
      </Screen>
    )
  }

  if (!tpl) {
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
      L('Vorlage löschen', 'Delete template'),
      L(
        `Wirklich „${tpl.name}" löschen?`,
        `Really delete "${tpl.name}"?`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await deleteTemplate(tpl.id)
              toast.success(L('Vorlage gelöscht', 'Template deleted'))
              router.replace('/shift-templates')
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setDeleting(false)
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
        <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={deleting}>
          <Trash2 size={22} color={deleting ? '#9CA3AF' : '#DC2626'} />
        </Pressable>
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {L('Vorlage bearbeiten', 'Edit template')}
        </Text>
      </View>

      <ShiftTemplateForm
        initial={tpl}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Name ist erforderlich.', 'Name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateTemplate(tpl.id, input)
            toast.success(L('Vorlage gespeichert', 'Template saved'))
            router.replace('/shift-templates')
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
