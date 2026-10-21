/**
 * Time entry detail — mobile replica of the webapp's TimeEntryDetails.
 *
 *   Header   back · ZEITEINTRAG · edit
 *   Hero     net hours from the stored instants (22:00 → 08:00 = 10,00 Std.)
 *            + status / Korrigiert / Stellvertretend erfasst badges
 *   Issues   0 h, no end, … → can only be approved after correction
 *   Pending  open correction request (decide / withdraw)
 *   Actions  employee: "Prüfen & absenden" (draft) or "Korrektur beantragen"
 *            dispatch/admin: Freigeben, Freigabe zurücknehmen, Löschen
 *   Facts    one card per fact (Mitarbeiter … Freigegeben)
 *   Notiz · Korrekturanträge (decided) · Verlauf (change log old → new)
 */

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Clock, Edit2, FileText, History, MapPin, Moon,
  RotateCcw, Send, ShieldCheck, Trash2, User, UserCheck, Wallet, XCircle,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { toast } from '@/components/Toast'
import { TimeEntrySheet } from '@/components/TimeEntrySheet'
import { ShiftClosingSheet } from '@/components/ShiftClosingSheet'
import { CorrectionRequestSheet } from '@/components/CorrectionRequestSheet'
import { C, ENTRY_STATUS_TONE, MicroLabel, Pill } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeEntries } from '@/hooks/useTimeEntries'
import { useTimeTracking } from '@/hooks/useTimeTracking'
import { useCorrections, useEntryHistory } from '@/hooks/useCorrections'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'
import { canApproveTimes } from '@/lib/rbac/permissions'
import type { TimeEntry, TimeEntryAuditRow, TimeEntryCorrection } from '@/lib/types'
import { TIME_ENTRY_SELECT, dbErrorMessage, entryStatus, entryStatusLabel } from '@/lib/times/entry-status'
import { entryNetHours, hoursBetween, shiftIssueLabel, shiftIssues } from '@/lib/time/shift-hours'
import { formatDateDE, formatEuro, formatHours, formatHoursLong, formatShiftRange, formatTimeOfDay, weekdayName } from '@/lib/time/format'
import { localDateKey } from '@/lib/time/shift-hours'
import { sendNotification } from '@/lib/notifications/service'

function dateTime(iso: string | null | undefined, locale: 'de' | 'en') {
  if (!iso) return '—'
  const key = localDateKey(new Date(iso))
  return `${weekdayName(key, locale, true)}, ${formatDateDE(key)} · ${formatTimeOfDay(iso)}`
}

