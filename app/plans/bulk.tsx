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
import { ChevronLeft, CalendarPlus, FileUp } from 'lucide-react-native'
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
import { calculateShiftTimes } from '@/lib/time/shift-hours'
import { useSafeBack } from '@/lib/use-safe-back'

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
    if (overnightStay && !hotelAddress.trim()) {
      toast.error(L('Bitte Hoteladresse angeben.', 'Hotel address required for overnight stay.'))
      return
    }
    if (!profile?.organization_id || !session?.user?.id) return
    const orgId = profile.organization_id
    const creatorId = session.user.id

    setSaving(true)
    try {
      const rows = days.flatMap((d) => {
        const shift = calculateShiftTimes(d, startTime, endTime, 0)
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
          await getSupabase()
            .from('notifications')
            .insert({
              user_id: eid,
              title: L('📋 Neue Schichten zugewiesen', '📋 New shifts assigned'),
              body: L(
                `Ihnen wurden ${count} neue Schicht(en) zugewiesen.`,
                `${count} new shift(s) have been assigned to you.`,
              ),
              type: 'plans',
              is_read: false,
            } as any)
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

  return (
    <Screen className="bg-gray-50 dark:bg-slate-950" background="#F9FAFB" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Mehrere Pläne', 'Bulk create')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <Pressable
          onPress={() => router.push('/plans/csv-import')}
          style={({ pressed }: { pressed: boolean }) => ({
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#EFF6FF', borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10, backgroundColor: '#0064E0',
              alignItems: 'center', justifyContent: 'center', marginRight: 10,
            }}
          >
            <FileUp size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text className="text-[13px] font-black text-gray-900 dark:text-white">
              {L('CSV importieren', 'Import from CSV')}
            </Text>
            <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              {L(
                'Eine Datei für viele Schichten gleichzeitig.',
                'One file for many shifts at once.',
              )}
            </Text>
          </View>
        </Pressable>

        <Card className="mb-3">
          <ShiftTemplatePicker onSelect={applyTemplate} />
        </Card>

        <Card className="mb-3 space-y-4">
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Von', 'From')}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Bis', 'To')}
                value={toDate}
                onChangeText={setToDate}
                placeholder="YYYY-MM-DD"
              />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={t('times.start')}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="06:00"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={t('times.end')}
                value={endTime}
                onChangeText={setEndTime}
                placeholder="14:00"
              />
            </View>
          </View>
          <CustomerPicker value={customerId} onChange={setCustomerId} />
          <EmployeePicker mode="multi" value={employeeIds} onChange={setEmployeeIds} />
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

        {/* Preview */}
        <View className="bg-brand/5 dark:bg-brand/15 border border-brand/20 rounded-2xl p-5 mt-2">
          <Text className="text-[10px] font-black uppercase tracking-widest text-brand mb-1">
            {L('Vorschau', 'Preview')}
          </Text>
          <Text className="text-[22px] font-black text-brand">
            {totalPlans} {L('Einsätze', 'plans')}
          </Text>
          <Text className="text-[12px] text-brand/80 mt-1">
            {days.length} {L('Tag(e)', 'day(s)')} × {employeeIds.length}{' '}
            {L('Mitarbeiter', 'employee(s)')}
          </Text>
        </View>

        <Button
          label={saving ? t('common.loading') : L('Pläne erstellen', 'Create plans')}
          onPress={submit}
          loading={saving}
          disabled={totalPlans === 0}
          size="lg"
          leftIcon={<CalendarPlus size={20} color="#fff" />}
          style={{ marginTop: 12 }}
        />
      </ScrollView>
    </Screen>
  )
}
