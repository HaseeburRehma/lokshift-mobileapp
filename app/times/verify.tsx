/**
 * Freigaben — dispatch/admin queue (Kundenfeedback Punkte 3 + 14),
 * mobile replica of the webapp's /dashboard/times/approvals:
 *
 *   1. Korrekturanträge   → genehmigen & übernehmen / ablehnen (with note)
 *   2. Zur Freigabe       → submitted entries, bulk + single approval;
 *                           entries with issues (0 h, no end, …) can't be
 *                           selected until corrected
 *   3. Nicht abgesendet / nicht beendet → ended but unsubmitted shifts and
 *                           shifts running > 12 h, with "Erinnern" (sends
 *                           the employee a reminder notification)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { AlertTriangle, BellRing, Check, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { C, EmptyState, OutlineButton, SectionTitle, SolidButton } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canApproveTimes } from '@/lib/rbac/permissions'
import { useUnverifiedEntries } from '@/hooks/useUnverifiedEntries'
import { useCorrections } from '@/hooks/useCorrections'
import { useSafeBack } from '@/lib/use-safe-back'
import { getSupabase } from '@/lib/supabase/client'
import type { TimeEntry, TimeEntryCorrection } from '@/lib/types'
import { entryNetHours, hoursBetween, shiftIssueLabel, shiftIssues } from '@/lib/time/shift-hours'
import { formatDateDE, formatHours, formatShiftRange, formatTimeOfDay, weekdayName } from '@/lib/time/format'
import { TIME_ENTRY_SELECT, dbErrorMessage, entryStatus } from '@/lib/times/entry-status'
import { sendNotification } from '@/lib/notifications/service'

export default function ApprovalsScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/times')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, session, profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const isManager = canApproveTimes(role)
  const { entries, loading, fetchEntries, verifyMany } = useUnverifiedEntries()
  const { corrections, reviewCorrection, refetch } = useCorrections({ pendingOnly: true })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  // Section 3 — ended but unsubmitted / still running shifts. The queue
  // hook only loads submitted entries, so these are read here (same
  // filter as the webapp page). Re-read whenever the hook's realtime
  // channel refreshes the queue.
  const [openEntries, setOpenEntries] = useState<TimeEntry[]>([])
  const [reminding, setReminding] = useState<string | null>(null)
  const fetchOpen = useCallback(async () => {
    if (!orgId || !isManager) return
    const { data, error } = await getSupabase()
      .from('time_entries')
      .select(TIME_ENTRY_SELECT)
      .eq('organization_id', orgId)
      .eq('is_verified', false)
      .eq('is_planned', false)
      .is('submitted_at', null)
      .order('date', { ascending: true })
      .limit(500)
    if (error) {
      console.warn('[approvals] open entries fetch failed', error.message)
      return
    }
    setOpenEntries((data ?? []) as TimeEntry[])
  }, [orgId, isManager])

  useEffect(() => {
    fetchOpen()
  }, [fetchOpen, entries])

  const unsent = useMemo(
    () =>
      openEntries.filter(
        (e) => entryStatus(e) === 'draft' || (entryStatus(e) === 'running' && hoursBetween(e.start_time, new Date().toISOString(), 0) > 12),
      ),
    [openEntries],
  )

  if (!isManager) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text style={{ color: C.slate400, textAlign: 'center' }}>{L('Nur Admins oder Disposition dürfen Zeiten freigeben.', 'Only admins or dispatch can approve times.')}</Text>
      </Screen>
    )
  }

  const approvable = entries.filter((e) => shiftIssues(e).length === 0)
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const approve = async (ids: string[]) => {
    if (ids.length === 0) return
    setBusy(true)
    try {
      const n = await verifyMany(ids)
      toast.success(L(`${n} Eintrag/Einträge freigegeben`, `${n} entr${n === 1 ? 'y' : 'ies'} approved`))
      const byEmployee = new Map<string, number>()
      for (const e of entries.filter((x) => ids.includes(x.id))) byEmployee.set(e.employee_id, (byEmployee.get(e.employee_id) ?? 0) + 1)
      for (const [emp, count] of byEmployee) {
        if (emp === session?.user?.id) continue
        void sendNotification({
          userId: emp,
          title: 'Zeiten freigegeben',
          message: count === 1 ? 'Ein Zeiteintrag wurde freigegeben.' : `${count} Zeiteinträge wurden freigegeben.`,
          module: 'time_entries',
          link: '/dashboard/times',
          skipEmail: true,
        })
      }
      setSelected((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } catch (err: any) {
      toast.error(dbErrorMessage(err, locale, L('Freigabe fehlgeschlagen', 'Approval failed')))
    } finally {
      setBusy(false)
    }
  }

  const remind = async (e: TimeEntry) => {
    const running = !e.end_time
    setReminding(e.id)
    try {
      await sendNotification({
        userId: e.employee_id,
        title: running ? 'Schicht noch nicht beendet' : 'Schicht noch nicht abgesendet',
        message: running
          ? `Ihre Schicht vom ${formatDateDE(e.date)} läuft seit ${formatTimeOfDay(e.start_time)} Uhr. Bitte beenden, Zeiten prüfen und absenden.`
          : `Bitte prüfen und senden Sie Ihre Schicht vom ${formatDateDE(e.date)} (${formatShiftRange(e.start_time, e.end_time)}) ab.`,
        module: 'time_entries',
        moduleId: e.id,
        link: `/dashboard/times?entry=${e.id}`,
      })
      toast.success(L('Erinnerung gesendet', 'Reminder sent'))
    } catch (err: any) {
      toast.error(err?.message ?? L('Erinnerung konnte nicht gesendet werden', 'Could not send reminder'))
    } finally {
      setReminding(null)
    }
  }

  const openEntry = (id: string) => router.push(`/times/${id}` as any)
  const selectedIds = Array.from(selected).filter((id) => entries.some((e) => e.id === id))

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 64 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => {
              fetchEntries()
              refetch()
              fetchOpen()
            }}
            tintColor={C.brand}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <PageHeader
          showBack
          onBack={goBack}
          title={L('Freigaben', 'Approvals')}
          subtitle={L('Korrekturanträge und abgesendete Zeiten prüfen', 'Review correction requests and submitted times')}
        />

        {/* 1. Corrections */}
        <View style={{ gap: 12 }}>
          <SectionTitle title={L('Korrekturanträge', 'Correction requests')} count={corrections.length} />
          {corrections.length === 0 ? (
            <EmptyState text={L('Keine offenen Korrekturanträge.', 'No open correction requests.')} />
          ) : (
            corrections.map((c) => <CorrectionCard key={c.id} c={c} onDecide={reviewCorrection} onOpen={() => openEntry(c.entry_id)} />)
          )}
        </View>

        {/* 2. Submitted */}
        <View style={{ gap: 12, marginTop: 32 }}>
          <SectionTitle title={L('Zur Freigabe', 'Awaiting approval')} count={entries.length} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <OutlineButton
              label={L('Alle fehlerfreien auswählen', 'Select all without issues')}
              onPress={() => setSelected(new Set(approvable.map((e) => e.id)))}
              disabled={approvable.length === 0}
              height={36}
            />
            <SolidButton
              label={L(`${selectedIds.length} freigeben`, `Approve ${selectedIds.length}`)}
              icon={<ShieldCheck size={16} color="#FFFFFF" />}
              onPress={() => approve(selectedIds)}
              disabled={selectedIds.length === 0}
              loading={busy}
              color={C.emerald600}
              height={36}
            />
          </View>

          {entries.length === 0 && !loading ? (
            <EmptyState text={L('Keine abgesendeten Zeiten offen.', 'No submitted times waiting.')} />
          ) : entries.length > 0 ? (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.slate200, overflow: 'hidden' }}>
              {entries.map((e, idx) => {
                const issues = shiftIssues(e)
                const isSel = selected.has(e.id)
                const onBehalf = !!e.entered_by && e.entered_by !== e.employee_id
                return (
                  <View
                    key={e.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: C.slate100,
                      backgroundColor: issues.length ? 'rgba(254,242,242,0.4)' : '#FFFFFF',
                    }}
                  >
                    <Pressable
                      onPress={() => toggle(e.id)}
                      disabled={issues.length > 0}
                      hitSlop={10}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSel, disabled: issues.length > 0 }}
                      accessibilityLabel={L('Auswählen', 'Select')}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 5,
                          borderWidth: 1,
                          borderColor: isSel ? C.brand : C.slate300,
                          backgroundColor: isSel ? C.brand : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: issues.length ? 0.4 : 1,
                        }}
                      >
                        {isSel ? <Check size={14} color="#FFFFFF" /> : null}
                      </View>
                    </Pressable>
                    <Pressable onPress={() => openEntry(e.id)} style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate900 }} numberOfLines={1}>
                        {e.employee?.full_name ?? '—'}
                        {onBehalf ? (
                          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: C.slate400 }}>{`  ${L('STELLV. ERFASST', 'ON BEHALF')}`}</Text>
                        ) : null}
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate500, marginTop: 2 }}>
                        {weekdayName(e.date, locale, true)}, {formatDateDE(e.date)} · {formatShiftRange(e.start_time, e.end_time, locale)} · {e.break_minutes ?? 0} Min. {L('Pause', 'break')}
                        {e.plan?.start_time && e.plan?.end_time ? ` · ${L('Plan', 'Plan')} ${formatShiftRange(e.plan.start_time, e.plan.end_time, locale)}` : ''}
                      </Text>
                      {issues.length > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                          <AlertTriangle size={13} color={C.red600} />
                          <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '700', color: C.red600, flex: 1 }}>{issues.map((i) => shiftIssueLabel(i, locale)).join(' · ')}</Text>
                        </View>
                      ) : null}
                    </Pressable>
                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <Text style={{ fontSize: 17, fontWeight: '900', color: C.slate900, fontVariant: ['tabular-nums'] }}>
                        {formatHours(entryNetHours(e), locale)}
                        <Text style={{ fontSize: 11, color: C.slate400 }}>{` ${L('Std.', 'h')}`}</Text>
                      </Text>
                      <Pressable
                        onPress={() => approve([e.id])}
                        disabled={issues.length > 0 || busy}
                        accessibilityLabel={L('Freigeben', 'Approve')}
                        hitSlop={4}
                        style={{ marginTop: 6 }}
                      >
                        <View style={{ width: 36, height: 32, borderRadius: 10, backgroundColor: C.emerald600, alignItems: 'center', justifyContent: 'center', opacity: issues.length > 0 || busy ? 0.4 : 1 }}>
                          <CheckCircle2 size={16} color="#FFFFFF" />
                        </View>
                      </Pressable>
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}
        </View>

        {/* 3. Unsent / still running */}
        <View style={{ gap: 12, marginTop: 32 }}>
          <SectionTitle title={L('Nicht abgesendet / nicht beendet', 'Not submitted / not ended')} count={unsent.length} />
          {unsent.length === 0 ? (
            <EmptyState text={L('Alle beendeten Schichten sind abgesendet.', 'All finished shifts have been submitted.')} />
          ) : (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.slate200, overflow: 'hidden' }}>
              {unsent.map((e, idx) => {
                const runningFor = !e.end_time ? hoursBetween(e.start_time, new Date().toISOString(), 0) : 0
                return (
                  <View
                    key={e.id}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: C.slate100 }}
                  >
                    <Pressable onPress={() => openEntry(e.id)} style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate900 }} numberOfLines={1}>{e.employee?.full_name ?? '—'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate500, marginTop: 2 }}>
                        {formatDateDE(e.date)} · {formatShiftRange(e.start_time, e.end_time, locale)}
                        {!e.end_time ? (
                          <Text style={{ color: C.red600, fontWeight: '700' }}>
                            {`  ${L(`läuft seit ${formatHours(runningFor, 'de')} Std.`, `running for ${formatHours(runningFor, 'en')} h`)}`}
                          </Text>
                        ) : null}
                      </Text>
                    </Pressable>
                    <OutlineButton
                      label={L('Erinnern', 'Remind')}
                      icon={reminding === e.id ? <ActivityIndicator size="small" color={C.slate700} /> : <BellRing size={16} color={C.slate700} />}
                      onPress={() => remind(e)}
                      disabled={reminding === e.id}
                      height={36}
                      style={{ marginLeft: 12 }}
                    />
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

