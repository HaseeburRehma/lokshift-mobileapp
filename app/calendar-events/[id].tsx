/**
 * Edit / delete a calendar event. Only the creator (or an admin) can
 * modify the row; RLS enforces the same on the server. Member edits
 * replace the entire attendee set so a single tap removes everyone.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2 } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { CalendarEventForm } from '@/components/forms/CalendarEventForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useSafeBack } from '@/lib/use-safe-back'

export default function EditCalendarEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/calendar')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session, role } = useUser()
  const myId = session?.user?.id ?? null
  const { events, updateEvent, deleteEvent, loading } = useCalendarEvents()

  const event = useMemo(() => events.find((e) => e.id === id) ?? null, [events, id])
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!loading && !event) router.replace('/(tabs)/calendar')
  }, [loading, event, router])

  if (!event) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const isOwner = event.creator_id === myId
  const canEdit = isOwner || canManageUsers(role)

  const memberIds = (event.members ?? []).map((m: any) => m.user?.id).filter(Boolean)

  const onDelete = () => {
    Alert.alert(
      L('Termin löschen', 'Delete event'),
      L(`„${event.title}" wirklich löschen?`, `Really delete "${event.title}"?`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteEvent(event.id)
              toast.success(L('Termin gelöscht', 'Event deleted'))
              router.replace('/(tabs)/calendar')
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
        {canEdit && (
          <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={busy}>
            <Trash2 size={22} color={busy ? '#9CA3AF' : '#DC2626'} />
          </Pressable>
        )}
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {canEdit ? L('Termin bearbeiten', 'Edit event') : L('Termin', 'Event')}
        </Text>
      </View>

      {!canEdit ? (
        <View className="px-5 py-6">
          <Text className="text-[15px] font-black text-gray-900 dark:text-white mb-1">
            {event.title}
          </Text>
          {event.description && (
            <Text className="text-[13px] text-gray-600 dark:text-slate-400 mt-2">
              {event.description}
            </Text>
          )}
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-4">
            {L('Nur der Ersteller kann den Termin bearbeiten.', 'Only the creator can edit this event.')}
          </Text>
        </View>
      ) : (
        <CalendarEventForm
          initial={{ ...event, member_ids: memberIds }}
          submitting={saving}
          submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
          onSubmit={async (input) => {
            if (!input.title) {
              toast.error(L('Titel ist erforderlich.', 'Title is required.'))
              return
            }
            setSaving(true)
            try {
              await updateEvent(event.id, input)
              toast.success(L('Termin gespeichert', 'Event saved'))
              router.replace('/(tabs)/calendar')
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
    </Screen>
  )
}
