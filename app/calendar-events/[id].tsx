/**
 * Edit / delete a calendar event. Only the creator (or an admin) can
 * modify the row; RLS enforces the same on the server. Member edits
 * replace the entire attendee set so a single tap removes everyone.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Calendar as CalendarIcon, Trash2, X } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { CalendarEventForm } from '@/components/forms/CalendarEventForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useCalendarEvents } from '@/hooks/useCalendarEvents'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'

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
      L('Diesen Termin wirklich löschen?', 'Are you sure you want to delete this event?'),
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
              captureError(err, { tags: { action: 'calendar-event.delete' } })
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
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      {/* Header — web NewEventSheet: icon + "Termin bearbeiten", delete, close */}
      <View
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <View style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <CalendarIcon size={22} color="#0064E0" />
          </View>
          <Text style={{ fontSize: 20, fontWeight: '900', color: '#111827', flexShrink: 1 }} numberOfLines={1}>
            {canEdit ? L('Termin bearbeiten', 'Edit Event') : L('Termin', 'Event')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {canEdit ? (
            <Pressable
              onPress={onDelete}
              disabled={busy}
              hitSlop={8}
              accessibilityLabel={L('Löschen', 'Delete')}
              style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}
            >
              <Trash2 size={18} color={busy ? '#9CA3AF' : '#DC2626'} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={goBack}
            hitSlop={8}
            accessibilityLabel={L('Schließen', 'Close')}
            style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={20} color="#9CA3AF" />
          </Pressable>
        </View>
      </View>
      <View style={{ height: 16 }} />

      {!canEdit ? (
        <View className="px-5 py-6">
          <Text className="text-[15px] font-black text-gray-900 dark:text-white mb-1">
            {event.title}
          </Text>
          {event.description ? (
            <Text className="text-[13px] text-gray-600 dark:text-slate-400 mt-2">
              {event.description}
            </Text>
          ) : null}
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
              captureError(err, { tags: { action: 'calendar-event.update' } })
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
