/**
 * Time entry detail screen — mirrors the webapp's /dashboard/times/[id].
 *
 *   Header   ChevronLeft + UPPERCASE-ITALIC "Time Details" + Edit pencil
 *   Focus    Big rounded card · "Total Duration" · giant net-hours number
 *            + StatusBadge + faint decorative clock icon
 *   Grid     Start · End · Break · Customer · Location · Approved By
 *   Notes    Free-form note from the entry, if any
 *   Verify   Admin/Dispatcher-only emerald CTA when entry is unverified
 *
 * Editing goes through the existing <TimeEntrySheet/>, mounted inline so
 * the experience never leaves this route.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Edit2,
  CheckCircle2,
  MapPin,
  Clock,
  FileText,
  User,
  Briefcase,
  Moon,
  Hotel,
} from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { toast } from '@/components/Toast'
import { TimeEntrySheet } from '@/components/TimeEntrySheet'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeEntries } from '@/hooks/useTimeEntries'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'
import { canApproveTimes } from '@/lib/rbac/permissions'
import type { TimeEntry } from '@/lib/types'

export default function TimeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/times')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { session, role, profile } = useUser()
  const { updateEntry, deleteEntry, createEntry, fetchEntries } = useTimeEntries()

  const canVerify = canApproveTimes(role)

  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const fetchEntry = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data, error } = await getSupabase()
      .from('time_entries')
      .select(
        '*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name), verifier:profiles!verified_by(id, full_name), start_location:operational_locations!start_location_id(id, name, short_code), destination_location:operational_locations!destination_location_id(id, name, short_code)',
      )
      .eq('id', id)
      .single()
    if (error || !data) {
      setNotFound(true)
    } else {
      setEntry(data as TimeEntry)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchEntry()
  }, [fetchEntry])

  const isOwner = profile?.id === entry?.employee_id
  const canEdit = !!entry && !entry.is_verified && (isOwner || canVerify)

  const onVerify = async () => {
    if (!entry || !session?.user?.id) return
    setVerifying(true)
    try {
      const { error } = await getSupabase()
        .from('time_entries')
        .update({
          is_verified: true,
          verified_by: session.user.id,
          verified_at: new Date().toISOString(),
        } as any)
        .eq('id', entry.id)
      if (error) throw error
      toast.success(L('Zeiteintrag genehmigt', 'Time entry approved'))
      await fetchEntry()
      await fetchEntries()
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Genehmigen', 'Failed to verify'))
    } finally {
      setVerifying(false)
    }
  }

  const onDelete = () => {
    if (!entry) return
    Alert.alert(
      L('Eintrag löschen?', 'Delete entry?'),
      L(
        'Dieser Vorgang kann nicht rückgängig gemacht werden.',
        'This action cannot be undone.',
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Löschen', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id)
              toast.success(L('Eintrag gelöscht', 'Entry deleted'))
              router.replace('/times' as any)
            } catch (err: any) {
              toast.error(err?.message ?? L('Löschen fehlgeschlagen', 'Delete failed'))
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color="#0064E0" />
      </Screen>
    )
  }

  if (notFound || !entry) {
    return (
      <Screen background="#FFFFFF" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center font-bold tracking-widest uppercase">
          {L('Eintrag nicht gefunden', 'Entry not found')}
        </Text>
      </Screen>
    )
  }

  const netHours = Number(entry.net_hours ?? 0).toFixed(1)
  const status = entry.is_verified ? 'confirmed' : 'assigned' // map to StatusBadge palette

  return (
    <Screen background="#FFFFFF" className="bg-white dark:bg-slate-950" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingBottom: 64 }}>
        {/* Navigation Header */}
        <View className="px-6 pt-4 pb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <Pressable
              onPress={goBack}
              style={({ pressed }: { pressed: boolean }) => ({
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? '#F3F4F6' : 'transparent',
              })}
              accessibilityLabel={L('Zurück', 'Back')}
            >
              <ChevronLeft size={24} color="#111827" />
            </Pressable>
            <Text
              className="text-gray-900 dark:text-white ml-2"
              style={{
                fontSize: 22,
                fontWeight: '900',
                letterSpacing: -0.5,
                textTransform: 'uppercase',
                fontStyle: 'italic',
              }}
            >
              {L('Zeiteintrag', 'Time Details')}
            </Text>
          </View>
          {canEdit && (
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={({ pressed }: { pressed: boolean }) => ({
                width: 44,
                height: 44,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#EFF6FF',
                opacity: pressed ? 0.85 : 1,
              })}
              accessibilityLabel={L('Bearbeiten', 'Edit')}
            >
              <Edit2 size={18} color="#0064E0" />
            </Pressable>
          )}
        </View>

        {/* Big focus card — total duration */}
        <View className="px-6 mt-4">
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#F1F5F9',
              borderRadius: 36,
              paddingVertical: 36,
              paddingHorizontal: 24,
              alignItems: 'center',
              shadowColor: '#0064E0',
              shadowOpacity: 0.06,
              shadowRadius: 32,
              shadowOffset: { width: 0, height: 18 },
              elevation: 4,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* Decorative clock — soft watermark */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -28,
                right: -28,
                opacity: 0.05,
              }}
            >
              <Clock size={160} color="#0064E0" />
            </View>

            <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
              {L('Gesamtdauer', 'Total Duration')}
            </Text>
            <Text
              style={{
                color: '#0064E0',
                fontSize: 56,
                fontWeight: '900',
                letterSpacing: -1.5,
                marginTop: 8,
              }}
            >
              {netHours} {L('Std.', 'hrs')}
            </Text>
            <View className="mt-3">
              <StatusBadge status={status} />
            </View>
            <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-3">
              {format(parseISO(entry.date), 'EEEE, dd. MMMM yyyy', { locale: dateLocale })}
            </Text>
          </View>
        </View>

        {/* Detail grid */}
        <View className="px-6 mt-8">
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#F1F5F9',
              borderRadius: 24,
              padding: 20,
            }}
          >
            <View className="flex-row flex-wrap">
              <DetailRow
                icon={<Clock size={18} color="#94A3B8" />}
                label={L('Startzeit', 'Start Time')}
                value={entry.start_time ? format(parseISO(entry.start_time), 'HH:mm') : '—'}
              />
              <DetailRow
                icon={<Clock size={18} color="#94A3B8" />}
                label={L('Endzeit', 'End Time')}
                value={entry.end_time ? format(parseISO(entry.end_time), 'HH:mm') : '—'}
              />
              <DetailRow
                icon={<Clock size={18} color="#94A3B8" />}
                label={L('Pause', 'Break')}
                value={`${entry.break_minutes ?? 0} ${L('Min.', 'mins')}`}
              />
              <DetailRow
                icon={<Briefcase size={18} color="#94A3B8" />}
                label={L('Kunde', 'Customer')}
                value={entry.customer?.name || '—'}
              />
              <DetailRow
                icon={<MapPin size={18} color="#94A3B8" />}
                label={L('Ort', 'Location')}
                value={entry.location || L('Nicht angegeben', 'Not specified')}
              />
              <DetailRow
                icon={<User size={18} color="#94A3B8" />}
                label={L('Mitarbeiter', 'Employee')}
                value={entry.employee?.full_name || '—'}
              />
              {entry.overnight_stay && (
                <DetailRow
                  icon={<Moon size={18} color="#94A3B8" />}
                  label={L('Übernachtung', 'Overnight')}
                  value={L('Ja', 'Yes')}
                />
              )}
              {entry.hotel_address && (
                <DetailRow
                  icon={<Hotel size={18} color="#94A3B8" />}
                  label={L('Hotel', 'Hotel')}
                  value={entry.hotel_address}
                />
              )}
              {entry.is_verified && (
                <DetailRow
                  icon={<CheckCircle2 size={18} color="#10B981" />}
                  label={L('Genehmigt von', 'Approved By')}
                  value={entry.verifier?.full_name || L('System', 'System Auto')}
                />
              )}
            </View>
          </View>
        </View>

        {/* Notes */}
        {entry.notes ? (
          <View className="px-6 mt-6">
            <View className="flex-row items-center mb-2">
              <FileText size={12} color="#94A3B8" />
              <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-2">
                {L('Notizen', 'Notes')}
              </Text>
            </View>
            <Card>
              <Text className="text-[13px] font-bold text-gray-600 dark:text-slate-300 leading-5">
                {entry.notes}
              </Text>
            </Card>
          </View>
        ) : null}

        {/* Admin Verify CTA */}
        {canVerify && !entry.is_verified && (
          <View className="px-6 mt-6">
            <Pressable
              onPress={onVerify}
              disabled={verifying}
              style={({ pressed }: { pressed: boolean }) => ({
                height: 60,
                borderRadius: 24,
                backgroundColor: '#059669',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#10B981',
                shadowOpacity: 0.25,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 6,
                opacity: verifying ? 0.7 : pressed ? 0.9 : 1,
              })}
              accessibilityLabel={L('Eintrag genehmigen', 'Verify entry')}
            >
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '900',
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                }}
              >
                {verifying
                  ? L('Wird genehmigt…', 'Verifying…')
                  : L('Diesen Eintrag genehmigen', 'Verify this entry')}
              </Text>
            </Pressable>
          </View>
        )}

        {/* Delete affordance (admin only) */}
        {canVerify && (
          <View className="px-6 mt-3">
            <Pressable
              onPress={onDelete}
              style={({ pressed }: { pressed: boolean }) => ({
                paddingVertical: 14,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text className="text-[12px] font-black uppercase tracking-widest text-red-500">
                {L('Eintrag löschen', 'Delete entry')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <TimeEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={entry}
        onCreate={createEntry}
        onUpdate={async (eid, patch) => {
          const updated = await updateEntry(eid, patch)
          // refetch joined detail so the displayed verifier/customer reflects
          // any reassignment from inside the sheet
          await fetchEntry()
          return updated
        }}
        onDelete={async (eid) => {
          await deleteEntry(eid)
          router.replace('/times' as any)
        }}
      />
    </Screen>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <View style={{ width: '50%', flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: '#F8FAFC',
          borderWidth: 1,
          borderColor: '#F1F5F9',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
          {label}
        </Text>
        <Text
          className="text-[13px] font-bold text-gray-900 dark:text-white mt-0.5"
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  )
}