export default function TimeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/times')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session, role } = useUser()
  const myId = session?.user?.id
  const isManager = canApproveTimes(role)
  const { updateEntry, deleteEntry, createEntry, fetchEntries } = useTimeEntries()
  const { submitEntry } = useTimeTracking()
  const { corrections, requestCorrection, cancelCorrection, reviewCorrection } = useCorrections({ entryId: id })
  const { rows: history, refetch: refetchHistory } = useEntryHistory(id)

  const [entry, setEntry] = useState<TimeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [correctionOpen, setCorrectionOpen] = useState(false)

  const fetchEntry = useCallback(async () => {
    if (!id) return
    const { data, error } = await getSupabase().from('time_entries').select(TIME_ENTRY_SELECT).eq('id', id).single()
    if (error || !data) setNotFound(true)
    else setEntry(data as TimeEntry)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchEntry()
  }, [fetchEntry])

  const refreshAll = async () => {
    await fetchEntry()
    await refetchHistory()
    await fetchEntries()
  }

  const setApproved = async (approved: boolean) => {
    if (!entry || !myId) return
    setBusy(true)
    const { error } = await getSupabase()
      .from('time_entries')
      .update({ is_verified: approved, verified_by: approved ? myId : null } as any)
      .eq('id', entry.id)
    setBusy(false)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Freigabe konnte nicht gespeichert werden', 'Could not save approval')))
      return
    }
    toast.success(approved ? L('Zeiteintrag freigegeben', 'Time entry approved') : L('Freigabe zurückgenommen', 'Approval revoked'))
    if (approved && entry.employee_id !== myId) {
      void sendNotification({
        userId: entry.employee_id,
        title: 'Zeiteintrag freigegeben',
        message: `Ihr Zeiteintrag vom ${formatDateDE(entry.date)} (${formatShiftRange(entry.start_time, entry.end_time)}) wurde freigegeben.`,
        module: 'time_entries',
        moduleId: entry.id,
        link: `/dashboard/times?entry=${entry.id}`,
        skipEmail: true,
      })
    }
    await refreshAll()
  }

  const onDelete = () => {
    if (!entry) return
    const employeeLabel = entry.employee?.full_name ?? L('Mitarbeiter', 'Employee')
    Alert.alert(
      L('Diesen Zeiteintrag wirklich löschen?', 'Really delete this time entry?'),
      L(
        `${formatDateDE(entry.date)} · ${employeeLabel} · ${formatHours(entry.net_hours, 'de')} Std.\n\nDer Vorgang wird im Änderungsprotokoll festgehalten.`,
        `${entry.date} · ${employeeLabel} · ${formatHours(entry.net_hours, 'en')} h`,
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Löschen', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id)
              toast.success(L('Zeiteintrag gelöscht', 'Time entry deleted'))
              router.replace('/times' as any)
            } catch (err: any) {
              toast.error(dbErrorMessage(err, locale, L('Löschen fehlgeschlagen', 'Delete failed')))
            }
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <Screen background="#FFFFFF" className="items-center justify-center" noTapToDismiss>
        <ActivityIndicator color={C.blue600} />
      </Screen>
    )
  }
  if (notFound || !entry) {
    return (
      <Screen background="#FFFFFF" className="px-6 items-center justify-center" noTapToDismiss>
        <Text style={{ color: C.slate400, textAlign: 'center', fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>
          {L('Eintrag nicht gefunden', 'Entry not found')}
        </Text>
        <Pressable onPress={goBack} style={{ marginTop: 16 }}>
          <Text style={{ color: C.blue600, fontWeight: '800' }}>{L('Zurück', 'Back')}</Text>
        </Pressable>
      </Screen>
    )
  }

  const status = entryStatus(entry)
  const net = entryNetHours(entry)
  const issues = shiftIssues(entry)
  const isOwner = myId === entry.employee_id
  const onBehalf = !!entry.entered_by && entry.entered_by !== entry.employee_id
  const plan = entry.plan?.start_time && entry.plan?.end_time ? entry.plan : null
  const clockStart = entry.clock_start_time
  const clockEnd = entry.clock_end_time
  const clockDiffers = !!clockStart && (clockStart !== entry.start_time || (!!clockEnd && clockEnd !== entry.end_time))
  const pending = corrections.find((c) => c.status === 'pending') ?? null
  const decided = corrections.filter((c) => c.status !== 'pending')
  // Same gates as the webapp page: managers always, employees for their
  // own drafts and own planned entries.
  const canEdit = isManager || (isOwner && (status === 'draft' || !!entry.is_planned))
  const canSubmit = isOwner && status === 'draft'
  const canRequest = isOwner && !isManager && (status === 'submitted' || status === 'approved') && !pending
  const canApprove = isManager && !!entry.end_time && !entry.is_verified && !entry.is_planned
  const canUnapprove = isManager && entry.is_verified
  const hasActions = canSubmit || canRequest || canApprove || canUnapprove || isManager
  const hr = L('Std.', 'h')

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      {/* Header (sticky) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100, backgroundColor: '#FFFFFF' }}>
        <Pressable onPress={goBack} accessibilityLabel={L('Zurück', 'Back')} hitSlop={8} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={24} color={C.blue600} />
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: -0.3, textTransform: 'uppercase', fontStyle: 'italic', color: '#111827' }}>
          {L('Zeiteintrag', 'Time entry')}
        </Text>
        {canEdit ? (
          <Pressable onPress={() => setSheetOpen(true)} accessibilityLabel={L('Bearbeiten', 'Edit')} hitSlop={8} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: C.blue50 }}>
            <Edit2 size={16} color={C.blue600} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 64 }}>
        {/* Hero */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: C.slate50 }}>
          <Text style={{ fontSize: 12, fontWeight: '900', letterSpacing: 3.6, textTransform: 'uppercase', color: C.slate400 }}>{L('Arbeitszeit', 'Working time')}</Text>
          <Text style={{ marginTop: 10, color: C.blue600, fontSize: 60, fontWeight: '900', letterSpacing: -2, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
            {formatHours(net, locale)}
            <Text style={{ fontSize: 20, opacity: 0.5 }}>{` ${hr}`}</Text>
          </Text>
          <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '600', color: C.slate500, textAlign: 'center' }}>
            = {formatHoursLong(net, locale)}
            {(entry.break_minutes ?? 0) > 0 ? ` · ${L('nach', 'after')} ${entry.break_minutes} Min. ${L('Pause', 'break')}` : ` · ${L('ohne Pause', 'no break')}`}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 14, fontWeight: '700', color: C.slate700, textAlign: 'center' }}>
            {weekdayName(entry.date, locale)}, {formatDateDE(entry.date)} · {formatShiftRange(entry.start_time, entry.end_time, locale)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Pill size="lg" label={entryStatusLabel(status, locale)} tone={ENTRY_STATUS_TONE[status]} />
            {entry.corrected_at ? <Pill size="lg" label={L('Korrigiert', 'Corrected')} tone={{ bg: C.indigo50, fg: C.indigo700, border: C.indigo200 }} /> : null}
            {onBehalf ? <Pill size="lg" label={L('Stellvertretend erfasst', 'Entered on behalf')} tone={{ bg: C.slate50, fg: C.slate600, border: C.slate200 }} /> : null}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 24, gap: 24 }}>
          {issues.length > 0 ? (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.red200, backgroundColor: C.red50, padding: 16, gap: 4 }}>
              {issues.map((i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <AlertTriangle size={16} color={C.red700} />
                  <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: C.red700, flex: 1 }}>{shiftIssueLabel(i, locale)}</Text>
                </View>
              ))}
              <Text style={{ fontSize: 12, color: 'rgba(220,38,38,0.8)' }}>
                {L('Dieser Eintrag kann erst nach Korrektur freigegeben werden.', 'This entry can only be approved after it is corrected.')}
              </Text>
            </View>
          ) : null}

          {pending ? (
            <PendingCorrection
              correction={pending}
              isManager={isManager}
              onDecide={async (approve, note) => {
                await reviewCorrection(pending, approve, note)
                await refreshAll()
              }}
              onCancel={async () => {
                await cancelCorrection(pending.id)
              }}
            />
          ) : null}

          {/* Actions */}
          {hasActions ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {canSubmit ? (
                <ActionButton icon={<Send size={16} color="#FFFFFF" />} label={L('Prüfen & absenden', 'Review & submit')} color={C.brand} onPress={() => setReviewOpen(true)} />
              ) : null}
              {canRequest ? (
                <ActionButton icon={<Edit2 size={16} color={C.slate900} />} label={L('Korrektur beantragen', 'Request correction')} variant="outline" onPress={() => setCorrectionOpen(true)} />
              ) : null}
              {canApprove ? (
                <ActionButton
                  icon={<ShieldCheck size={16} color="#FFFFFF" />}
                  label={busy ? L('Wird gespeichert…', 'Saving…') : L('Freigeben', 'Approve')}
                  color={C.emerald600}
                  disabled={busy || issues.length > 0}
                  onPress={() => setApproved(true)}
                />
              ) : null}
              {canUnapprove ? (
                <ActionButton icon={<RotateCcw size={16} color={C.slate900} />} label={L('Freigabe zurücknehmen', 'Revoke approval')} variant="outline" disabled={busy} onPress={() => setApproved(false)} />
              ) : null}
              {isManager ? (
                <ActionButton icon={<Trash2 size={16} color={C.red600} />} label={L('Löschen', 'Delete')} variant="ghost" onPress={onDelete} />
              ) : null}
            </View>
          ) : null}

          {/* Facts */}
          <View style={{ gap: 12 }}>
            <DetailItem icon={<User size={20} color={C.blue600} />} label={L('Mitarbeiter', 'Employee')} value={entry.employee?.full_name ?? '—'} />
            <DetailItem icon={<Clock size={20} color={C.blue600} />} label={L('Beginn', 'Start')} value={dateTime(entry.start_time, locale)} />
            <DetailItem icon={<Clock size={20} color={C.blue600} />} label={L('Ende', 'End')} value={entry.end_time ? dateTime(entry.end_time, locale) : L('Läuft noch', 'Running')} />
            <DetailItem icon={<Clock size={20} color={C.blue600} />} label={L('Pause', 'Break')} value={`${entry.break_minutes ?? 0} Min.`} />
            {plan ? (
              <DetailItem
                icon={<Calendar size={20} color={C.blue600} />}
                label={L('Geplant', 'Planned')}
                value={`${formatShiftRange(plan.start_time, plan.end_time, locale)} · ${formatHours(hoursBetween(plan.start_time, plan.end_time, 0), locale)} ${hr}${plan.shift_name ? ` · ${plan.shift_name}` : ''}`}
              />
            ) : null}
            {clockStart ? (
              <DetailItem
                icon={<History size={20} color={C.blue600} />}
                label={L('Ursprünglich erfasst', 'Originally recorded')}
                value={formatShiftRange(clockStart, clockEnd, locale)}
                valueColor={clockDiffers ? C.amber700 : undefined}
              />
            ) : null}
            <DetailItem icon={<User size={20} color={C.blue600} />} label={L('Kunde', 'Customer')} value={entry.customer?.name || entry.plan?.customer?.name || '—'} />
            {entry.start_location?.name || entry.destination_location?.name ? (
              <DetailItem
                icon={<MapPin size={20} color={C.blue600} />}
                label={L('Betriebsstellen', 'Locations')}
                value={`${entry.start_location?.short_code || entry.start_location?.name || '—'} → ${entry.destination_location?.short_code || entry.destination_location?.name || '—'}`}
              />
            ) : null}
            {entry.location ? <DetailItem icon={<MapPin size={20} color={C.blue600} />} label={L('Einsatzort', 'Location')} value={entry.location} /> : null}
            <DetailItem icon={<Wallet size={20} color={C.blue600} />} label={L('Spesen', 'Per diem')} value={formatEuro(entry.meal_allowance, locale)} />
            {entry.overnight_stay ? (
              <DetailItem icon={<Moon size={20} color={C.emerald600} />} label={L('Übernachtung', 'Overnight stay')} value={entry.hotel_address || L('Ja', 'Yes')} />
            ) : null}
            {entry.is_gastfahrt ? (
              <DetailItem icon={<UserCheck size={20} color={C.violet600} />} label={L('Fahrtart', 'Trip type')} value={L('Gastfahrt (separat ausgewiesen)', 'Gastfahrt (shown separately)')} />
            ) : null}
            <DetailItem
              icon={<UserCheck size={20} color={C.blue600} />}
              label={L('Erfasst von', 'Entered by')}
              value={`${entry.enterer?.full_name ?? entry.employee?.full_name ?? '—'}${onBehalf ? ` (${L('stellvertretend', 'on behalf')})` : ''}`}
            />
            {entry.submitted_at ? (
              <DetailItem icon={<Send size={20} color={C.blue600} />} label={L('Abgesendet am', 'Submitted')} value={dateTime(entry.submitted_at, locale)} />
            ) : null}
            {entry.is_verified ? (
              <DetailItem
                icon={<CheckCircle2 size={20} color={C.emerald600} />}
                label={L('Freigegeben', 'Approved')}
                value={`${entry.verifier?.full_name ?? '—'}${entry.verified_at ? ` · ${dateTime(entry.verified_at, locale)}` : ''}`}
              />
            ) : null}
          </View>

          {entry.notes ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FileText size={16} color={C.slate400} />
                <MicroLabel style={{ marginLeft: 6 }}>{L('Notiz', 'Note')}</MicroLabel>
              </View>
              <View style={{ padding: 20, borderRadius: 16, borderWidth: 1, borderColor: C.slate100, backgroundColor: 'rgba(248,250,252,0.5)' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>{entry.notes}</Text>
              </View>
            </View>
          ) : null}

          {decided.length > 0 ? (
            <View style={{ gap: 8 }}>
              <MicroLabel>{L('Korrekturanträge', 'Correction requests')}</MicroLabel>
              {decided.map((c) => (
                <View key={c.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: C.slate100, padding: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate800 }}>
                    {c.status === 'approved' ? L('Genehmigt', 'Approved') : c.status === 'rejected' ? L('Abgelehnt', 'Rejected') : L('Zurückgezogen', 'Withdrawn')}
                    {' · '}
                    {formatShiftRange(c.proposed.start_time, c.proposed.end_time, locale)}
                  </Text>
                  <Text style={{ fontSize: 14, color: C.slate500 }}>{`${L('Begründung', 'Reason')}: ${c.reason}`}</Text>
                  {c.review_note ? <Text style={{ fontSize: 14, color: C.slate500 }}>{`${L('Hinweis', 'Note')}: ${c.review_note}`}</Text> : null}
                  <Text style={{ fontSize: 12, color: C.slate400, marginTop: 4 }}>
                    {c.reviewer?.full_name ? `${c.reviewer.full_name} · ` : ''}
                    {c.reviewed_at ? dateTime(c.reviewed_at, locale) : dateTime(c.requested_at, locale)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* History */}
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <History size={16} color={C.slate400} />
              <MicroLabel style={{ marginLeft: 6 }}>{L('Verlauf', 'History')}</MicroLabel>
            </View>
            {history.length === 0 ? (
              <Text style={{ fontSize: 14, color: C.slate400 }}>{L('Noch keine protokollierten Änderungen.', 'No logged changes yet.')}</Text>
            ) : (
              <View style={{ marginLeft: 8, borderLeftWidth: 1, borderLeftColor: C.slate200, gap: 16 }}>
                {history.map((h) => (
                  <HistoryItem key={h.id} row={h} locale={locale} />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <TimeEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={entry}
        onCreate={createEntry}
        onUpdate={async (eid, patch) => {
          const updated = await updateEntry(eid, patch)
          await refreshAll()
          return updated
        }}
        onDelete={async (eid) => {
          await deleteEntry(eid)
          router.replace('/times' as any)
        }}
      />
      <ShiftClosingSheet
        entry={entry}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        onSubmit={async (eid, values) => {
          const ok = await submitEntry(eid, values)
          if (ok) await refreshAll()
          return ok
        }}
      />
      <CorrectionRequestSheet
        entry={entry}
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        onSubmit={async (e, proposed, reason) => {
          const ok = await requestCorrection(e, proposed, reason)
          if (ok) await refreshAll()
          return ok
        }}
      />
    </Screen>
  )
}

function ActionButton({
  icon,
  label,
  color,
  variant = 'solid',
  disabled,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  color?: string
  variant?: 'solid' | 'outline' | 'ghost'
  disabled?: boolean
  onPress: () => void
}) {
  const solid = variant === 'solid'
  const outline = variant === 'outline'
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}>
      <View
        style={{
          height: 44,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: solid ? color : '#FFFFFF',
          borderWidth: outline ? 1 : 0,
          borderColor: C.slate200,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon}
        <Text
          style={{
            marginLeft: 8,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: solid ? '#FFFFFF' : variant === 'ghost' ? C.red600 : C.slate900,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/** `p-4 rounded-3xl bg-white border border-gray-100 shadow-sm` — icon + label left, value right. */
function DetailItem({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 24,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: C.gray100,
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 16, backgroundColor: C.blue50, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <Text style={{ marginLeft: 12, width: 104, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: C.gray400 }} numberOfLines={2}>
        {label}
      </Text>
      <Text style={{ flex: 1, marginLeft: 8, textAlign: 'right', fontSize: 14, fontWeight: '900', color: valueColor ?? '#111827' }}>{value}</Text>
    </View>
  )
}

function PendingCorrection({
  correction, isManager, onDecide, onCancel,
}: {
  correction: TimeEntryCorrection
  isManager: boolean
  onDecide: (approve: boolean, note: string) => Promise<void>
  onCancel: () => Promise<void>
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'cancel'>(null)
  const o = correction.original
  const p = correction.proposed
  const run = async (kind: 'approve' | 'reject' | 'cancel', fn: () => Promise<void>) => {
    setBusy(kind)
    await fn()
    setBusy(null)
  }
  const hr = L('Std.', 'h')
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: C.amber200, backgroundColor: C.amber50, padding: 20, gap: 12 }}>
      <MicroLabel color={C.amber700}>{L('Offener Korrekturantrag', 'Open correction request')}</MicroLabel>
      <View style={{ gap: 12 }}>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.slate500 }}>{L('Bisher (gültig)', 'Current (valid)')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate800 }}>
            {formatShiftRange(o.start_time, o.end_time, locale)} · {o.break_minutes ?? 0} Min. · {formatHours(hoursBetween(o.start_time, o.end_time, o.break_minutes), locale)} {hr}
          </Text>
        </View>
        <View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.slate500 }}>{L('Beantragt', 'Requested')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.amber800 }}>
            {formatShiftRange(p.start_time, p.end_time, locale)} · {p.break_minutes ?? 0} Min. · {formatHours(hoursBetween(p.start_time, p.end_time, p.break_minutes), locale)} {hr}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, color: C.slate700 }}>
        <Text style={{ fontWeight: '700' }}>{`${L('Begründung', 'Reason')}: `}</Text>
        {correction.reason}
      </Text>
      {isManager ? (
        <View style={{ gap: 8 }}>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={L('Hinweis an Mitarbeiter (optional)', 'Note to employee (optional)')}
            placeholderTextColor={C.slate400}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 64, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, fontSize: 14, color: C.slate900 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable disabled={!!busy} onPress={() => run('approve', () => onDecide(true, note))} style={{ flex: 1 }}>
              <View style={{ height: 44, borderRadius: 12, backgroundColor: C.emerald600, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: busy ? 0.6 : 1 }}>
                {busy === 'approve' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CheckCircle2 size={16} color="#FFFFFF" />}
                <Text style={{ marginLeft: 6, color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' }}>{L('Genehmigen', 'Approve')}</Text>
              </View>
            </Pressable>
            <Pressable disabled={!!busy} onPress={() => run('reject', () => onDecide(false, note))} style={{ flex: 1 }}>
              <View style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: busy ? 0.6 : 1 }}>
                {busy === 'reject' ? <ActivityIndicator size="small" color={C.red600} /> : <XCircle size={16} color={C.red600} />}
                <Text style={{ marginLeft: 6, color: C.red600, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' }}>{L('Ablehnen', 'Reject')}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable disabled={!!busy} onPress={() => run('cancel', onCancel)} style={{ alignSelf: 'flex-start' }}>
          <View style={{ height: 40, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.slate900 }}>{L('Antrag zurückziehen', 'Withdraw request')}</Text>
          </View>
        </Pressable>
      )}
    </View>
  )
}

const FIELD_LABELS: Record<string, [string, string]> = {
  date: ['Datum', 'Date'],
  start_time: ['Beginn', 'Start'],
  end_time: ['Ende', 'End'],
  break_minutes: ['Pause', 'Break'],
  net_hours: ['Stunden', 'Hours'],
  employee_id: ['Mitarbeiter', 'Employee'],
  customer_id: ['Kunde', 'Customer'],
  notes: ['Notiz', 'Note'],
  location: ['Einsatzort', 'Location'],
  overnight_stay: ['Übernachtung', 'Overnight'],
  hotel_address: ['Hotel', 'Hotel'],
  meal_allowance: ['Spesen', 'Per diem'],
  is_gastfahrt: ['Gastfahrt', 'Gastfahrt'],
  is_planned: ['Geplant', 'Planned'],
  plan_id: ['Plan', 'Plan'],
  start_location_id: ['Start-Betriebsstelle', 'Start location'],
  destination_location_id: ['Ziel-Betriebsstelle', 'Destination'],
  submitted_at: ['Abgesendet', 'Submitted'],
  is_verified: ['Freigegeben', 'Approved'],
}

const ACTION_LABELS: Record<TimeEntryAuditRow['action'], [string, string]> = {
  created: ['Eintrag angelegt', 'Entry created'],
  clocked_in: ['Schicht gestartet', 'Shift started'],
  clocked_out: ['Schicht beendet', 'Shift ended'],
  submitted: ['Abgesendet', 'Submitted'],
  approved: ['Freigegeben', 'Approved'],
  unapproved: ['Freigabe zurückgenommen', 'Approval revoked'],
  updated: ['Geändert', 'Changed'],
  correction_applied: ['Korrektur übernommen', 'Correction applied'],
  deleted: ['Gelöscht', 'Deleted'],
}

function fmtValue(key: string, v: unknown, locale: 'de' | 'en'): string {
  if (v == null || v === '') return '—'
  if (key === 'start_time' || key === 'end_time' || key === 'submitted_at') return dateTime(String(v), locale)
  if (key === 'date') return formatDateDE(String(v))
  if (key === 'break_minutes') return `${v} Min.`
  if (key === 'net_hours') return `${formatHours(Number(v), locale)} ${locale === 'de' ? 'Std.' : 'h'}`
  if (key === 'meal_allowance') return formatEuro(Number(v), locale)
  if (typeof v === 'boolean') return v ? (locale === 'de' ? 'Ja' : 'Yes') : locale === 'de' ? 'Nein' : 'No'
  if (key.endsWith('_id')) return locale === 'de' ? 'geändert' : 'changed'
  if (typeof v === 'object') return '—'
  return String(v)
}

function HistoryItem({ row, locale }: { row: TimeEntryAuditRow; locale: 'de' | 'en' }) {
  const label = ACTION_LABELS[row.action]?.[locale === 'de' ? 0 : 1] ?? (locale === 'de' ? 'Änderung' : 'Change')
  const keys =
    row.action === 'created' || row.action === 'clocked_in' || row.action === 'deleted'
      ? []
      : Object.keys(row.new_values ?? {}).filter((k) => k !== 'is_verified' && k !== 'submitted_at')
  return (
    <View style={{ paddingLeft: 16 }}>
      <View style={{ position: 'absolute', left: -7, top: 4, width: 13, height: 13, borderRadius: 7, backgroundColor: C.blue600, borderWidth: 2, borderColor: '#FFFFFF' }} />
      <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate800 }}>
        {label}
        <Text style={{ fontWeight: '500', color: C.slate400 }}>{` · ${row.changer?.full_name ?? 'System'} · ${dateTime(row.changed_at, locale)}`}</Text>
      </Text>
      {keys.length > 0 ? (
        <View style={{ marginTop: 4, gap: 2 }}>
          {keys.map((k) => (
            <Text key={k} style={{ fontSize: 12, color: C.slate600 }}>
              <Text style={{ fontWeight: '700' }}>{`${(FIELD_LABELS[k] ?? [k, k])[locale === 'de' ? 0 : 1]}: `}</Text>
              {`${fmtValue(k, row.old_values?.[k], locale)} → ${fmtValue(k, row.new_values?.[k], locale)}`}
            </Text>
          ))}
        </View>
      ) : null}
      {row.reason ? <Text style={{ marginTop: 4, fontSize: 12, fontStyle: 'italic', color: C.slate500 }}>{row.reason}</Text> : null}
    </View>
  )
}
