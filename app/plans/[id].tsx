/**
 * Plan detail — mobile replica of the webapp's PlanDetailDialog
 * (components/plans/PlanDetailDialog.tsx): shift name as title, weekday +
 * date, status chip, then Zeit · Mitarbeiter · Kunde · Start → Ziel ·
 * Strecke · Einsatzort · Übernachtung · Fahrtart · Hinweise ·
 * Ablehnungsgrund, and the actions Bestätigen / Ablehnen (own shift),
 * Zur Zeiterfassung, Mitarbeiter ändern and Bearbeiten (dispatch).
 *
 * Reject opens a small reason prompt so the dispatcher gets useful
 * context. "Mitarbeiter ändern" uses the same Umverteilung sheet as the
 * Wochenplanung (warnings, started-shift lock, notify both employees).
 */

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Clock,
  User,
  Briefcase,
  MapPin,
  Route as RouteIcon,
  Moon,
  Hotel,
  StickyNote,
  XCircle,
  CheckCircle2,
  ArrowRightLeft,
  Edit2,
  Timer,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { AuditTrail, type AuditEvent } from '@/components/AuditTrail'
import { toast } from '@/components/Toast'
import { Chip, PlanStatusChip } from '@/components/plans/planStatus'
import { ReassignSheet } from '@/components/plans/ReassignSheet'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { usePlans } from '@/hooks/usePlans'
import { usePlanningWeek } from '@/hooks/usePlanningWeek'
import type { Plan } from '@/lib/types'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'
import { planEndDay, planStartDay, weekStartOf } from '@/lib/plans/week'
import { hoursBetween, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatHours, formatShiftRange, weekdayName } from '@/lib/time/format'

