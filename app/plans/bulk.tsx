/**
 * Bulk plan creation — webapp parity for `/dashboard/plans/bulk`.
 *
 * Inputs:
 *   - a date range (from / to, inclusive)
 *   - a time-of-day (start / end "HH:mm" — overnight handled)
 *   - a customer, optional route, location, notes
 *   - optional start + destination Betriebsstellen
 *   - Gastfahrt switch
 *   - Übernachtung + hotel address
 *   - multi-select of employees
 *   - optional template that pre-fills the form
 *
 * Output:
 *   - cartesian product of (date × employee) inserted as a single
 *     Supabase call
 *   - one summary notification per unique employee ("n new shifts")
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, CalendarPlus, FileUp, ArrowRight, Moon } from 'lucide-react-native'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'

import { Screen } from '@/components/Screen'
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
import { canCreatePlans } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import { calculateShiftTimes, isValidTime } from '@/lib/time/shift-hours'
import { useSafeBack } from '@/lib/use-safe-back'
import { sendNotification } from '@/lib/notifications/service'

export default function BulkPlansScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const goBack = useSafeBack('/plans')
  const { role, profile, session } = useUser()

  const today = format(new Date(), 'yyyy-MM-dd')
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [startTime, setStartTime] = useState('06:00')
  const [endTime, setEndTime] = useState('14:00')
  const [customerId, setCustomerId] = useState('')
  const [location, setLocation] = useState('')
  const [route, setRoute] = useState('')
  const [notes, setNotes] = useState('')
  const [startLocationId, setStartLocationId] = useState('')
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [isGastfahrt, setIsGastfahrt] = useState(false)
  const [overnightStay, setOvernightStay] = useState(false)
  const [hotelAddress, setHotelAddress] = useState('')
  const [employeeIds, setEmployeeIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const days = useMemo(() => {
    try {
      const span = differenceInCalendarDays(parseISO(toDate), parseISO(fromDate))
      if (span < 0) return []
      return Array.from({ length: span + 1 }, (_, i) =>
        format(addDays(parseISO(fromDate), i), 'yyyy-MM-dd'),
      )
    } catch {
      return []
    }
  }, [fromDate, toDate])

  const totalPlans = days.length * employeeIds.length

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten dürfen Mehrfachpläne anlegen.',
            'Only admins or dispatchers can bulk-create plans.',
          )}
        </Text>
      </Screen>
    )
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

  const submit = async () => {
    if (employeeIds.length === 0) {
      toast.error(
        L('Bitte mindestens einen Mitarbeiter auswählen.', 'Pick at least one employee.'),
      )
      return
    }
    if (days.length === 0) {
      toast.error(L('Ungültiger Zeitraum.', 'Invalid date range.'))
      return
    }
    if (!isValidTime(startTime.trim()) || !isValidTime(endTime.trim())) {
      toast.error(L('Bitte gültige Zeiten im Format HH:MM angeben (00:00–23:59).', 'Please enter valid times (HH:MM, 00:00–23:59).'))
      return
    }
    if (!(calculateShiftTimes(days[0], startTime.trim(), endTime.trim(), 0).grossHours > 0)) {
      toast.error(L('Die Schicht dauert 0 Stunden – Start- und Endzeit dürfen nicht gleich sein.', 'The shift lasts 0 hours – start and end time must differ.'))
      return
    }
    // Hotel address is optional with "Übernachtung" (same as the webapp).
    if (!profile?.organization_id || !session?.user?.id) return
    const orgId = profile.organization_id
    const creatorId = session.user.id

    setSaving(true)
    try {
      const rows = days.flatMap((d) => {
        const shift = calculateShiftTimes(d, startTime.trim(), endTime.trim(), 0)
        return employeeIds.map((eid) => ({
          organization_id: orgId,
          creator_id: creatorId,
          employee_id: eid,
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
        }))
      })

      const { error } = await getSupabase().from('plans').insert(rows as any)
      if (error) throw error

      // One summary notification per unique employee.
      const seen = new Set<string>()
      for (const eid of employeeIds) {
        if (seen.has(eid)) continue
        seen.add(eid)
        const count = days.length
        try {
          await sendNotification({
            userId: eid,
            title: 'Neue Schichten zugewiesen',
            message: `Ihnen wurden ${count} neue Schicht(en) zugewiesen. Bitte prüfen und bestätigen.`,
            module: 'plans',
          })
        } catch (e) {
          console.warn('[BulkPlans] notification insert failed (non-fatal):', e)
        }
      }

      toast.success(L(`${totalPlans} Pläne erstellt`, `${totalPlans} plans created`))
      router.replace('/plans')
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const isOvernight = calculateShiftTimes(fromDate, startTime, endTime, 0).isOvernight

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingTop: 12, paddingBottom: 16 }}>
          <Pressable onPress={goBack} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', height: 40, marginLeft: -6 }}>
            <ChevronLeft size={18} color="#64748B" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#64748B', marginLeft: 2 }}>{L('Zurück zu Pläne', 'Back to Plans')}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 24,
                backgroundColor: '#0064E0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 14,
                shadowColor: '#0064E0',
                shadowOpacity: 0.25,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              }}
            >
              <CalendarPlus size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.4, color: '#0064E0', lineHeight: 28 }}>
                {L('Mehrere Pläne anlegen', 'Bulk create plans')}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 4 }}>
                {L('Mitarbeiter und Tage gleichzeitig zuweisen', 'Assign across employees and days at once')}
              </Text>
            </View>
          </View>
        </View>

        <Pressable onPress={() => router.push('/plans/csv-import')}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#EFF6FF',
              borderWidth: 1,
              borderColor: '#DBEAFE',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 36, height: 36, borderRadius: 12, backgroundColor: '#0064E0',
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
              }}
            >
              <FileUp size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                {L('CSV importieren', 'Import from CSV')}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 1 }}>
                {L(
                  'Eine Datei für viele Schichten gleichzeitig.',
                  'One file for many shifts at once.',
                )}
              </Text>
            </View>
            <ArrowRight size={16} color="#0064E0" />
          </View>
        </Pressable>

        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', padding: 14, marginBottom: 12 }}>
          <ShiftTemplatePicker
            onSelect={applyTemplate}
            getCurrentPayload={() => ({
              customer_id: customerId || null,
              start_time: startTime,
              end_time: endTime,
              duration_days: 1,
              route: route || null,
              location: location || null,
              overnight_stay: overnightStay,
              hotel_address: overnightStay ? hotelAddress || null : null,
              notes: notes || null,
            })}
          />
        </View>

        {/* Date range + time of day */}
        <Card className="mb-3 space-y-4" style={{ borderColor: '#F1F5F9' }}>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Von', 'From')}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder={L('JJJJ-MM-TT', 'YYYY-MM-DD')}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Bis', 'To')}
                value={toDate}
                onChangeText={setToDate}
                placeholder={L('JJJJ-MM-TT', 'YYYY-MM-DD')}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Startzeit', 'Start time')}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="06:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Endzeit', 'End time')}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="14:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>
          {isOvernight ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#E0E7FF', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 10 }}>
              <Moon size={15} color="#4338CA" />
              <Text style={{ marginLeft: 8, flex: 1, fontSize: 12, fontWeight: '700', color: '#4338CA' }}>
                {L('Nachtschicht – Ende jeweils am Folgetag', 'Night shift – each ends the next day')}
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Customer + employees */}
        <Card className="mb-3 space-y-4" style={{ borderColor: '#F1F5F9' }}>
          <CustomerPicker value={customerId} onChange={setCustomerId} label={L('Kunde (optional)', 'Customer (optional)')} />
          <EmployeePicker mode="multi" value={employeeIds} onChange={setEmployeeIds} />
        </Card>

        {/* Betriebsstellen + route + location */}
        <Card className="mb-3 space-y-4" style={{ borderColor: '#F1F5F9' }}>
          <OperationalLocationPicker
            value={startLocationId}
            excludeId={destinationLocationId || null}
            onChange={setStartLocationId}
            label={L('Startort', 'Start location')}
          />
          <OperationalLocationPicker
            value={destinationLocationId}
            excludeId={startLocationId || null}
            onChange={setDestinationLocationId}
            label={L('Zielort', 'Destination')}
          />
          <FormField
            label={L('Strecke', 'Route')}
            value={route}
            onChangeText={setRoute}
            placeholder={L('z. B. Köln – Aachen', 'e.g. Köln – Aachen')}
          />
          <FormField label={L('Ort', 'Location')} value={location} onChangeText={setLocation} placeholder={L('Einsatzort', 'Work location')} />
        </Card>

        <Card className="mb-3 space-y-4" style={{ borderColor: '#F1F5F9' }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>
                {L('Gastfahrt', 'Passenger Travel (Gastfahrt)')}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 }}>
                {L(
                  'Wird in jeden erzeugten Plan übernommen.',
                  'Applied to every plan in the batch.',
                )}
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
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>
                {L('Übernachtung erforderlich', 'Requires overnight stay')}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 }}>
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
              label={L('Hoteladresse', 'Hotel Address')}
              value={hotelAddress}
              onChangeText={setHotelAddress}
              placeholder={L('Hotel oder Unterkunft', 'Hotel or lodging')}
            />
          )}
        </Card>

        <Card className="mb-3" style={{ borderColor: '#F1F5F9' }}>
          <FormField label={L('Notizen', 'Notes')} value={notes} onChangeText={setNotes} />
        </Card>

        {/* Summary + submit */}
        <View style={{ borderRadius: 16, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#F5F9FF', padding: 16, marginTop: 4 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
            {L('Vorschau:', 'Preview:')} {totalPlans} {L('Einsätze', 'plans')}
          </Text>
          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
            {days.length} {L('Tag(e)', 'day(s)')} × {employeeIds.length}{' '}
            {L('Mitarbeiter', 'employee(s)')}
          </Text>
          <Button
            label={saving ? t('common.loading') : L('Pläne erstellen', 'Create plans')}
            onPress={submit}
            loading={saving}
            disabled={totalPlans === 0}
            size="lg"
            leftIcon={<CalendarPlus size={20} color="#fff" />}
            style={{ marginTop: 14 }}
          />
        </View>
      </ScrollView>
    </Screen>
  )
}
