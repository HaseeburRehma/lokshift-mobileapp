/**
 * Abwesenheiten (vacation + sick leave) — full approval workflow.
 * Layout mirrors the webapp's /dashboard/settings/absences page:
 * header with "+" action, two summary tiles, "Status Overview" list and
 * the blue "Planning Leave?" info box.
 *
 * Employee view:
 *   - Submit vacation / sick leave ("+" in the header or the info box).
 *   - See own requests with their current status (pending/approved/rejected).
 *   - Withdraw own requests anytime (pending or already decided).
 *
 * Admin / Dispatcher view:
 *   - See every absence in the org.
 *   - Pending vacations get inline Approve / Reject buttons.
 *   - Reject opens a reason prompt (required); approve is one-tap.
 *   - "Pending" banner at the top advertises the queue size.
 *
 * Status chips (web colours):
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
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Check,
  X as XIcon,
  ShieldCheck,
} from 'lucide-react-native'
import { format, differenceInCalendarDays } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useAbsences, effectiveStatus } from '@/hooks/useAbsences'
import { useSafeBack } from '@/lib/use-safe-back'
import { safeParseISO } from '@/lib/safe-format'
import type { CalendarEvent, AbsenceRequestStatus } from '@/lib/types'

type KindFilter = 'all' | 'holiday' | 'sick_leave'
type StatusFilter = 'all' | AbsenceRequestStatus

// Web: approved = bg-emerald-100 text-emerald-700, pending = bg-amber-100
// text-amber-700; rejected follows the same pattern in red.
const STATUS_PALETTE: Record<AbsenceRequestStatus, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#B45309' },
  approved: { bg: '#D1FAE5', text: '#047857' },
  rejected: { bg: '#FEE2E2', text: '#B91C1C' },
}

// Web icon tile: sick leave = emerald-50/600, holiday = amber-50/600.
const KIND_TILE = {
  sick_leave: { bg: '#ECFDF5', fg: '#059669' },
  holiday: { bg: '#FFFBEB', fg: '#D97706' },
} as const

const SEG_SHADOW = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
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

  // Summary tiles — vacation days in the current year (approved / pending).
  const summary = useMemo(() => {
    const year = new Date().getFullYear()
    let approvedDays = 0
    let pendingDays = 0
    for (const e of events) {
      if (e.event_type !== 'holiday') continue
      const s = safeParseISO(e.start_time)
      const en = safeParseISO(e.end_time)
      if (!s || !en) continue
      if (s.getFullYear() !== year && en.getFullYear() !== year) continue
      const d = Math.max(1, differenceInCalendarDays(en, s) + 1)
      const st = effectiveStatus(e)
      if (st === 'approved') approvedDays += d
      else if (st === 'pending') pendingDays += d
    }
    return { year, approvedDays, pendingDays }
  }, [events])

  const goVacation = () => router.push('/absences/new-vacation' as any)
  const goSick = () => router.push('/absences/new-sick-leave' as any)

  const onNew = () => {
    Alert.alert(L('Neuer Antrag', 'New request'), undefined, [
      { text: L('Urlaub beantragen', 'Request vacation'), onPress: goVacation },
      { text: L('Krank melden', 'Report sick'), onPress: goSick },
      { text: t('times.cancel'), style: 'cancel' },
    ])
  }

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

  const daysUnit = (n: number) => L(n === 1 ? 'Tag' : 'Tage', n === 1 ? 'Day' : 'Days')

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0064E0"
          />
        }
      >
        <PageHeader
          title={L('Abwesenheiten', 'Absences')}
          subtitle={L('Urlaub & Krankmeldungen', 'Vacation & sick leave')}
          showBack
          onBack={goBack}
          rightSlot={
            <Pressable
              onPress={onNew}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={L('Neuer Antrag', 'New request')}
              className="w-10 h-10 rounded-2xl items-center justify-center"
              style={{
                backgroundColor: '#2563EB',
                shadowColor: '#2563EB',
                shadowOpacity: 0.3,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              <Plus size={22} color="#fff" />
            </Pressable>
          }
        />

        {/* Summary tiles */}
        <View className="flex-row mb-6" style={{ gap: 12 }}>
          <Card style={{ flex: 1, borderRadius: 28 }}>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              {L(`Urlaub ${summary.year}`, `Vacation ${summary.year}`)}
            </Text>
            <Text className="text-[24px] font-black text-slate-900">
              {String(summary.approvedDays)}
              <Text className="text-[12px] text-slate-400"> {daysUnit(summary.approvedDays)}</Text>
            </Text>
          </Card>
          <Card style={{ flex: 1, borderRadius: 28 }}>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
              {L('Offen', 'Pending')}
            </Text>
            <Text className="text-[24px] font-black" style={{ color: '#2563EB' }}>
              {String(summary.pendingDays)}
              <Text className="text-[12px] text-slate-400"> {daysUnit(summary.pendingDays)}</Text>
            </Text>
          </Card>
        </View>

        {/* Admin queue banner */}
        {isManagerial ? (
          <Card
            className="mb-6"
            style={{
              padding: 14,
              backgroundColor: pendingCount > 0 ? '#FFFBEB' : '#FFFFFF',
              borderColor: pendingCount > 0 ? '#FDE68A' : '#E2E8F0',
            }}
          >
            <View className="flex-row items-center">
              <View
                className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                style={{ backgroundColor: pendingCount > 0 ? '#F59E0B' : '#94A3B8' }}
              >
                <ShieldCheck size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-[14px] font-bold text-slate-900" numberOfLines={1}>
                  {pendingCount > 0
                    ? L(
                        `${pendingCount} ${pendingCount === 1 ? 'offener Antrag' : 'offene Anträge'}`,
                        `${pendingCount} pending request${pendingCount === 1 ? '' : 's'}`,
                      )
                    : L('Keine offenen Anträge', 'No pending requests')}
                </Text>
                <Text className="text-[12px] text-slate-500 mt-0.5" numberOfLines={1}>
                  {L(
                    'Tippen Sie auf „Genehmigen" oder „Ablehnen".',
                    'Tap "Approve" or "Reject" on a pending row.',
                  )}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Status overview */}
        <Text
          className="text-[11px] font-black uppercase text-slate-400 px-2 mb-3"
          style={{ letterSpacing: 2.2, opacity: 0.6 }}
        >
          {L('Statusübersicht', 'Status Overview')}
        </Text>

        {/* Kind filter */}
        <View className="flex-row p-1 bg-slate-100 rounded-xl mb-2">
          {(['all', 'holiday', 'sick_leave'] as KindFilter[]).map((opt) => {
            const selected = kindFilter === opt
            return (
              <Pressable
                key={opt}
                onPress={() => setKindFilter(opt)}
                className={`flex-1 items-center justify-center py-2.5 rounded-lg ${selected ? 'bg-white' : ''}`}
                style={selected ? SEG_SHADOW : undefined}
              >
                <Text
                  className="text-[11px] font-black uppercase tracking-widest"
                  style={{ color: selected ? '#0064E0' : '#64748B' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
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
        </View>

        {/* Status filter */}
        <View className="flex-row p-1 bg-slate-100 rounded-xl mb-4">
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((opt) => {
            const selected = statusFilter === opt
            const labelDe =
              opt === 'all'
                ? 'Alle'
                : opt === 'pending'
                  ? 'Offen'
                  : opt === 'approved'
                    ? 'Genehmigt'
                    : 'Abgelehnt'
            const labelEn =
              opt === 'all'
                ? 'All'
                : opt === 'pending'
                  ? 'Pending'
                  : opt === 'approved'
                    ? 'Approved'
                    : 'Rejected'
            return (
              <Pressable
                key={opt}
                onPress={() => setStatusFilter(opt)}
                className={`flex-1 items-center justify-center py-2.5 rounded-lg ${selected ? 'bg-white' : ''}`}
                style={selected ? SEG_SHADOW : undefined}
              >
                <Text
                  className="text-[11px] font-black uppercase tracking-wider"
                  style={{ color: selected ? '#0064E0' : '#64748B' }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {L(labelDe, labelEn)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* List */}
        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#0064E0" />
          </View>
        ) : sorted.length === 0 ? (
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="items-center py-8">
              <View className="w-20 h-20 rounded-full bg-slate-50 border border-dashed border-slate-200 items-center justify-center">
                <CalendarIcon size={28} color="#CBD5E1" />
              </View>
              <Text className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-4 text-center">
                {L('Keine Anträge', 'No requests')}
              </Text>
              <Text className="text-[12px] text-slate-400 mt-1 text-center">
                {L(
                  'Tippen Sie oben auf „+", um Urlaub zu beantragen oder sich krank zu melden.',
                  'Tap "+" above to request vacation or report sick.',
                )}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
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

        {/* Info box — web "Planning Leave?" */}
        <View
          className="mt-8 rounded-[40px] p-8 overflow-hidden"
          style={{ backgroundColor: '#2563EB' }}
        >
          <View
            style={{
              position: 'absolute',
              top: -32,
              right: -32,
              width: 128,
              height: 128,
              borderRadius: 999,
              backgroundColor: '#FFFFFF',
              opacity: 0.1,
            }}
          />
          <Text className="text-[20px] font-black text-white mb-2">
            {L('Urlaub geplant?', 'Planning Leave?')}
          </Text>
          <Text className="text-[14px] font-medium mb-6" style={{ color: '#DBEAFE', lineHeight: 22 }}>
            {L(
              'Bitte reichen Sie Ihre Anträge mindestens 14 Tage im Voraus zur Genehmigung durch die Disposition ein.',
              'Please submit your requests at least 14 days in advance for approval by the dispatcher.',
            )}
          </Text>
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            <Pressable
              onPress={goVacation}
              className="bg-white px-6 py-3 rounded-2xl"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.15,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              <Text className="text-[12px] font-black uppercase tracking-widest" style={{ color: '#2563EB' }}>
                {L('Jetzt beantragen', 'Request Now')}
              </Text>
            </Pressable>
            <Pressable
              onPress={goSick}
              className="px-6 py-3 rounded-2xl border"
              style={{ borderColor: 'rgba(255,255,255,0.5)' }}
            >
              <Text className="text-[12px] font-black uppercase tracking-widest text-white">
                {L('Krank melden', 'Report sick')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

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
            className="w-full bg-white rounded-3xl p-6"
            onPress={(ev) => ev.stopPropagation()}
            style={{ maxWidth: 460 }}
          >
            <Text className="text-[18px] font-black text-slate-900 mb-1">
              {L('Antrag ablehnen', 'Reject request')}
            </Text>
            <Text className="text-[13px] text-slate-500 mb-4">
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
              placeholderTextColor="#94A3B8"
              style={{
                minHeight: 100,
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 16,
                padding: 14,
                fontSize: 14,
                fontWeight: '500',
                color: '#334155',
                textAlignVertical: 'top',
              }}
            />
            <View className="flex-row mt-5" style={{ gap: 12 }}>
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
                  style={{ backgroundColor: '#DC2626' }}
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
  const tile = isHoliday ? KIND_TILE.holiday : KIND_TILE.sick_leave
  const kindLabel = isHoliday ? L('Urlaub', 'Holiday') : L('Krankmeldung', 'Sick Leave')
  const status = effectiveStatus(event)
  const statusPalette = STATUS_PALETTE[status] ?? STATUS_PALETTE.approved
  const statusLabel =
    status === 'pending'
      ? L('Offen', 'Pending')
      : status === 'approved'
        ? L('Genehmigt', 'Approved')
        : L('Abgelehnt', 'Rejected')

  // Pending vacation rows get the inline decide buttons.
  const canDecide = isManagerial && status === 'pending' && isHoliday
  const creatorName = event.creator?.full_name ?? null
  const deciderName = event.decided_by_profile?.full_name ?? null

  return (
    <Card style={{ borderColor: '#E2E8F0', borderRadius: 28, padding: 18 }}>
      <View className="flex-row items-center">
        <View
          className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
          style={{ backgroundColor: tile.bg }}
        >
          <CalendarIcon size={22} color={tile.fg} />
        </View>
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text className="text-[15px] font-bold text-slate-900" numberOfLines={1}>
            {event.title || kindLabel}
          </Text>
          <Text className="text-[12px] font-medium text-slate-400 mt-0.5" numberOfLines={1}>
            {`${format(start, 'dd.MM.yyyy', { locale: dateLocale })} — ${format(end, 'dd.MM.yyyy', { locale: dateLocale })}`}
          </Text>
        </View>
        <View className="ml-2 px-3 py-1 rounded-full" style={{ backgroundColor: statusPalette.bg }}>
          <Text
            className="text-[10px] font-black uppercase tracking-widest"
            style={{ color: statusPalette.text }}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap mt-4" style={{ rowGap: 12 }}>
        <View style={{ width: '50%' }}>
          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            {L('Art', 'Type')}
          </Text>
          <Text className="text-[13px] font-bold text-slate-900 mt-0.5">{kindLabel}</Text>
        </View>
        <View style={{ width: '50%' }}>
          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            {L('Dauer', 'Duration')}
          </Text>
          <Text className="text-[13px] font-bold text-slate-900 mt-0.5">
            {`${days} ${L(days === 1 ? 'Tag' : 'Tage', days === 1 ? 'day' : 'days')}`}
          </Text>
        </View>
        {isManagerial && creatorName ? (
          <View style={{ width: '50%' }}>
            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {L('Mitarbeiter', 'Employee')}
            </Text>
            <Text className="text-[13px] font-bold text-slate-900 mt-0.5" numberOfLines={1}>
              {creatorName}
            </Text>
          </View>
        ) : null}
        {status !== 'pending' && deciderName ? (
          <View style={{ width: '50%' }}>
            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {L('Entschieden von', 'Decided by')}
            </Text>
            <Text className="text-[13px] font-bold text-slate-900 mt-0.5" numberOfLines={1}>
              {deciderName}
            </Text>
          </View>
        ) : null}
      </View>

      {event.description ? (
        <Text className="text-[13px] text-slate-500 mt-3" numberOfLines={3}>
          {event.description}
        </Text>
      ) : null}
      {status !== 'pending' && event.decision_reason ? (
        <View className="mt-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
          <Text className="text-[12px] text-slate-600 italic" numberOfLines={3}>
            {`${L('Hinweis:', 'Note:')} ${event.decision_reason}`}
          </Text>
        </View>
      ) : null}

      {/* Footer actions */}
      <View
        className="flex-row items-center mt-4 pt-3 border-t border-slate-100"
        style={{ gap: 8 }}
      >
        {canDecide ? (
          <>
            <Pressable
              onPress={onApprove}
              disabled={acting}
              className="flex-1 flex-row items-center justify-center h-9 rounded-lg border bg-emerald-50 border-emerald-200"
              style={{ opacity: acting ? 0.5 : 1 }}
            >
              <Check size={14} color="#047857" />
              <Text className="text-[12px] font-black uppercase tracking-wider text-emerald-700 ml-1.5">
                {L('Genehmigen', 'Approve')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onReject}
              disabled={acting}
              className="flex-1 flex-row items-center justify-center h-9 rounded-lg border bg-red-50 border-red-200"
              style={{ opacity: acting ? 0.5 : 1 }}
            >
              <XIcon size={14} color="#DC2626" />
              <Text className="text-[12px] font-black uppercase tracking-wider text-red-600 ml-1.5">
                {L('Ablehnen', 'Reject')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onWithdraw}
              hitSlop={8}
              accessibilityLabel={L('Zurücknehmen', 'Withdraw')}
              className="w-9 h-9 rounded-lg items-center justify-center bg-red-50"
            >
              <Trash2 size={16} color="#DC2626" />
            </Pressable>
          </>
        ) : (
          <>
            <View className="flex-1" />
            <Pressable
              onPress={onWithdraw}
              hitSlop={8}
              className="flex-row items-center h-9 px-3 rounded-lg bg-red-50"
            >
              <Trash2 size={14} color="#DC2626" />
              <Text className="text-[12px] font-bold text-red-600 ml-1.5">
                {L('Zurücknehmen', 'Withdraw')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Card>
  )
}

// date-fns Locale type — keep the import local since the row component is co-located.
type Locale = typeof deLocale
