/**
 * Shared plan form — drives both create (/plans/new) and edit
 * (/plans/edit/[id]) flows. In edit mode the template picker and bulk
 * affordances are hidden, matching the web `<PlanForm initialPlan={…} />`
 * behaviour.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, Switch, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { format } from 'date-fns'
import { ArrowDown, ArrowRight, Check, Hotel, Moon, Pencil, Users as UsersIcon } from 'lucide-react-native'

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
import { calculateShiftTimes, isValidDate, isValidTime, localDateKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatEuro } from '@/lib/time/format'
import { useOrgRules } from '@/hooks/useOrgRules'
import { notifyPlanAssigned, notifyPlanChanged, notifyPlanRemoved } from '@/lib/plans/notify'
import type { Plan } from '@/lib/types'

interface PlanFormProps {
  initialPlan?: Plan
  onSuccess?: (planId: string) => void
  showBulkCta?: boolean
  /** Pre-select an employee — used by the dashboard "tap empty cell" flow. */
  initialEmployeeId?: string
  /** Pre-fill the date as YYYY-MM-DD — also used by the dashboard flow. */
  initialDate?: string
}

function timeFromIso(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function dateFromIso(iso: string): string {
  return localDateKey(new Date(iso))
}

const PLAN_JOINS =
  '*, customer:customers(name), start_location:operational_locations!start_location_id(name, short_code), destination_location:operational_locations!destination_location_id(name, short_code)'

export function PlanForm({
  initialPlan,
  onSuccess,
  showBulkCta = false,
  initialEmployeeId,
  initialDate,
}: PlanFormProps) {
  const isEditing = !!initialPlan
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { profile, session } = useUser()
  const { spesenRates } = useOrgRules()

  const [date, setDate] = useState(
    initialPlan
      ? dateFromIso(initialPlan.start_time)
      : (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
          ? initialDate
          : format(new Date(), 'yyyy-MM-dd')),
  )
  const [startTime, setStartTime] = useState(
    initialPlan ? timeFromIso(initialPlan.start_time) : '08:00',
  )
  const [endTime, setEndTime] = useState(
    initialPlan ? timeFromIso(initialPlan.end_time) : '16:00',
  )
  const [employeeId, setEmployeeId] = useState(
    initialPlan?.employee_id ?? initialEmployeeId ?? '',
  )
  const [customerId, setCustomerId] = useState(initialPlan?.customer_id ?? '')
  const [location, setLocation] = useState(initialPlan?.location ?? '')
  const [route, setRoute] = useState(initialPlan?.route ?? '')
  const [shiftName, setShiftName] = useState(initialPlan?.shift_name ?? '')
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
    // Validate before anything is saved or anyone is notified.
    const dateValue = date.trim()
    const startValue = startTime.trim()
    const endValue = endTime.trim()
    if (!dateValue || !startValue || !endValue) {
      toast.error(L('Datum und Zeiten sind erforderlich.', 'Date and times are required.'))
      return
    }
    // isValidDate only checks the shape — also reject 2026-02-31 & co.
    const [yy, mm, dd] = dateValue.split('-').map(Number)
    if (!isValidDate(dateValue) || localDateKey(new Date(yy, mm - 1, dd)) !== dateValue) {
      toast.error(L('Bitte ein gültiges Datum im Format JJJJ-MM-TT angeben.', 'Please enter a valid date (YYYY-MM-DD).'))
      return
    }
    if (!isValidTime(startValue) || !isValidTime(endValue)) {
      toast.error(L('Bitte gültige Zeiten im Format HH:MM angeben (00:00–23:59).', 'Please enter valid times (HH:MM, 00:00–23:59).'))
      return
    }
    const shift = calculateShiftTimes(dateValue, startValue, endValue, 0)
    if (!(shift.grossHours > 0)) {
      toast.error(L('Die Schicht dauert 0 Stunden – Start- und Endzeit dürfen nicht gleich sein.', 'The shift lasts 0 hours – start and end time must differ.'))
      return
    }
    // Hotel address is optional with "Übernachtung" (same as the webapp).
    if (!profile?.organization_id || !session?.user?.id) return

    setSaving(true)
    try {

      if (isEditing && initialPlan) {
        const supabase = getSupabase()
        const newEmployeeId = employeeId || null
        const employeeChanged = newEmployeeId !== initialPlan.employee_id
        const timeChanged =
          shift.startISO !== new Date(initialPlan.start_time).toISOString() ||
          shift.endISO !== new Date(initialPlan.end_time).toISOString()
        const { data: updated, error } = await supabase
          .from('plans')
          .update({
            employee_id: newEmployeeId,
            // A changed assignment or time must be confirmed again.
            ...(employeeChanged || timeChanged ? { status: 'assigned', rejection_reason: null } : {}),
            customer_id: customerId || null,
            start_time: shift.startISO,
            end_time: shift.endISO,
            shift_name: shiftName.trim() || null,
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
          .select(PLAN_JOINS)
          .single()

        if (error) throw error

        try {
          if (employeeChanged) {
            if (initialPlan.employee_id) await notifyPlanRemoved(updated as any, initialPlan.employee_id)
            if (newEmployeeId) await notifyPlanAssigned(updated as any, newEmployeeId)
          } else if (timeChanged && newEmployeeId) {
            await notifyPlanChanged(updated as any, newEmployeeId, initialPlan)
          }
        } catch (e) {
          console.warn('[PlanForm] notification failed (non-fatal):', e)
        }

        toast.success(L('Plan gespeichert', 'Plan saved'))
        if (onSuccess) onSuccess(initialPlan.id)
        else router.replace(`/plans/${initialPlan.id}`)
        return
      }

      const payload: Record<string, unknown> = {
        organization_id: profile.organization_id,
        creator_id: session.user.id,
        employee_id: employeeId || null,
        start_time: shift.startISO,
        end_time: shift.endISO,
        status: 'assigned',
        customer_id: customerId || null,
        location: location || null,
        shift_name: shiftName.trim() || null,
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
        .select(PLAN_JOINS)
        .single()

      if (error) throw error

      if (employeeId) {
        try {
          await notifyPlanAssigned(data as any, employeeId)
        } catch (e) {
          console.warn('[PlanForm] notification failed (non-fatal):', e)
        }
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

  // Snapshot for "Als Vorlage speichern" (web buildTemplatePayload).
  const templatePayload = () => ({
    customer_id: customerId || null,
    start_time: startTime,
    end_time: endTime,
    duration_days: 1,
    route: route || null,
    location: location || null,
    overnight_stay: overnightStay,
    hotel_address: overnightStay ? hotelAddress || null : null,
    notes: notes || null,
  })

  // Night shift hint — same rule the save uses (end before start = next day).
  const shiftPreview = calculateShiftTimes(date, startTime, endTime, 0)

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      {!isEditing && (
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', padding: 14, marginBottom: 12 }}>
          <ShiftTemplatePicker onSelect={applyTemplate} getCurrentPayload={templatePayload} />
        </View>
      )}

      {/* Zuweisung — Personal & Kunden */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Zuweisung', 'Assignment')} subtitle={L('Personal & Kunden', 'Personnel & Clients')} />
        <View className="space-y-4">
          <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} />
          {!employeeId ? (
            <Text className="text-[11px] font-semibold text-amber-700">
              {L('Ohne Auswahl wird die Schicht als „unbesetzt“ gespeichert.', 'Without a selection the shift is saved as unassigned.')}
            </Text>
          ) : null}
          <CustomerPicker value={customerId} onChange={setCustomerId} label={L('Kunde / Projekt', 'Customer / Project')} />
        </View>
      </Card>

      {/* Logistik — Routen & Koordinaten */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Logistik', 'Logistics')} subtitle={L('Routen & Koordinaten', 'Routes & Coordinates')} />
        <View className="space-y-4">
          <FormField
            label={L('Schichtbezeichnung', 'Shift name')}
            value={shiftName}
            onChangeText={setShiftName}
            placeholder={L('z. B. D-ZILB SN 2', 'e.g. D-ZILB SN 2')}
          />
          <FormField
            label={L('Strecke / Route (optional)', 'Route (optional)')}
            value={route}
            onChangeText={setRoute}
            placeholder={L('z. B. Frankfurt Hbf — Nachtschicht', 'e.g. Frankfurt Main Hub - Night Shift')}
          />
          <FormField
            label={L('Physischer Standort (optional)', 'Physical Location (optional)')}
            value={location}
            onChangeText={setLocation}
            placeholder={L('Straße oder GPS-Koordinaten', 'Street Address or GPS Coordinates')}
          />
        </View>
      </Card>

      {/* Start- & Zielort — Betriebsstellen · Fahrtart */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Start- & Zielort', 'Start & Destination')} subtitle={L('Betriebsstellen · Fahrtart', 'Operational Locations · Travel Mode')} />
        <OperationalLocationPicker
          value={startLocationId}
          excludeId={destinationLocationId || null}
          onChange={setStartLocationId}
          label={L('Startort', 'Start location')}
        />
        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
          <ArrowDown size={16} color="#CBD5E1" />
        </View>
        <OperationalLocationPicker
          value={destinationLocationId}
          excludeId={startLocationId || null}
          onChange={setDestinationLocationId}
          label={L('Zielort', 'Destination')}
        />
        <ToggleCard
          icon={<UsersIcon size={18} color="#2563EB" />}
          title={L('Gastfahrt', 'Passenger Travel (Gastfahrt)')}
          subtitle={L('Mitarbeiter reist als Beifahrer (kein aktives Fahren)', 'Employee travels as passenger (not driving)')}
          value={isGastfahrt}
          onChange={setIsGastfahrt}
        />
      </Card>

      {/* Zeitplan — Einsatzfenster */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Zeitplan', 'Timeline')} subtitle={L('Einsatzfenster', 'Operational Window')} />
        <View className="space-y-4">
          <FormField
            label={L('Startdatum', 'Start date')}
            value={date}
            onChangeText={setDate}
            placeholder={L('JJJJ-MM-TT', 'YYYY-MM-DD')}
            keyboardType="numbers-and-punctuation"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Startzeit', 'Start time')}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="08:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Endzeit', 'End time')}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="16:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
        </View>
        {shiftPreview.isOvernight ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E0E7FF', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10 }}>
            <Moon size={15} color="#4338CA" />
            <Text style={{ marginLeft: 8, flex: 1, fontSize: 12, fontWeight: '700', color: '#4338CA' }}>
              {L(
                `Nachtschicht – Ende am Folgetag (${formatDateDE(shiftPreview.endDate)})`,
                `Night shift – ends next day (${shiftPreview.endDate})`,
              )}
            </Text>
          </View>
        ) : null}
        {showBulkCta && !isEditing ? (
          <Pressable onPress={() => router.push('/plans/bulk')} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#F5F9FF', padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>{L('Täglich wiederholen / mehrere zuweisen', 'Repeat daily / assign multiple')}</Text>
                <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 }}>
                  {L('Mehrere Tage und Mitarbeiter auf einmal anlegen', 'Create for several days and employees at once')}
                </Text>
              </View>
              <ArrowRight size={16} color="#0064E0" />
            </View>
          </Pressable>
        ) : null}
      </Card>

      {/* Notizen — Einsatzhinweise */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Notizen', 'Mission Notes')} subtitle={L('Einsatzhinweise', 'Operational Directives')} />
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder={L(
            'Ausführliche Einsatzanweisungen, Sicherheitshinweise oder interne Hinweise…',
            'Detailed deployment instructions, safety protocols, or internal reminders...',
          )}
          placeholderTextColor="#9CA3AF"
          style={{
            minHeight: 120,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: '#F1F5F9',
            backgroundColor: '#F9FAFB',
            padding: 14,
            fontSize: 14,
            fontWeight: '500',
            lineHeight: 20,
            color: '#111827',
            textAlignVertical: 'top',
          }}
        />
      </Card>

      {/* Übernachtung & Spesen — Auswärtstätigkeit */}
      <Card style={{ borderColor: '#F1F5F9', marginBottom: 12 }}>
        <SectionHeader title={L('Übernachtung & Spesen', 'Overnight & Allowance')} subtitle={L('Auswärtstätigkeit', 'Away-from-home trip')} />
        <ToggleCard
          icon={<Moon size={18} color="#2563EB" />}
          title={L('Übernachtung erforderlich', 'Requires overnight stay')}
          subtitle={L(
            `Voller Spesensatz (${formatEuro(spesenRates.full, 'de')}) wird automatisch angewendet`,
            `Full allowance (${formatEuro(spesenRates.full, 'en')}) auto-applied`,
          )}
          value={overnightStay}
          onChange={setOvernightStay}
          noMargin
        />
        {overnightStay ? (
          <View style={{ marginTop: 14 }}>
            <FormField
              label={L('Hoteladresse', 'Hotel Address')}
              value={hotelAddress}
              onChangeText={setHotelAddress}
              placeholder={L('Hotel oder Unterkunft', 'Hotel or lodging')}
              leftIcon={<Hotel size={16} color="#2563EB" />}
            />
          </View>
        ) : null}
      </Card>

      {/* Action bar — Verwerfen · Plan erstellen / Änderungen speichern */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/plans'))} disabled={saving}>
          <View style={{ height: 56, paddingHorizontal: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: '#64748B' }}>{L('Verwerfen', 'Discard')}</Text>
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Button
            label={
              saving
                ? isEditing
                  ? L('Speichern…', 'Saving...')
                  : L('Erstellen…', 'Creating...')
                : isEditing
                  ? L('Änderungen speichern', 'Save changes')
                  : L('Plan erstellen', 'Create plan')
            }
            onPress={submit}
            loading={saving}
            size="lg"
            leftIcon={isEditing ? <Pencil size={18} color="#fff" /> : <Check size={20} color="#fff" />}
          />
        </View>
      </View>
    </ScrollView>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ borderLeftWidth: 4, borderColor: '#0064E0', paddingLeft: 12, marginBottom: 16 }}>
      <Text style={{ fontSize: 19, fontWeight: '600', color: '#0064E0', lineHeight: 22 }}>{title}</Text>
      <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 4, letterSpacing: 0.3 }}>{subtitle}</Text>
    </View>
  )
}

function ToggleCard({
  icon,
  title,
  subtitle,
  value,
  onChange,
  noMargin,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  value: boolean
  onChange: (v: boolean) => void
  noMargin?: boolean
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={{ marginTop: noMargin ? 0 : 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', padding: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          {icon}
        </View>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>{title}</Text>
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 }}>{subtitle}</Text>
        </View>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: '#0064E0', false: '#D1D5DB' }} />
      </View>
    </Pressable>
  )
}
