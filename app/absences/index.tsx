/**
 * Anträge (vacation + sick leave) — full approval workflow.
 *
 * Employee view:
 *   - Submit vacation / sick leave via the two big action cards.
 *   - See own requests with their current status (pending/approved/rejected).
 *   - Withdraw own requests anytime (pending or already decided).
 *
 * Admin / Dispatcher view:
 *   - See every absence in the org.
 *   - Pending vacations get inline Approve / Reject buttons.
 *   - Reject opens a reason prompt (required); approve is one-tap.
 *   - "Pending" pill at the top of the screen advertises the queue size.
 *
 * Status badges are colour-coded so the queue scans quickly:
 *   pending  → amber
 *   approved → emerald
 *   rejected → red
 *
 * Backed by the `request_status` columns + DB trigger added in
 * supabase/migrations/20260607120000_absence_approval_workflow.sql.
 */

import React, { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Palmtree,
  ThermometerSnowflake,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Check,
  X as XIcon,
  Clock as ClockIcon,
  ShieldCheck,
} from 'lucide-react-native'
import { format, differenceInCalendarDays } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useAbsences, effectiveStatus } from '@/hooks/useAbsences'
import { EVENT_COLORS } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'
import { safeParseISO } from '@/lib/safe-format'
import type { CalendarEvent, AbsenceRequestStatus } from '@/lib/types'

type KindFilter = 'all' | 'holiday' | 'sick_leave'
type StatusFilter = 'all' | AbsenceRequestStatus

const STATUS_PALETTE: Record<
  AbsenceRequestStatus,
  { bg: string; text: string; border: string }