function CorrectionCard({ c, onDecide, onOpen }: { c: TimeEntryCorrection; onDecide: (c: TimeEntryCorrection, approve: boolean, note?: string) => Promise<boolean>; onOpen: () => void }) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<null | 'a' | 'r'>(null)
  const o = c.original
  const p = c.proposed
  const hr = L('Std.', 'h')
  const run = async (approve: boolean) => {
    setBusy(approve ? 'a' : 'r')
    await onDecide(c, approve, note)
    setBusy(null)
  }
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: C.amber200, padding: 20, gap: 12 }}>
      <Pressable onPress={onOpen} style={{ alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 14, fontWeight: '900', color: C.slate900 }}>{c.employee?.full_name ?? '—'}</Text>
        <Text style={{ fontSize: 12, fontWeight: '600', color: C.slate500 }}>
          {`${L('Eintrag vom', 'Entry of')} ${formatDateDE(o.date ?? c.entry?.date ?? '')} · ${L('beantragt am', 'requested on')} ${formatDateDE((c.requested_at ?? '').slice(0, 10))}`}
        </Text>
      </Pressable>
      <View style={{ gap: 8 }}>
        <View style={{ borderRadius: 12, backgroundColor: C.slate50, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.slate400 }}>{L('Bisher (gültig)', 'Current (valid)')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate700 }}>
            {formatShiftRange(o.start_time, o.end_time, locale)} · {o.break_minutes ?? 0} Min. · {formatHours(hoursBetween(o.start_time, o.end_time, o.break_minutes), locale)} {hr}
          </Text>
        </View>
        <View style={{ borderRadius: 12, backgroundColor: C.amber50, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.amber600 }}>{L('Beantragt', 'Requested')}</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.amber900 }}>
            {formatShiftRange(p.start_time, p.end_time, locale)} · {p.break_minutes ?? 0} Min. · {formatHours(hoursBetween(p.start_time, p.end_time, p.break_minutes), locale)} {hr}
          </Text>
        </View>
      </View>
      <Text style={{ fontSize: 14, color: C.slate700 }}>
        <Text style={{ fontWeight: '700' }}>{`${L('Begründung', 'Reason')}: `}</Text>
        {c.reason}
      </Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={L('Hinweis an Mitarbeiter (optional)', 'Note to employee (optional)')}
        placeholderTextColor={C.slate400}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 64, borderWidth: 1, borderColor: C.slate200, borderRadius: 12, padding: 12, fontSize: 14, color: C.slate900 }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable disabled={!!busy} onPress={() => run(true)}>
          <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.emerald600, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: busy ? 0.6 : 1 }}>
            {busy === 'a' ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CheckCircle2 size={16} color="#FFFFFF" />}
            <Text style={{ marginLeft: 8, color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' }}>{L('Genehmigen & übernehmen', 'Approve & apply')}</Text>
          </View>
        </Pressable>
        <Pressable disabled={!!busy} onPress={() => run(false)}>
          <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: busy ? 0.6 : 1 }}>
            {busy === 'r' ? <ActivityIndicator size="small" color={C.red600} /> : <XCircle size={16} color={C.red600} />}
            <Text style={{ marginLeft: 8, color: C.red600, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' }}>{L('Ablehnen', 'Reject')}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  )
}
