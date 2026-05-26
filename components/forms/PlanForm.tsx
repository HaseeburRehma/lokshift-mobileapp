/**
 * Shared plan form — drives both create (/plans/new) and edit
 * (/plans/edit/[id]) flows. In edit mode the template picker and bulk
 * affordances are hidden, matching the web `<PlanForm initialPlan={…} />`
 * behaviour.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { format } from 'date-fns'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { CustomerPicker } from '@/components/forms/CustomerPicker'
import { OperationalLocationPicker } from '@/components/forms/OperationalLocationPicker'
import { ShiftTemplatePicker } from '@/components/forms/ShiftTemplatePicker'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { calculateShiftTimes } from '@/lib/time/shift-hours'
import type { Plan } from '@/lib/types'

interface PlanFormProps {
  initialPlan?: Plan
  onSuccess?: (planId: string) => void
  showBulkCta?: boolean
}

function timeFromIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dateFromIso(iso: string): string {
  return iso.slice(0, 10)
}

export function PlanForm({ initialPlan, onSuccess, showBulkCta = false }: PlanFormProps) {
  const isEditing = !!initialPlan
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { profile, session } = useUser()

  const [date, setDate] = useState(
    initialPlan ? dateFromIso(initialPlan.start_time) : format(new Date(), 'yyyy-MM-dd'),
  )
  const [startTime, setStartTime] = useState(
    initialPlan ? timeFromIso(initialPlan.start_time) : '08:00',
  )
  const [endTime, setEndTime] = useState(
    initialPlan ? timeFromIso(initialPlan.end_time) : '16:00',
  )
  const [employeeId, setEmployeeId] = useState(initialPlan?.employee_id ?? '')
  const [customerId, setCustomerId] = useState(initialPlan?.customer_id ?? '')
  const [location, setLocation] = useState(initialPlan?.location ?? '')
  const [route, setRoute] = useState(initialPlan?.route ?? '')
  const [notes, setNotes] = useState(initialPlan?.notes ?? '')
  const [startLocationId, setStartLocationId] = useState(initialPlan?.start_location_id ?? '')
  const [destinationLocationId, setDestinationLocationId] = useState(
    initialPlan?.destination_location_id ?? '',
  )
  const [isGastfahrt, setIsGastfahrt] = useState(initialPlan?.is_gastfahrt ?? false)
  const [overnightStay, setOvernightStay] = useState(initialPlan?.overnight_stay ?? false)
  const [hotelAddress, setHotelAddress] = useState(initialPlan?.hotel_address ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!employeeId) {
      toast.error(L('Bitte einen Mitarbeiter auswählen.', 'Pick an employee.'))
      return
    }
    if (!date || !startTime || !endTime) {
      toast.error(L('Datum und Zeiten sind erforderlich.', 'Date and times are required.'))
      return
    }
    if (overnightStay && !hotelAddress.trim()) {
      toast.error(L('Bitte Hoteladresse angeben.', 'Hotel address required for overnight stay.'))
      return
    }
    if (!profile?.organization_id || !session?.user?.id) return

    setSaving(true)
    try {
      const shift = calculateShiftTimes(date, startTime, endTime, 0)

      if (isEditing && initialPlan) {
        const supabase = getSupabase()
        const { error } = await supabase
          .from('plans')
          .update({
            employee_id: employeeId,
            customer_id: customerId || null,
            start_time: shift.startISO,
            end_time: shift.endISO,
            route: route || null,
            location: location || null,
            notes: notes || null,
            overnight_stay: overnightStay,
            hotel_address: overnightStay ? hotelAddress || null : null,
            start_location_id: startLocationId || null,
            destination_location_id: destinationLocationId || null,
            is_gastfahrt: isGastfahrt,
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', initialPlan.id)

        if (error) throw error

        if (employeeId !== initialPlan.employee_id) {
          try {
            await supabase.from('notifications').insert({
              user_id: employeeId,
              title: '📋 Schicht aktualisiert',
              body: L(
                `Schicht am ${format(new Date(shift.startISO), 'dd.MM.yyyy HH:mm')}`,
                `Shift on ${format(new Date(shift.startISO), 'MMM dd yyyy HH:mm')}`,
              ),
              type: 'plans',
              is_read: false,
            } as any)
          } catch (e) {
            console.warn('[PlanForm] notification insert failed (non-fatal):', e)
          }
        }

        toast.success(L('Plan gespeichert', 'Plan saved'))
        if (onSuccess) onSuccess(initialPlan.id)
        else router.replace(`/plans/${initialPlan.id}`)
        return
      }

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        creator_id: session.user.id,
        employee_id: employeeId,
        start_time: shift.startISO,
        end_time: shift.endISO,
        status: 'assigned',
        customer_id: customerId || null,
        location: location || null,
        route: route || null,
        notes: notes || null,
        start_location_id: startLocationId || null,
        destination_location_id: destinationLocationId || null,
        is_gastfahrt: isGastfahrt,
        overnight_stay: overnightStay,
        hotel_address: overnightStay ? hotelAddress || null : null,
      }

      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('plans')
        .insert(payload as any)
        .select()
        .single()

      if (error) throw error

      try {
        await supabase.from('notifications').insert({
          user_id: employeeId,
          title: '📋 Neue Schicht zugewiesen',
          body: L(
            `Schicht am ${format(new Date(shift.startISO), 'dd.MM.yyyy HH:mm')}`,
            `Shift on ${format(new Date(shift.startISO), 'MMM dd yyyy HH:mm')}`,
          ),
          type: 'plans',
          is_read: false,
        } as any)
      } catch (e) {
        console.warn('[PlanForm] notification insert failed (non-fatal):', e)
      }

      toast.success(L('Plan erstellt', 'Plan created'))
      const newId = (data as any).id as string
      if (onSuccess) onSuccess(newId)
      else router.replace(`/plans/${newId}`)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const applyTemplate = (tpl: {
    name: string
    customer_id: string | null
    start_time: string
    end_time: string
    route: string | null
    location: string | null
    overnight_stay: boolean
    hotel_address: string | null
    notes: string | null
  }) => {
    setStartTime(tpl.start_time)
    setEndTime(tpl.end_time)
    if (tpl.customer_id) setCustomerId(tpl.customer_id)
    if (tpl.location) setLocation(tpl.location)
    if (tpl.route) setRoute(tpl.route)
    if (tpl.notes) setNotes(tpl.notes)
    setOvernightStay(tpl.overnight_stay)
    setHotelAddress(tpl.hotel_address ?? '')
    toast.success(L(`Vorlage „${tpl.name}" angewendet`, `Template "${tpl.name}" applied`))
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      {!isEditing && (
        <Card className="mb-3">
          <ShiftTemplatePicker onSelect={applyTemplate} />
        </Card>
      )}

      <Card className="mb-3 space-y-4">
        <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} />
        <FormField
          label={t('times.date')}
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField
              label={t('times.start')}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="08:00"
            />
          </View>
          <View className="flex-1">
            <FormField
              label={t('times.end')}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="16:00"
            />
          </View>
        </View>
        <CustomerPicker value={customerId} onChange={setCustomerId} />
      </Card>

      <Card className="mb-3 space-y-4">
        <OperationalLocationPicker
          value={startLocationId}
          onChange={setStartLocationId}
          label={L('Startort', 'Start location')}
        />
        <OperationalLocationPicker
          value={destinationLocationId}
          onChange={setDestinationLocationId}
          label={L('Zielort', 'Destination')}
        />
        <FormField
          label={L('Strecke', 'Route')}
          value={route}
          onChangeText={setRoute}
          placeholder={L('z. B. Köln – Aachen', 'e.g. Köln – Aachen')}
        />
        <FormField label={t('times.location')} value={location} onChangeText={setLocation} />
      </Card>

      <Card className="mb-3 space-y-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {L('Gastfahrt (Mitfahrer)', 'Guest ride (passenger)')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L('Stunden werden separat ausgewiesen.', 'Hours are reported separately.')}
            </Text>
          </View>
          <Switch
            value={isGastfahrt}
            onValueChange={setIsGastfahrt}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {t('times.overnight')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Löst die volle Verpflegungspauschale aus.',
                'Triggers the full per-diem rate.',
              )}
            </Text>
          </View>
          <Switch
            value={overnightStay}
            onValueChange={setOvernightStay}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </View>

        {overnightStay && (
          <FormField
            label={t('times.hotel')}
            value={hotelAddress}
            onChangeText={setHotelAddress}
            placeholder={L('Adresse oder Hotelname', 'Address or hotel name')}
          />
        )}
      </Card>

      <Card className="mb-3">
        <FormField label={t('times.notes')} value={notes} onChangeText={setNotes} multiline />
      </Card>

      {showBulkCta && !isEditing && (
        <View className="flex-row gap-3 mt-2">
          <View className="flex-1">
            <Button
              label={L('Mehrere Tage / Mitarbeiter', 'Bulk create')}
              variant="secondary"
              onPress={() => router.push('/plans/bulk')}
            />
          </View>
        </View>
      )}

      <Button
        label={
          saving
            ? t('common.loading')
            : isEditing
              ? L('Änderungen speichern', 'Save changes')
              : L('Plan erstellen', 'Create plan')
        }
        onPress={submit}
        loading={saving}
        size="lg"
        style={{ marginTop: 12 }}
      />
    </ScrollView>
  )
}
