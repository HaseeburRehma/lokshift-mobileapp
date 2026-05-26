/**
 * Plan detail screen — surfaces all webapp fields (Betriebsstellen,
 * Gastfahrt, overnight + hotel, rejection reason) and lets employees
 * confirm / reject the plan. Reject opens a small reason prompt so the
 * dispatcher gets useful context.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Modal, TextInput } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Briefcase,
  MapPin,
  Clock,
  User,
  FileText,
  Check,
  X,
  Hotel,
  Route as RouteIcon,
  Users as UsersIcon,
  AlertCircle,
  PenSquare,
} from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { StatusBadge } from '@/components/StatusBadge'
import { AuditTrail, type AuditEvent } from '@/components/AuditTrail'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { usePlans } from '@/hooks/usePlans'
import type { Plan } from '@/lib/types'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

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
  const dateLocale = locale === 'de' ? deLocale : enUS

  const [creator, setCreator] = useState<{ id: string; full_name: string | null } | null>(null)

  useEffect(() => {
    if (!id) return
    getSupabase()
      .from('plans')
      .select(
        '*, employee:profiles!employee_id(id, full_name, avatar_url), customer:customers(id, name), start_location:operational_locations!start_location_id(id, name, short_code, type, address), destination_location:operational_locations!destination_location_id(id, name, short_code, type, address)',
      )
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

  if (!plan) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const isMine = plan.employee_id === session?.user?.id
  const canActOnPlan =
    isEmployee && isMine && (plan.status === 'assigned' || plan.status === 'draft')

  const hours = (
    (new Date(plan.end_time).getTime() - new Date(plan.start_time).getTime()) /
    3_600_000
  ).toFixed(2)

  const confirm = async () => {
    setActing(true)
    try {
      await updateStatus(plan, 'confirmed')
      toast.success(t('plans.confirmed_toast'))
      setPlan({ ...plan, status: 'confirmed' })
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setActing(false)
    }
  }

  const reject = async () => {
    setActing(true)
    try {
      await updateStatus(plan, 'rejected')
      const reason = rejectReason.trim()
      if (reason) {
        await getSupabase()
          .from('plans')
          .update({ rejection_reason: reason } as any)
          .eq('id', plan.id)
      }
      toast.success(t('plans.rejected_toast'))
      setPlan({ ...plan, status: 'rejected', rejection_reason: reason || null })
      setRejectOpen(false)
      setRejectReason('')
      fetchPlans()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setActing(false)
    }
  }

  const fmtLoc = (loc: Plan['start_location']) => {
    if (!loc) return null
    return loc.short_code ? `${loc.short_code} · ${loc.name}` : loc.name
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        {canEdit && plan.status !== 'cancelled' && (
          <Pressable
            onPress={() => router.push(`/plans/edit/${plan.id}` as any)}
            className="p-2 -mr-2"
            accessibilityLabel={L('Plan bearbeiten', 'Edit plan')}
          >
            <PenSquare size={22} color="#0064E0" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <View className="mb-4 flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-1">
              {format(parseISO(plan.start_time), 'EEEE, dd. MMMM yyyy', { locale: dateLocale })}
            </Text>
            <Text className="text-[26px] font-black text-gray-900 dark:text-white tracking-tight">
              {plan.customer?.name ?? L('Einsatz', 'Shift')}
            </Text>
            {plan.is_gastfahrt && (
              <View className="flex-row items-center mt-2">
                <View className="px-2 py-1 rounded-full bg-amber-100">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                    {L('Gastfahrt', 'Guest ride')}
                  </Text>
                </View>
              </View>
            )}
          </View>
          <StatusBadge status={plan.status} />
        </View>

        <Card className="mb-4">
          <Row
            icon={<Clock size={18} color="#0064E0" />}
            label={L('Zeit', 'Time')}
            value={`${format(parseISO(plan.start_time), 'HH:mm')} – ${format(
              parseISO(plan.end_time),
              'HH:mm',
            )} (${hours} h)`}
          />
          {plan.employee?.full_name && (
            <Row
              icon={<User size={18} color="#0064E0" />}
              label={L('Mitarbeiter', 'Employee')}
              value={plan.employee.full_name}
            />
          )}
          {plan.customer?.name && (
            <Row
              icon={<Briefcase size={18} color="#0064E0" />}
              label={t('times.customer')}
              value={plan.customer.name}
            />
          )}
          {fmtLoc(plan.start_location) && (
            <Row
              icon={<MapPin size={18} color="#0064E0" />}
              label={L('Startort', 'Start location')}
              value={fmtLoc(plan.start_location)!}
            />
          )}
          {fmtLoc(plan.destination_location) && (
            <Row
              icon={<MapPin size={18} color="#0064E0" />}
              label={L('Zielort', 'Destination')}
              value={fmtLoc(plan.destination_location)!}
            />
          )}
          {plan.route && (
            <Row
              icon={<RouteIcon size={18} color="#0064E0" />}
              label={L('Strecke', 'Route')}
              value={plan.route}
            />
          )}
          {plan.location && (
            <Row icon={<MapPin size={18} color="#0064E0" />} label={t('times.location')} value={plan.location} />
          )}
          {plan.is_gastfahrt && (
            <Row
              icon={<UsersIcon size={18} color="#0064E0" />}
              label={L('Reiseform', 'Travel type')}
              value={L('Gastfahrt (Mitfahrer)', 'Guest ride (passenger)')}
            />
          )}
          {plan.overnight_stay && (
            <Row
              icon={<Hotel size={18} color="#0064E0" />}
              label={t('times.overnight')}
              value={plan.hotel_address ?? L('Mit Übernachtung', 'With overnight stay')}
            />
          )}
          {plan.notes && (
            <Row icon={<FileText size={18} color="#0064E0" />} label={t('times.notes')} value={plan.notes} />
          )}
          {plan.status === 'rejected' && plan.rejection_reason && (
            <Row
              icon={<AlertCircle size={18} color="#DC2626" />}
              label={L('Ablehnungsgrund', 'Rejection reason')}
              value={plan.rejection_reason}
            />
          )}
        </Card>

        {/* Audit trail derived from the existing row fields. */}
        <View className="mb-4">
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
        </View>

        {canActOnPlan && (
          <View className="space-y-3">
            <Button
              label={t('plans.confirm')}
              size="lg"
              loading={acting}
              onPress={confirm}
              leftIcon={<Check size={20} color="#fff" />}
            />
            <Button
              label={t('plans.reject')}
              variant="secondary"
              size="lg"
              loading={acting}
              onPress={() => setRejectOpen(true)}
              leftIcon={<X size={20} color="#DC2626" />}
            />
          </View>
        )}
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
              placeholder={L('Grund eingeben…', 'Enter reason…')}
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
                <Button label={t('plans.reject')} loading={acting} onPress={reject} />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  )
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-start py-2 border-b border-gray-50 dark:border-slate-800">
      <View className="w-6 mr-3 items-center mt-0.5">{icon}</View>
      <View className="flex-1">
        <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">{label}</Text>
        <Text className="text-[14px] font-bold text-gray-900 dark:text-white mt-0.5">{value}</Text>
      </View>
    </View>
  )
}