> = {
  pending: { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  approved: { bg: '#DCFCE7', text: '#065F46', border: '#10B981' },
  rejected: { bg: '#FEE2E2', text: '#7F1D1D', border: '#EF4444' },
}

export default function AbsencesScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS

  const {
    events,
    loading,
    isManagerial,
    pendingCount,
    fetchAbsences,
    withdraw,
    approve,
    reject,
  } = useAbsences()

  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [rejectTarget, setRejectTarget] = useState<CalendarEvent | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchAbsences()
    } finally {
      setRefreshing(false)
    }
  }, [fetchAbsences])

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (kindFilter !== 'all' && e.event_type !== kindFilter) return false
      if (statusFilter !== 'all' && effectiveStatus(e) !== statusFilter) return false
      return true
    })
  }, [events, kindFilter, statusFilter])

  // Pending vacations float to the top of the admin queue so they don't
  // get lost behind already-decided rows.
  const sorted = useMemo(() => {
    if (!isManagerial) return filtered
    return [...filtered].sort((a, b) => {
      const sa = effectiveStatus(a)
      const sb = effectiveStatus(b)
      if (sa !== sb) {
        if (sa === 'pending') return -1
        if (sb === 'pending') return 1
      }
      return (b.created_at || '').localeCompare(a.created_at || '')
    })
  }, [filtered, isManagerial])

  const onWithdraw = (id: string, title: string) => {
    Alert.alert(
      L('Antrag zurücknehmen', 'Withdraw request'),
      L(`„${title}" zurücknehmen?`, `Withdraw "${title}"?`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Zurücknehmen', 'Withdraw'),
          style: 'destructive',
          onPress: async () => {
            try {
              await withdraw(id)
              toast.success(L('Zurückgenommen', 'Withdrawn'))
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            }
          },
        },
      ],
    )
  }

  const onApprove = async (e: CalendarEvent) => {
    setActing(e.id)
    try {
      await approve(e.id)
      toast.success(L('Antrag genehmigt', 'Request approved'))
    } catch (err: any) {
      toast.error(err?.message ?? L('Genehmigung fehlgeschlagen', 'Approve failed'))
    } finally {
      setActing(null)
    }
  }

  const openReject = (e: CalendarEvent) => {
    setRejectTarget(e)
    setRejectReason('')
  }

  const submitReject = async () => {
    if (!rejectTarget) return
    const reason = rejectReason.trim()
    if (!reason) {
      toast.error(
        L('Bitte einen Grund angeben.', 'Please give a reason for rejection.'),
      )
      return
    }
    setActing(rejectTarget.id)
    try {
      await reject(rejectTarget.id, reason)
      toast.success(L('Antrag abgelehnt', 'Request rejected'))
      setRejectTarget(null)
      setRejectReason('')
    } catch (err: any) {
      toast.error(err?.message ?? L('Ablehnung fehlgeschlagen', 'Reject failed'))
    } finally {
      setActing(null)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Anträge', 'Requests')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0064E0"
          />
        }
      >
        {/* Hero / queue stat for admins */}
        {isManagerial ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: pendingCount > 0 ? '#FEF3C7' : '#F1F5F9',
              borderRadius: 16,
              padding: 14,
              marginTop: 4,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: pendingCount > 0 ? '#F59E0B' : '#64748B',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 12,
              }}
            >
              <ShieldCheck size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-[13px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
                {pendingCount > 0
                  ? L(
                      `${pendingCount} ${pendingCount === 1 ? 'offener Antrag' : 'offene Anträge'}`,
                      `${pendingCount} pending request${pendingCount === 1 ? '' : 's'}`,
                    )
                  : L('Keine offenen Anträge', 'No pending requests')}
              </Text>
              <Text className="text-[11px] text-gray-600 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                {L(
                  'Tippen Sie auf „Genehmigen" oder „Ablehnen".',
                  'Tap "Approve" or "Reject" on a pending row.',
                )}
              </Text>
            </View>
          </View>
        ) : (
          <View className="flex-row items-center mb-4 mt-1">
            <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
              <CalendarIcon size={26} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-black text-gray-900 dark:text-white">
                {L('Urlaub & Krankmeldungen', 'Vacation & sick leave')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
                {L('Deine Anträge', 'Your requests')}
              </Text>
            </View>
          </View>
        )}

        {/* Action chips — submit vacation / sick leave */}
        <View className="flex-row gap-2 mb-4">
          <Pressable
            onPress={() => router.push('/absences/new-vacation' as any)}
            className="flex-1 rounded-2xl items-center justify-center py-4"
            style={{ backgroundColor: EVENT_COLORS.holiday }}
          >
            <Palmtree size={20} color="#fff" />
            <Text className="text-[12px] font-black text-white mt-1.5">
              {L('Urlaub beantragen', 'Request vacation')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/absences/new-sick-leave' as any)}
            className="flex-1 rounded-2xl items-center justify-center py-4"
            style={{ backgroundColor: EVENT_COLORS.sick_leave }}
          >
            <ThermometerSnowflake size={20} color="#fff" />
            <Text className="text-[12px] font-black text-white mt-1.5">
              {L('Krank melden', 'Report sick')}
            </Text>
          </Pressable>
        </View>

        {/* Kind filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          className="mb-2"
        >
          {(['all', 'holiday', 'sick_leave'] as KindFilter[]).map((opt) => {
            const selected = kindFilter === opt
            return (
              <Pressable
                key={opt}
                onPress={() => setKindFilter(opt)}
                className={`px-4 py-2 rounded-full border-2 ${
                  selected
                    ? 'bg-brand border-brand'
                    : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                  }`}
                >
                  {opt === 'all'
                    ? L('Alle Arten', 'All types')
                    : opt === 'holiday'
                      ? L('Urlaub', 'Vacation')
                      : L('Krank', 'Sick leave')}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Status filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          className="mb-3"
        >
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(
            (opt) => {
              const selected = statusFilter === opt
              const labelDe =
                opt === 'all'
                  ? 'Alle Status'
                  : opt === 'pending'
                    ? 'Offen'
                    : opt === 'approved'
                      ? 'Genehmigt'
                      : 'Abgelehnt'
              const labelEn =
                opt === 'all'
                  ? 'All status'
                  : opt === 'pending'
                    ? 'Pending'
                    : opt === 'approved'
                      ? 'Approved'
                      : 'Rejected'
              return (
                <Pressable
                  key={opt}
                  onPress={() => setStatusFilter(opt)}
                  className={`px-4 py-2 rounded-full border-2 ${
                    selected
                      ? 'bg-gray-900 border-gray-900'
                      : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <Text
                    className={`text-[12px] font-bold ${
                      selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                    }`}
                  >
                    {L(labelDe, labelEn)}
                  </Text>
                </Pressable>
              )
            },
          )}
        </ScrollView>

        {/* List */}
        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">
              {L('Lädt…', 'Loading…')}
            </Text>
          </Card>
        ) : sorted.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <CalendarIcon size={32} color="#D1D5DB" />
              <Text className="text-[14px] font-bold text-gray-500 dark:text-slate-400 mt-3">
                {L('Keine Anträge', 'No requests')}
              </Text>
              <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1 text-center">
                {L(
                  'Tippen Sie oben auf „Urlaub beantragen" oder „Krank melden", um einen Antrag zu stellen.',
                  'Tap "Request vacation" or "Report sick" above to submit a request.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View>
            {sorted.map((e) => (
              <AbsenceRow
                key={e.id}
                event={e}
                isManagerial={isManagerial}
                acting={acting === e.id}
                dateLocale={dateLocale}
                onApprove={() => onApprove(e)}
                onReject={() => openReject(e)}
                onWithdraw={() => onWithdraw(e.id, e.title)}
                L={L}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB — always vacation; sick is one tap further */}
      <Pressable
        onPress={() => router.push('/absences/new-vacation' as any)}
        className="absolute bottom-8 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center"
        style={{
          shadowColor: '#0064E0',
          shadowOpacity: 0.3,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Plus size={26} color="#fff" />
      </Pressable>

      {/* Reject reason modal */}
      <Modal
        visible={!!rejectTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setRejectTarget(null)}
        >
          <Pressable
            className="w-full bg-white dark:bg-slate-900 rounded-3xl p-5"
            onPress={(ev) => ev.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <Text className="text-[16px] font-black text-gray-900 dark:text-white mb-1">
              {L('Antrag ablehnen', 'Reject request')}
            </Text>
            <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
              {L(
                'Bitte geben Sie eine kurze Begründung an. Der Mitarbeiter erhält sie als Benachrichtigung.',
                'Please give a short reason. The employee will receive it in the notification.',
              )}
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder={L('Grund eingeben…', 'Enter reason…')}
              placeholderTextColor="#9CA3AF"
              style={{
                minHeight: 96,
                borderWidth: 2,
                borderColor: '#E5E7EB',
                borderRadius: 16,
                padding: 12,
                fontSize: 14,
                color: '#111827',
                textAlignVertical: 'top',
              }}
            />
            <View className="flex-row gap-3 mt-4">
              <View className="flex-1">
                <Button
                  label={t('times.cancel')}
                  variant="secondary"
                  onPress={() => setRejectTarget(null)}
                />
              </View>
              <View className="flex-1">
                <Button
                  label={L('Ablehnen', 'Reject')}
                  loading={!!acting && acting === rejectTarget?.id}
                  onPress={submitReject}
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  )
}

// ─── Row component ────────────────────────────────────────────────────────

function AbsenceRow({
  event,
  isManagerial,
  acting,
  dateLocale,
  onApprove,
  onReject,
  onWithdraw,
  L,
}: {
  event: CalendarEvent
  isManagerial: boolean
  acting: boolean
  dateLocale: Locale
  onApprove: () => void
  onReject: () => void
  onWithdraw: () => void
  L: (de: string, en: string) => string
}) {
  const start = safeParseISO(event.start_time) ?? new Date()
  const end = safeParseISO(event.end_time) ?? new Date()
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1)
  const isHoliday = event.event_type === 'holiday'
  const color = isHoliday ? EVENT_COLORS.holiday : EVENT_COLORS.sick_leave
  const Icon = isHoliday ? Palmtree : ThermometerSnowflake
  const status = effectiveStatus(event)
  const statusPalette = STATUS_PALETTE[status]
  const statusLabelDe =
    status === 'pending' ? 'Offen' : status === 'approved' ? 'Genehmigt' : 'Abgelehnt'
  const statusLabelEn =
    status === 'pending' ? 'Pending' : status === 'approved' ? 'Approved' : 'Rejected'

  // Pending vacation rows get the inline decide buttons.
  const canDecide = isManagerial && status === 'pending' && isHoliday

  return (
    <Card className="mb-3" style={{ borderLeftWidth: 4, borderLeftColor: statusPalette.border }}>
      <View className="flex-row items-start">
        <View
          className="w-11 h-11 rounded-2xl items-center justify-center mr-3 shrink-0"
          style={{ backgroundColor: `${color}1F` }}
        >
          <Icon size={20} color={color} />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <View className="flex-row items-center flex-wrap mb-1" style={{ gap: 6 }}>
            <Text
              className="text-[14px] font-black text-gray-900 dark:text-white mr-1"
              numberOfLines={1}
              style={{ maxWidth: '70%' }}
            >
              {event.title}
            </Text>
            <View
              className="px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}1F` }}
            >
              <Text
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color }}
              >
                {isHoliday ? L('Urlaub', 'Vacation') : L('Krank', 'Sick leave')}
              </Text>
            </View>
            <View
              className="px-2 py-0.5 rounded-full flex-row items-center"
              style={{ backgroundColor: statusPalette.bg }}
            >
              {status === 'pending' ? (
                <ClockIcon size={9} color={statusPalette.text} />
              ) : status === 'approved' ? (
                <Check size={9} color={statusPalette.text} />
              ) : (
                <XIcon size={9} color={statusPalette.text} />
              )}
              <Text
                className="text-[9px] font-black uppercase tracking-widest ml-1"
                style={{ color: statusPalette.text }}
              >
                {L(statusLabelDe, statusLabelEn)}
              </Text>
            </View>
          </View>
          <Text
            className="text-[12px] text-gray-500 dark:text-slate-400"
            numberOfLines={1}
          >
            {format(start, 'dd.MM.yyyy', { locale: dateLocale })}
            {' – '}
            {format(end, 'dd.MM.yyyy', { locale: dateLocale })}
            {' · '}
            {days} {L(days === 1 ? 'Tag' : 'Tage', days === 1 ? 'day' : 'days')}
          </Text>
          {isManagerial && event.creator?.full_name ? (
            <Text
              className="text-[11px] text-gray-700 dark:text-slate-300 mt-1 font-semibold"
              numberOfLines={1}
            >
              {event.creator.full_name}
            </Text>
          ) : null}
          {event.description ? (
            <Text
              className="text-[12px] text-gray-500 dark:text-slate-400 mt-1"
              numberOfLines={3}
            >
              {event.description}
            </Text>
          ) : null}
          {status !== 'pending' && event.decision_reason ? (
            <Text
              className="text-[11px] text-gray-700 dark:text-slate-300 mt-2 italic"
              numberOfLines={3}
            >
              {L('Hinweis:', 'Note:')} {event.decision_reason}
            </Text>
          ) : null}
          {status !== 'pending' && event.decided_by_profile?.full_name ? (
            <Text
              className="text-[10px] text-gray-400 dark:text-slate-500 mt-1"
              numberOfLines={1}
            >
              {L(
                `Entschieden von ${event.decided_by_profile.full_name}`,
                `Decided by ${event.decided_by_profile.full_name}`,
              )}
            </Text>
          ) : null}

          {canDecide ? (
            <View className="flex-row gap-2 mt-3">
              <Pressable
                onPress={onApprove}
                disabled={acting}
                style={({ pressed }: { pressed: boolean }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#DCFCE7',
                  borderWidth: 1,
                  borderColor: '#10B981',
                  borderRadius: 12,
                  paddingVertical: 8,
                  opacity: acting ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <Check size={14} color="#059669" />
                <Text
                  className="ml-1.5"
                  style={{ color: '#065F46', fontSize: 12, fontWeight: '800' }}
                >
                  {L('Genehmigen', 'Approve')}
                </Text>
              </Pressable>
              <Pressable
                onPress={onReject}
                disabled={acting}
                style={({ pressed }: { pressed: boolean }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FEE2E2',
                  borderWidth: 1,
                  borderColor: '#EF4444',
                  borderRadius: 12,
                  paddingVertical: 8,
                  opacity: acting ? 0.5 : pressed ? 0.85 : 1,
                })}
              >
                <XIcon size={14} color="#DC2626" />
                <Text
                  className="ml-1.5"
                  style={{ color: '#7F1D1D', fontSize: 12, fontWeight: '800' }}
                >
                  {L('Ablehnen', 'Reject')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Pressable onPress={onWithdraw} className="p-1.5 -mr-1 ml-2 shrink-0">
          <Trash2 size={18} color="#DC2626" />
        </Pressable>
      </View>
    </Card>
  )
}

// date-fns Locale type — keep the import local since the row component is co-located.
type Locale = typeof deLocale
