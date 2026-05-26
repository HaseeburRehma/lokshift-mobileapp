/**
 * Edit / delete a qualification. Admin / dispatcher can additionally
 * flip the verification flag.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, Pressable, Alert, ScrollView, Switch } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2, CheckCircle2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { QualificationForm } from '@/components/forms/QualificationForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useQualifications } from '@/hooks/useQualifications'
import { useSafeBack } from '@/lib/use-safe-back'

export default function EditQualificationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/qualifications')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session } = useUser()
  const myId = session?.user?.id ?? null
  const { items, updateItem, deleteItem, setVerified, isManagerial, loading } =
    useQualifications()

  const item = useMemo(() => items.find((q) => q.id === id) ?? null, [items, id])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  React.useEffect(() => {
    if (!loading && !item) router.replace('/qualifications')
  }, [loading, item, router])

  if (!item) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const isOwner = item.user_id === myId
  const canEdit = isOwner || isManagerial

  const onDelete = () => {
    Alert.alert(
      L('Qualifikation löschen', 'Delete qualification'),
      L(`„${item.name}" wirklich löschen?`, `Really delete "${item.name}"?`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteItem(item.id)
              toast.success(L('Gelöscht', 'Deleted'))
              router.replace('/qualifications')
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

  const onToggleVerified = async (next: boolean) => {
    setBusy(true)
    try {
      await setVerified(item.id, next)
      toast.success(
        next
          ? L('Qualifikation bestätigt', 'Qualification verified')
          : L('Bestätigung entfernt', 'Verification removed'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        {canEdit && (
          <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={busy}>
            <Trash2 size={22} color={busy ? '#9CA3AF' : '#DC2626'} />
          </Pressable>
        )}
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {canEdit ? L('Qualifikation bearbeiten', 'Edit qualification') : L('Qualifikation', 'Qualification')}
        </Text>
        {isManagerial && item.user?.full_name && (
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">
            {L('von', 'for')} {item.user.full_name}
          </Text>
        )}
      </View>

      {isManagerial && (
        <View className="px-5 pb-3">
          <Card className="flex-row items-center">
            <CheckCircle2 size={20} color={item.is_verified ? '#10B981' : '#94A3B8'} />
            <View className="flex-1 ml-3 pr-2">
              <Text className="text-[13px] font-black text-gray-900 dark:text-white">
                {L('Bestätigt', 'Verified')}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                {L(
                  'Sichtbar für Mitarbeiter als grüner Haken.',
                  'Shown to the employee as a green check.',
                )}
              </Text>
            </View>
            <Switch
              value={item.is_verified}
              onValueChange={onToggleVerified}
              disabled={busy}
              trackColor={{ true: '#10B981', false: '#D1D5DB' }}
            />
          </Card>
        </View>
      )}

      {canEdit ? (
        <QualificationForm
          initial={item}
          submitting={saving}
          submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
          onSubmit={async (input) => {
            if (!input.name) {
              toast.error(L('Bezeichnung ist erforderlich.', 'Name is required.'))
              return
            }
            setSaving(true)
            try {
              await updateItem(item.id, input)
              toast.success(L('Gespeichert', 'Saved'))
              router.replace('/qualifications')
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setSaving(false)
            }
          }}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          <Card>
            <Text className="text-[12px] text-gray-500 dark:text-slate-400">
              {L(
                'Sie können diese Qualifikation nicht bearbeiten.',
                'You cannot edit this qualification.',
              )}
            </Text>
          </Card>
        </ScrollView>
      )}
    </Screen>
  )
}
