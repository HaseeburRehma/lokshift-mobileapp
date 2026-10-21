/**
 * Meine Woche (Kundenfeedback Punkt 9) — the employee's own week: working
 * days, start/end, shift name, customer, start and end Betriebsstelle and
 * important notes. Changes by dispatch show up live (realtime). Same
 * content as the webapp's /dashboard/plans/my-week.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, Modal, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Clock, MapPin, StickyNote, Timer, CheckCircle2, XCircle, CalendarRange, Info } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { usePlanningWeek } from '@/hooks/usePlanningWeek'
import type { Plan } from '@/lib/types'
import { absenceOn, isoWeek, planEndDay, planStartDay, weekDays, weekStartOf } from '@/lib/plans/week'
import { addDays, hoursBetween, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatHours, formatShiftRange, formatTimeOfDay, weekdayName } from '@/lib/time/format'
import { describePlan } from '@/lib/plans/notify'
import { notifyManagers, sendNotification } from '@/lib/notifications/service'
import { dbErrorMessage } from '@/lib/times/entry-status'
import { Chip, PlanStatusChip, absenceLabel, absenceStyle } from '@/components/plans/planStatus'
import { WeekPickerSheet } from '@/components/plans/WeekPickerSheet'

const loc = (l?: { name?: string | null; short_code?: string | null } | null) =>
  l ? `${l.name ?? ''}${l.short_code ? ` (${l.short_code})` : ''}`.trim() || null : null

export default function MyWeekScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ date?: string }>()
  const { session, profile, isAdmin, isDispatcher } = useUser()
  const myId = session?.user?.id
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const initial = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : localDateKey()
  const [weekStart, setWeekStart] = useState(weekStartOf(initial))
  const [rejecting, setRejecting] = useState<Plan | null>(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const { plans, absences, loading, refetch } = usePlanningWeek(weekStart, { onlyEmployeeId: myId })
  const days = weekDays(weekStart)
  const today = localDateKey()

  const mine = useMemo(() => plans.filter((p) => p.employee_id === myId), [plans, myId])
  const weekPlans = mine.filter((p) => days.includes(planStartDay(p)) && p.status !== 'rejected')
  const plannedHours = weekPlans.reduce((s, p) => s + hoursBetween(p.start_time, p.end_time, 0), 0)
  const openCount = weekPlans.filter((p) => p.status === 'assigned').length

  const respond = async (plan: Plan, status: 'confirmed' | 'rejected', why?: string) => {
    setBusyId(plan.id)
    const { error } = await getSupabase()
      .from('plans')
      .update({ status, rejection_reason: status === 'rejected' ? why?.trim() || null : null, updated_at: new Date().toISOString() } as any)
      .eq('id', plan.id)
    setBusyId(null)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Antwort konnte nicht gespeichert werden', 'Could not save response')))
      return
    }
    toast.success(status === 'confirmed' ? L('Schicht bestätigt', 'Shift confirmed') : L('Schicht abgelehnt', 'Shift rejected'))
    const payload = {
      title: status === 'confirmed' ? 'Schicht bestätigt' : 'Schicht abgelehnt',
      message: `${profile?.full_name ?? 'Mitarbeiter'} hat die Schicht ${describePlan(plan)} ${status === 'confirmed' ? 'bestätigt' : `abgelehnt${why?.trim() ? ` – Grund: ${why.trim()}` : ''}`}.`,
      module: 'plans' as const,
      moduleId: plan.id,
      link: `/dashboard/plans/week?date=${planStartDay(plan)}`,
      skipEmail: status === 'confirmed',
    }
    if (plan.creator_id && plan.creator_id !== myId) void sendNotification({ userId: plan.creator_id, ...payload })
    else void notifyManagers(payload)
    refetch(true)
  }

  const weekLabel = `KW ${isoWeek(weekStart)} · ${formatDateDE(weekStart).slice(0, 6)}–${formatDateDE(addDays(weekStart, 6)).slice(0, 6)}`

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refetch()} tintColor="#0064E0" />}
        >
          <PageHeader
            showBack
            title={L('Meine Woche', 'My week')}
            subtitle={`${weekPlans.length} ${L('Schicht(en)', 'shift(s)')} · ${formatHours(plannedHours, locale)} ${L('Std. geplant', 'h planned')}${openCount ? ` · ${openCount} ${L('zu bestätigen', 'to confirm')}` : ''}`}
          />

          {/* Week switcher */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, height: 44 }}>
              <Pressable onPress={() => setWeekStart((w) => addDays(w, -7))} hitSlop={8} style={{ paddingHorizontal: 10 }} accessibilityLabel={L('Vorwoche', 'Previous week')}>
                <ChevronLeft size={20} color="#0F172A" />
              </Pressable>
              <Pressable onPress={() => setPickerOpen(true)} style={{ flex: 1 }} accessibilityLabel={L('Woche wählen', 'Pick week')}>
                <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '900', color: '#1E293B' }} numberOfLines={1} adjustsFontSizeToFit>{weekLabel}</Text>
              </Pressable>
              <Pressable onPress={() => setWeekStart((w) => addDays(w, 7))} hitSlop={8} style={{ paddingHorizontal: 10 }} accessibilityLabel={L('Folgewoche', 'Next week')}>
                <ChevronRight size={20} color="#0F172A" />
              </Pressable>
            </View>
            <Pressable onPress={() => setWeekStart(weekStartOf(localDateKey()))} style={{ marginLeft: 8 }}>
              <View style={{ height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>{L('Heute', 'Today')}</Text>
              </View>
            </Pressable>
          </View>

          {(isAdmin || isDispatcher) && (
            <Pressable onPress={() => router.push(`/dashboard?date=${weekStart}` as any)} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#EFF6FF', padding: 12 }}>
                <CalendarRange size={16} color="#0064E0" />
                <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '800', color: '#1D4ED8', flex: 1 }}>
                  {L('Wochenplanung', 'Team week')}
                </Text>
                <ChevronRight size={14} color="#0064E0" />
              </View>
            </Pressable>
          )}

          {days.map((d) => {
            const dayPlans = mine.filter((p) => planStartDay(p) === d)
            const cont = mine.filter((p) => planStartDay(p) < d && planEndDay(p) >= d)
            const absence = myId ? absenceOn(absences, myId, d) : undefined
            const isToday = d === today
            return (
              <View
                key={d}
                style={{
                  borderRadius: 18,
                  borderWidth: isToday ? 2 : 1,
                  borderColor: isToday ? '#93C5FD' : '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: isToday ? '#0064E0' : '#1E293B', flex: 1 }}>
                    {weekdayName(d, locale)}, {formatDateDE(d)}
                    {isToday ? (
                      <Text style={{ fontSize: 10, letterSpacing: 1.4 }}>{`  ${L('HEUTE', 'TODAY')}`}</Text>
                    ) : null}
                  </Text>
                  {absence ? (
                    <Chip
                      label={absenceLabel(absence.kind, absence.pending, locale)}
                      bg={absenceStyle(absence.kind, absence.pending).bg}
                      fg={absenceStyle(absence.kind, absence.pending).fg}
                      border={absenceStyle(absence.kind, absence.pending).border}
                      dashed={!!absence.pending && absence.kind !== 'sick'}
                    />
                  ) : null}
                </View>

                {cont.map((p) => (
                  <Text key={`c-${p.id}`} style={{ marginTop: 6, fontSize: 12, fontWeight: '700', color: '#4338CA' }}>
                    ↳ {L('Nachtschicht vom Vortag bis', 'Night shift from previous day until')} {formatTimeOfDay(p.end_time)}
                  </Text>
                ))}

                {dayPlans.length === 0 && cont.length === 0 && !absence && (
                  <Text style={{ marginTop: 6, fontSize: 13, color: '#94A3B8' }}>{L('Frei', 'Off')}</Text>
                )}

                {dayPlans.map((p) => {
                  const from = loc(p.start_location)
                  const to = loc(p.destination_location)
                  const runsToday = planStartDay(p) <= today && planEndDay(p) >= today
                  return (
                    <View key={p.id} style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', padding: 12 }}>
                      <Pressable onPress={() => router.push(`/plans/${p.id}` as any)}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Clock size={15} color="#0064E0" />
                              <Text style={{ marginLeft: 6, fontSize: 15, fontWeight: '900', color: '#0F172A' }}>
                                {formatShiftRange(p.start_time, p.end_time, locale)}
                              </Text>
                              <Text style={{ marginLeft: 6, fontSize: 11, fontWeight: '700', color: '#94A3B8' }}>
                                ({formatHours(hoursBetween(p.start_time, p.end_time, 0), locale)} {L('Std.', 'h')})
                              </Text>
                            </View>
                            {(p.shift_name || p.route) ? (
                              <Text style={{ marginTop: 3, fontSize: 13, fontWeight: '800', color: '#0064E0' }}>{p.shift_name || p.route}</Text>
                            ) : null}
                            {p.customer?.name ? <Text style={{ marginTop: 2, fontSize: 13, fontWeight: '600', color: '#475569' }}>{p.customer.name}</Text> : null}
                            {from || to ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                                <MapPin size={13} color="#64748B" />
                                <Text style={{ marginLeft: 4, fontSize: 13, color: '#475569', flex: 1 }}>{from ?? '—'} → {to ?? '—'}</Text>
                              </View>
                            ) : null}
                            {p.notes ? (
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 }}>
                                <StickyNote size={13} color="#92400E" style={{ marginTop: 2 }} />
                                <Text style={{ marginLeft: 4, fontSize: 13, fontWeight: '600', color: '#92400E', flex: 1 }}>{p.notes}</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ marginLeft: 8 }}>
                            <PlanStatusChip status={p.status} locale={locale} />
                          </View>
                        </View>
                      </Pressable>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        {p.status === 'assigned' && (
                          <>
                            <Pressable onPress={() => respond(p, 'confirmed')} disabled={busyId === p.id}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: '#059669', paddingHorizontal: 12, paddingVertical: 8, opacity: busyId === p.id ? 0.6 : 1 }}>
                                <CheckCircle2 size={14} color="#FFFFFF" />
                                <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#FFFFFF' }}>{L('Bestätigen', 'Confirm')}</Text>
                              </View>
                            </Pressable>
                            <Pressable onPress={() => { setReason(''); setRejecting(p) }} disabled={busyId === p.id}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, paddingVertical: 8 }}>
                                <XCircle size={14} color="#DC2626" />
                                <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#DC2626' }}>{L('Ablehnen', 'Reject')}</Text>
                              </View>
                            </Pressable>
                          </>
                        )}
                        <Pressable onPress={() => router.push(`/plans/${p.id}` as any)}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8 }}>
                            <Info size={14} color="#334155" />
                            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#334155' }}>{L('Details', 'Details')}</Text>
                          </View>
                        </Pressable>
                        {runsToday && (
                          <Pressable onPress={() => router.push('/(tabs)/home' as any)}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 8 }}>
                              <Timer size={14} color="#0064E0" />
                              <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '900', color: '#334155' }}>{L('Zeiterfassung', 'Time tracking')}</Text>
                            </View>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </ScrollView>
      </Screen>

      <WeekPickerSheet
        visible={pickerOpen}
        weekStart={weekStart}
        onPick={(d) => {
          setWeekStart(weekStartOf(d))
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />

      {/* Reject with reason */}
      <Modal visible={!!rejecting} transparent animationType="fade" onRequestClose={() => setRejecting(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>{L('Schicht ablehnen', 'Reject shift')}</Text>
            {rejecting && <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>{describePlan(rejecting)}</Text>}
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              placeholder={L('Grund (optional), z. B. Arzttermin', 'Reason (optional), e.g. doctor appointment')}
              placeholderTextColor="#9CA3AF"
              style={{ marginTop: 12, minHeight: 72, borderWidth: 2, borderColor: '#F1F5F9', borderRadius: 14, padding: 12, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB' }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setRejecting(null)}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', padding: 10 }}>{L('Abbrechen', 'Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const p = rejecting
                  setRejecting(null)
                  if (p) await respond(p, 'rejected', reason)
                }}
              >
                <View style={{ borderRadius: 12, backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>{L('Ablehnen', 'Reject')}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
