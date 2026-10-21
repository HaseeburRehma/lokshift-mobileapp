/**
 * Edit an existing shift template — same form as `new.tsx`, pre-filled
 * with the current row. Delete lives here (not in the list) so it
 * requires a deliberate intent.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Trash2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
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
      <Screen background="#FFFFFF" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0064E0" />
          <Text style={{ marginTop: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>{t('common.loading')}</Text>
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
    <Screen background="#FFFFFF" noTapToDismiss>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <PageHeader
          showBack
          onBack={goBack}
          title={L('Vorlage bearbeiten', 'Edit template')}
          subtitle={tpl.name}
          rightSlot={
            <Pressable
              onPress={onDelete}
              disabled={deleting}
              accessibilityLabel={L('Vorlage löschen', 'Delete template')}
              style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={20} color={deleting ? '#9CA3AF' : '#DC2626'} />
            </Pressable>
          }
        />
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