const DETAIL_SELECT =
  '*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name), start_location:operational_locations!start_location_id(id, name, short_code, type, address), destination_location:operational_locations!destination_location_id(id, name, short_code, type, address)'

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/plans')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session, isEmployee, role } = useUser()
  const canEdit = canCreatePlans(role)
  const { updateStatus, fetchPlans } = usePlans()

  const [plan, setPlan] = useState<Plan | null>(null)
  const [acting, setActing] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [reassignOpen, setReassignOpen] = useState(false)

  const [creator, setCreator] = useState<{ id: string; full_name: string | null } | null>(null)

  const load = useCallback(() => {
    if (!id) return
    getSupabase()
      .from('plans')
      .select(DETAIL_SELECT)
      .eq('id', id)
      .single()
      .then(({ data }: any) => {
        const row = data as Plan | null
        setPlan(row)
        // Fetch creator name separately so the audit trail can show
        // "von <Name>". `creator_id` is optional in the schema.
        const cid = (row as any)?.creator_id as string | undefined
        if (cid) {
          getSupabase()
            .from('profiles')
            .select('id, full_name')
            .eq('id', cid)
            .maybeSingle()
            .then(({ data: p }: any) => setCreator((p ?? null) as any))
        }
      })
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (!plan) {
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Pressable onPress={goBack} hitSlop={12} style={{ width: 44, height: 44, marginLeft: -8, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={26} color="#0064E0" />
          </Pressable>
        </View>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0064E0" />
          <Text style={{ marginTop: 10, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>
            {t('common.loading')}
          </Text>
        </View>
      </Screen>
    )
  }

  const isMine = plan.employee_id === session?.user?.id
  const canActOnPlan =
    isEmployee && isMine && (plan.status === 'assigned' || plan.status === 'draft')
  const today = localDateKey()
  const runsToday = planStartDay(plan) <= today && planEndDay(plan) >= today
  const showTimeTracking = isMine && runsToday && plan.status !== 'rejected' && plan.status !== 'cancelled'

  const day = planStartDay(plan)
  const hours = hoursBetween(plan.start_time, plan.end_time, 0)
  const fmtLoc = (loc: Plan['start_location']) =>
    loc ? `${loc.name}${loc.short_code ? ` (${loc.short_code})` : ''}` : null
  const from = fmtLoc(plan.start_location)
  const to = fmtLoc(plan.destination_location)
  const employeeName = plan.employee?.full_name ?? null

  const confirm = async () => {
    setActing(true)
    try {
      await updateStatus(plan, 'confirmed')
      toast.success(t('plans.confirmed_toast'))
      setPlan({ ...plan, status: 'confirmed' })
      fetchPlans()
    } catch (err: any) {
      captureError(err, { tags: { action: 'plan.confirm' } })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setActing(false)
    }
  }

  const reject = async () => {
    setActing(true)
    try {
      // One update with the reason, so dispatch's notification carries it.
      const reason = rejectReason.trim()
      await updateStatus(plan, 'rejected', reason)
      toast.success(t('plans.rejected_toast'))
      setPlan({ ...plan, status: 'rejected', rejection_reason: reason || null })
      setRejectOpen(false)
      setRejectReason('')
      fetchPlans()
    } catch (err: any) {
      captureError(err, { tags: { action: 'plan.reject' } })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setActing(false)
    }
  }

  const iconBox = (icon: React.ReactNode) => (
    <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
  )

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
        <PageHeader
          showBack
          onBack={goBack}
          title={plan.shift_name || plan.route || L('Schicht', 'Shift')}
          subtitle={`${weekdayName(day, locale)}, ${formatDateDE(day)}`}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -12, marginBottom: 12 }}>
          <PlanStatusChip status={plan.status} locale={locale} />
          {plan.is_gastfahrt ? <Chip label="Gastfahrt" bg="#F5F3FF" fg="#6D28D9" border="#DDD6FE" /> : null}
        </View>

        <Card style={{ borderColor: '#E2E8F0', paddingVertical: 8, marginBottom: 16 }}>
          <Row
            icon={iconBox(<Clock size={16} color="#2563EB" />)}
            label={L('Zeit', 'Time')}
            value={`${formatShiftRange(plan.start_time, plan.end_time, locale)} · ${formatHours(hours, locale)} ${L('Std.', 'h')}`}
          />
          {canEdit || employeeName ? (
            <Row icon={iconBox(<User size={16} color="#2563EB" />)} label={L('Mitarbeiter', 'Employee')} value={employeeName ?? L('Unbesetzt', 'Unassigned')} />
          ) : null}
          {plan.customer?.name ? (
            <Row icon={iconBox(<Briefcase size={16} color="#2563EB" />)} label={L('Kunde', 'Customer')} value={plan.customer.name} />
          ) : null}
          {from || to ? (
            <Row icon={iconBox(<MapPin size={16} color="#2563EB" />)} label={L('Start → Ziel', 'Start → destination')} value={`${from ?? '—'} → ${to ?? '—'}`} />
          ) : null}
          {plan.route && plan.shift_name ? (
            <Row icon={iconBox(<RouteIcon size={16} color="#2563EB" />)} label={L('Strecke', 'Route')} value={plan.route} />
          ) : null}
          {plan.location ? (
            <Row icon={iconBox(<MapPin size={16} color="#2563EB" />)} label={L('Einsatzort', 'Location')} value={plan.location} />
          ) : null}
          {plan.overnight_stay ? (
            <Row icon={iconBox(<Moon size={16} color="#2563EB" />)} label={L('Übernachtung', 'Overnight')} value={plan.hotel_address || L('Ja', 'Yes')} />
          ) : null}
          {plan.is_gastfahrt ? (
            <Row icon={iconBox(<Hotel size={16} color="#7C3AED" />)} label={L('Fahrtart', 'Trip')} value="Gastfahrt" />
          ) : null}
          {plan.notes ? (
            <Row icon={iconBox(<StickyNote size={16} color="#D97706" />)} label={L('Hinweise', 'Notes')} value={plan.notes} light />
          ) : null}
          {plan.status === 'rejected' && plan.rejection_reason ? (
            <Row icon={iconBox(<XCircle size={16} color="#DC2626" />)} label={L('Ablehnungsgrund', 'Rejection reason')} value={plan.rejection_reason} />
          ) : null}
        </Card>

        {/* Actions — same set and order as the web dialog */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {canActOnPlan ? (
            <>
              <ActionButton
                label={L('Bestätigen', 'Confirm')}
                icon={<CheckCircle2 size={16} color="#FFFFFF" />}
                onPress={confirm}
                loading={acting}
                tone="success"
              />
              <ActionButton
                label={L('Ablehnen', 'Reject')}
                icon={<XCircle size={16} color="#DC2626" />}
                onPress={() => setRejectOpen(true)}
                disabled={acting}
                tone="danger"
              />
            </>
          ) : null}
          {showTimeTracking ? (
            <ActionButton label={L('Zur Zeiterfassung', 'Time tracking')} icon={<Timer size={16} color="#0F172A" />} onPress={() => router.push('/(tabs)/home' as any)} />
          ) : null}
          {canEdit && plan.status !== 'cancelled' ? (
            <>
              <ActionButton label={L('Mitarbeiter ändern', 'Change employee')} icon={<ArrowRightLeft size={16} color="#0F172A" />} onPress={() => setReassignOpen(true)} />
              <ActionButton label={L('Bearbeiten', 'Edit')} icon={<Edit2 size={16} color="#0F172A" />} onPress={() => router.push(`/plans/edit/${plan.id}` as any)} />
            </>
          ) : null}
        </View>

        {/* Audit trail derived from the existing row fields. */}
        <AuditTrail
          events={(() => {
            const events: AuditEvent[] = []
            events.push({
              kind: 'created',
              at: plan.created_at,
              by: creator?.full_name ?? null,
              label: L('Plan erstellt', 'Plan created'),
            })
            if (plan.status === 'confirmed') {
              events.push({
                kind: 'verified',
                at: plan.updated_at,
                by: plan.employee?.full_name ?? null,
                label: L('Vom Mitarbeiter bestätigt', 'Confirmed by employee'),
              })
            } else if (plan.status === 'rejected') {
              events.push({
                kind: 'rejected',
                at: plan.updated_at,
                by: plan.employee?.full_name ?? null,
                label: L('Vom Mitarbeiter abgelehnt', 'Rejected by employee'),
                detail: plan.rejection_reason ?? null,
              })
            } else if (plan.status === 'cancelled') {
              events.push({
                kind: 'status',
                at: plan.updated_at,
                by: null,
                label: L('Storniert', 'Cancelled'),
              })
            } else if (plan.updated_at && plan.updated_at !== plan.created_at) {
              events.push({
                kind: 'updated',
                at: plan.updated_at,
                by: null,
                label: L('Aktualisiert', 'Updated'),
              })
            }
            return events
          })()}
        />
      </ScrollView>

      <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setRejectOpen(false)}
        >
          <Pressable className="w-full bg-white dark:bg-slate-900 rounded-3xl p-5" onPress={(e) => e.stopPropagation()}>
            <Text className="text-[16px] font-black text-gray-900 dark:text-white mb-1">
              {L('Schicht ablehnen', 'Reject shift')}
            </Text>
            <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
              {L(
                'Grund für die Ablehnung (optional). Wird der Disposition mitgeteilt.',
                'Reason for rejection (optional). Will be shared with dispatch.',
              )}
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder={L('Grund für die Ablehnung', 'Reason for rejecting')}
              placeholderTextColor="#9CA3AF"
              style={{
                minHeight: 88,
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
                  onPress={() => setRejectOpen(false)}
                />
              </View>
              <View className="flex-1">
                <Button label={L('Ablehnung senden', 'Send rejection')} loading={acting} onPress={reject} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {reassignOpen ? (
        <DetailReassign
          plan={plan}
          onClose={() => setReassignOpen(false)}
          onDone={() => {
            setReassignOpen(false)
            load()
            fetchPlans()
          }}
        />
      ) : null}
    </Screen>
  )
}

/**
 * Loads the plan's week (for overlap / absence / qualification warnings
 * and the employee list) only while the Umverteilung sheet is open.
 */
function DetailReassign({ plan, onClose, onDone }: { plan: Plan; onClose: () => void; onDone: () => void }) {
  const { plans, employees, absences, qualifications, loading, reassign } = usePlanningWeek(weekStartOf(planStartDay(plan)))
  return (
    <ReassignSheet
      visible
      plan={plan}
      initialTarget={undefined}
      employees={employees}
      plans={plans}
      absences={absences}
      qualifications={qualifications}
      loading={loading}
      onConfirm={async (p, target, notify) => {
        const ok = await reassign(p, target, notify)
        if (ok) onDone()
        return ok
      }}
      onClose={onClose}
    />
  )
}

function ActionButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  tone = 'outline',
}: {
  label: string
  icon: React.ReactNode
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  tone?: 'success' | 'danger' | 'outline'
}) {
  const solid = tone === 'success'
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} style={{ flexGrow: 1, flexBasis: '45%' }}>
      <View
        style={{
          height: 46,
          borderRadius: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          backgroundColor: solid ? '#059669' : '#FFFFFF',
          borderWidth: solid ? 0 : 1,
          borderColor: '#E2E8F0',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator color={solid ? '#FFFFFF' : '#0064E0'} /> : icon}
        <Text
          style={{
            marginLeft: 8,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: solid ? '#FFFFFF' : tone === 'danger' ? '#DC2626' : '#0F172A',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

function Row({
  icon,
  label,
  value,
  light,
}: {
  icon: React.ReactNode
  label: string
  value: string
  light?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F1F5F9' }}>
      {icon}
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: light ? '600' : '700', color: '#0F172A', marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  )
}
