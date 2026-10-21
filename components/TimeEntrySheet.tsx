/**
 * Modal sheet for creating/editing a single time entry — native layout of
 * the webapp's TimeEntryForm (same field order, labels and previews):
 *
 *   Mitarbeiter (admin/dispatcher, new entries) · Geplante Schicht übernehmen
 *   Datum · Pause in Minuten · Beginn / Ende · Arbeitszeit preview
 *   Übernachtung (+ optional Hoteladresse) · Spesen (Voransicht)
 *   Kunde · Standort · Notizen · Geplante Zeit (in der Zukunft)
 *   Start- & Zielort (Betriebsstellen) · Gastfahrt
 *   Änderungsgrund · Direkt freigeben · Doppelerfassung · Speichern
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, TextInput } from 'react-native'
import {
  AlertTriangle,
  ArrowDown,
  Calendar,
  CalendarClock,
  Clock,
  FileText,
  Hotel,
  MapPin,
  Moon,
  Save,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react-native'

import { Button } from './Button'
import { FormField } from './FormField'
import { toast } from './Toast'
import { CustomerPicker } from './forms/CustomerPicker'
import { EmployeePicker } from './forms/EmployeePicker'
import { OperationalLocationPicker } from './forms/OperationalLocationPicker'
import { C, IconTile, MicroLabel, SheetHeader, ToggleCard } from './time/ui'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { addDays, calculateShiftTimes, isValidDate, isValidTime, localDateKey, localTimeKey } from '@/lib/time/shift-hours'
import { calculateSpesen, spesenTierLabel } from '@/lib/spesen'
import { formatDateDE, formatEuro, formatHours, formatHoursLong, formatShiftRange } from '@/lib/time/format'
import { useOrgRules } from '@/hooks/useOrgRules'
import { getSupabase } from '@/lib/supabase/client'
import { dbErrorMessage } from '@/lib/times/entry-status'
import { sendNotification } from '@/lib/notifications/service'
import type { Plan, TimeEntry } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  initial: TimeEntry | null
  onCreate: (payload: Partial<TimeEntry>) => Promise<TimeEntry>
  onUpdate: (id: string, patch: Partial<TimeEntry>) => Promise<TimeEntry>
  onDelete: (id: string) => Promise<void>
}

const fieldIcon = (icon: React.ReactNode) => <IconTile icon={icon} size={36} radius={10} />

export function TimeEntrySheet({
  open,
  onClose,
  initial,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { isAdmin, isDispatcher, session, profile } = useUser()
  const isManagerial = isAdmin || isDispatcher
  const canDelete = isManagerial
  const { spesenRates } = useOrgRules()
  const myId = session?.user?.id

  const [date, setDate] = useState(localDateKey())
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('16:00')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [customerId, setCustomerId] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [overnight, setOvernight] = useState(false)
  const [hotelAddress, setHotelAddress] = useState('')
  const [startLocationId, setStartLocationId] = useState('')
  const [destinationLocationId, setDestinationLocationId] = useState('')
  const [isGastfahrt, setIsGastfahrt] = useState(false)
  const [isPlanned, setIsPlanned] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [planId, setPlanId] = useState<string | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [approveNow, setApproveNow] = useState(false)
  const [reason, setReason] = useState('')
  const [overlaps, setOverlaps] = useState<TimeEntry[] | null>(null)
  const [saving, setSaving] = useState(false)
  const requireReason = isManagerial && !!initial?.submitted_at

  // Reset / hydrate fields whenever the modal opens with a different entry.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setDate(initial.date.slice(0, 10))
      setStartTime(localTimeKey(new Date(initial.start_time)))
      setEndTime(initial.end_time ? localTimeKey(new Date(initial.end_time)) : '')
      setPlanId(initial.plan_id ?? null)
      setBreakMinutes(String(initial.break_minutes ?? 0))
      setCustomerId(initial.customer_id ?? '')
      setLocation(initial.location ?? '')
      setNotes(initial.notes ?? '')
      setOvernight(!!initial.overnight_stay)
      setHotelAddress(initial.hotel_address ?? '')
      setStartLocationId(initial.start_location_id ?? '')
      setDestinationLocationId(initial.destination_location_id ?? '')
      setIsGastfahrt(!!initial.is_gastfahrt)
      setIsPlanned(!!initial.is_planned)
      setEmployeeId(initial.employee_id ?? '')
    } else {
      setDate(localDateKey())
      setPlanId(null)
      setStartTime('08:00')
      setEndTime('16:00')
      setBreakMinutes('0')
      setCustomerId('')
      setLocation('')
      setNotes('')
      setOvernight(false)
      setHotelAddress('')
      setStartLocationId('')
      setDestinationLocationId('')
      setIsGastfahrt(false)
      setIsPlanned(false)
      setEmployeeId('')
    }
    setApproveNow(false)
    setReason('')
    setOverlaps(null)
  }, [open, initial])

  // Known shifts of the chosen employee on that day — picking one fills
  // in times, customer and Betriebsstellen (Kundenfeedback Punkt 4).
  const targetEmployee = isManagerial ? (initial?.employee_id ?? employeeId) : myId
  useEffect(() => {
    if (!open || !targetEmployee || !isValidDate(date)) {
      setPlans([])
      return
    }
    let cancelled = false
    getSupabase()
      .from('plans')
      .select('*, customer:customers(id, name)')
      .eq('employee_id', targetEmployee)
      .not('status', 'in', '(cancelled,rejected)')
      .gte('start_time', new Date(`${addDays(date, -1)}T12:00:00`).toISOString())
      .lte('start_time', new Date(`${addDays(date, 1)}T12:00:00`).toISOString())
      .order('start_time')
      .then(({ data }: { data: Plan[] | null }) => {
        if (!cancelled) setPlans((data ?? []).filter((p) => localDateKey(new Date(p.start_time)) === date))
      })
    return () => {
      cancelled = true
    }
  }, [open, targetEmployee, date])

  const applyPlan = (p: Plan) => {
    setPlanId(p.id)
    setDate(localDateKey(new Date(p.start_time)))
    setStartTime(localTimeKey(new Date(p.start_time)))
    setEndTime(localTimeKey(new Date(p.end_time)))
    if (p.customer_id) setCustomerId(p.customer_id)
    if (p.start_location_id) setStartLocationId(p.start_location_id)
    if (p.destination_location_id) setDestinationLocationId(p.destination_location_id)
    setIsGastfahrt(!!p.is_gastfahrt)
    setOvernight(!!p.overnight_stay)
    if (p.hotel_address) setHotelAddress(p.hotel_address)
    if (p.location) setLocation(p.location)
  }

  const shift = useMemo(
    () => calculateShiftTimes(date, startTime, endTime, Number(breakMinutes) || 0),
    [date, startTime, endTime, breakMinutes],
  )

  const mealAllowance = useMemo(
    () => calculateSpesen(shift.netHours, overnight, spesenRates),
    [shift.netHours, overnight, spesenRates],
  )

  let formError: string | null = null
  if (isManagerial && !initial && !employeeId) formError = L('Bitte einen Mitarbeiter auswählen.', 'Please select an employee.')
  else if (!isValidDate(date)) formError = L('Bitte ein gültiges Datum eingeben (JJJJ-MM-TT).', 'Please enter a valid date (YYYY-MM-DD).')
  else if (!isValidTime(startTime) || !isValidTime(endTime)) formError = L('Bitte Beginn und Ende im Format HH:MM eingeben.', 'Please enter start and end as HH:MM.')
  else if (startTime === endTime) formError = L('Ende entspricht dem Beginn.', 'End equals start.')
  else if (shift.netHours <= 0) formError = L('Die Pause ist so lang wie die Schicht.', 'The break is as long as the shift.')
  else if (requireReason && reason.trim().length < 3) formError = L('Bitte einen Änderungsgrund angeben.', 'Please enter a reason for the change.')

  const findOverlaps = async (emp: string): Promise<TimeEntry[]> => {
    let q = getSupabase()
      .from('time_entries')
      .select('id, date, start_time, end_time, break_minutes, net_hours, employee_id')
      .eq('employee_id', emp)
      .eq('is_planned', false)
      .lt('start_time', shift.endISO)
      .or(`end_time.gt.${shift.startISO},end_time.is.null`)
    if (initial) q = q.neq('id', initial.id)
    const { data } = await q
    return (data ?? []) as TimeEntry[]
  }

  const submit = async (skipOverlapCheck = false) => {
    if (formError) {
      toast.error(formError)
      return
    }
    // Hotel address is optional for an overnight stay (same as the webapp).
    if (isManagerial && !initial && !employeeId) {
      toast.error(
        L(
          'Bitte einen Mitarbeiter auswählen.',
          'Pick the employee this entry is for.',
        ),
      )
      return
    }
    const target = isManagerial ? (initial?.employee_id ?? employeeId) : (initial?.employee_id ?? myId)
    if (!skipOverlapCheck && target && !isPlanned) {
      const found = await findOverlaps(target)
      if (found.length) {
        setOverlaps(found)
        return
      }
    }
    setOverlaps(null)
    setSaving(true)
    try {
      const onBehalf = isManagerial && !initial && !!employeeId && employeeId !== myId
      const payload: Partial<TimeEntry> = {
        date,
        start_time: shift.startISO,
        end_time: shift.endISO,
        break_minutes: Number(breakMinutes) || 0,
        plan_id: planId,
        customer_id: customerId || null,
        location: location || null,
        notes: notes || null,
        overnight_stay: overnight,
        hotel_address: overnight ? hotelAddress || null : null,
        meal_allowance: mealAllowance,
        start_location_id: startLocationId || null,
        destination_location_id: destinationLocationId || null,
        is_gastfahrt: isGastfahrt,
        is_planned: isPlanned,
      }
      // Admin/Dispatcher may enter on behalf of another employee. When
      // creating, set employee_id so the hook's default (self) is
      // overridden. When updating, leave employee_id alone — re-assigning
      // a logged shift to another worker is a separate flow.
      if (isManagerial && !initial && employeeId) {
        payload.employee_id = employeeId
      }
      // Entered by dispatch/admin → counts as submitted; optionally approved.
      if (isManagerial && !initial && !isPlanned) {
        payload.submitted_at = new Date().toISOString()
        if (approveNow) {
          payload.is_verified = true
          payload.verified_by = myId ?? null
        }
      }
      if (requireReason) payload.change_reason = `Änderung durch Disposition: ${reason.trim()}`
      let saved: TimeEntry
      if (initial) {
        saved = await onUpdate(initial.id, payload)
      } else {
        saved = await onCreate(payload)
      }
      if (onBehalf) {
        void sendNotification({
          userId: employeeId,
          title: 'Zeiten für Sie erfasst',
          message: `${profile?.full_name ?? 'Die Disposition'} hat für Sie eine Schicht am ${formatDateDE(date)} (${startTime}–${endTime}, ${formatHours(shift.netHours, 'de')} Std.) erfasst.`,
          module: 'time_entries',
          moduleId: saved?.id,
        })
      } else if (requireReason && initial && initial.employee_id !== myId) {
        void sendNotification({
          userId: initial.employee_id,
          title: 'Zeiteintrag geändert',
          message: `Ihr Zeiteintrag vom ${formatDateDE(initial.date)} wurde geändert: ${startTime}–${endTime}, ${formatHours(shift.netHours, 'de')} Std. Grund: ${reason.trim()}`,
          module: 'time_entries',
          moduleId: initial.id,
        })
      }
      toast.success(t('times.saved'))
      onClose()
    } catch (err: any) {
      toast.error(dbErrorMessage(err, locale, err?.message ?? t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!initial) return
    setSaving(true)
    try {
      await onDelete(initial.id)
      toast.success(t('times.deleted'))
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const hr = L('Std.', 'h')

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SheetHeader
          title={initial ? L('Zeiteintrag bearbeiten', 'Edit Time Entry') : L('Zeiteintrag hinzufügen', 'Add Time Entry')}
          onClose={onClose}
          closeLabel={L('Schließen', 'Close')}
          right={
            canDelete && initial ? (
              <Pressable onPress={confirmDelete} hitSlop={10} accessibilityLabel={L('Löschen', 'Delete')}>
                <Trash2 size={20} color={C.red600} />
              </Pressable>
            ) : null
          }
        />

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 20 }}>
            {/* Mitarbeiter — admin/dispatcher only (new entries) */}
            {isManagerial && !initial ? (
              <View>
                <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} />
                <Text style={{ marginTop: 6, marginLeft: 4, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.gray400, lineHeight: 14 }}>
                  {L(
                    'Disposition/Admin: Diese Schicht wird für den ausgewählten Mitarbeiter gespeichert.',
                    'Dispatch/admin: this shift will be recorded for the selected employee.',
                  )}
                </Text>
              </View>
            ) : null}

            {plans.length > 0 ? (
              <View>
                <MicroLabel style={{ marginLeft: 4, marginBottom: 6 }}>{L('Geplante Schicht übernehmen', 'Use planned shift')}</MicroLabel>
                <View style={{ gap: 6 }}>
                  {plans.map((p) => {
                    const sel = planId === p.id
                    return (
                      <Pressable key={p.id} onPress={() => applyPlan(p)} accessibilityState={{ selected: sel }}>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: sel ? C.brand : C.gray100,
                            backgroundColor: sel ? C.blue50 : 'rgba(249,250,251,0.6)',
                            borderRadius: 16,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                          }}
                        >
                          <IconTile icon={<CalendarClock size={18} color={C.blue600} />} size={36} radius={10} />
                          <Text style={{ flex: 1, marginLeft: 10, fontSize: 13, fontWeight: '800', color: sel ? C.brand : C.slate700 }}>
                            {formatShiftRange(p.start_time, p.end_time, locale)}
                            {p.shift_name || p.route ? ` · ${p.shift_name || p.route}` : ''}
                            {p.customer?.name ? ` · ${p.customer.name}` : ''}
                          </Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
                <Text style={{ marginTop: 6, marginLeft: 4, fontSize: 11, color: C.slate400 }}>
                  {L('Schicht auswählen – Daten werden vorausgefüllt', 'Pick a shift – details are pre-filled')}
                </Text>
              </View>
            ) : null}

            <FormField
              label={`${L('Datum', 'Date')} *`}
              value={date}
              onChangeText={setDate}
              placeholder="JJJJ-MM-TT"
              autoCapitalize="none"
              leftIcon={fieldIcon(<Calendar size={18} color={C.blue600} />)}
            />

            <FormField
              label={L('Pause in Minuten (0 = keine Pause)', 'Break in minutes (0 = no break)')}
              value={breakMinutes}
              onChangeText={(v) => setBreakMinutes(v.replace(/\D/g, ''))}
              placeholder={L('0 Min.', '0 Mins')}
              keyboardType="number-pad"
              leftIcon={fieldIcon(<Clock size={18} color={C.blue600} />)}
            />

            <View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <FormField
                    label={`${L('Beginn', 'Start')} *`}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="08:00"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label={`${L('Ende', 'End')} *`}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="16:00"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>
              {/* Arbeitszeit preview strip */}
              <View
                style={{
                  marginTop: 10,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: 'rgba(239,246,255,0.7)',
                  borderWidth: 1,
                  borderColor: C.blue100,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Clock size={14} color={C.blue700} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: C.blue700 }}>
                  {`${L('Arbeitszeit', 'Working time')}: ${formatHours(shift.netHours, locale)} ${hr} (= ${formatHoursLong(shift.netHours, locale)})`}
                </Text>
                {shift.isOvernight ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Moon size={14} color={C.indigo700} />
                    <Text style={{ marginLeft: 4, fontSize: 11, fontWeight: '700', color: C.indigo700 }}>
                      {L(`Ende am Folgetag (${formatDateDE(shift.endDate)})`, `Ends next day (${shift.endDate})`)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Übernachtung + optional hotel + Spesen preview */}
            <View style={{ gap: 12 }}>
              <ToggleCard
                icon={<IconTile icon={<Moon size={18} color={C.blue600} />} />}
                title={L('Übernachtung', 'Overnight stay')}
                subtitle={L(`Voller Spesensatz €${spesenRates.full.toFixed(0)}`, `Full allowance €${spesenRates.full.toFixed(0)}`)}
                value={overnight}
                onValueChange={setOvernight}
              />
              {overnight ? (
                <FormField
                  label={L('Hoteladresse', 'Hotel Address')}
                  value={hotelAddress}
                  onChangeText={setHotelAddress}
                  placeholder={L('Hotel oder Unterkunft', 'Hotel or lodging')}
                  leftIcon={fieldIcon(<Hotel size={18} color={C.blue600} />)}
                />
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: C.blue100,
                  backgroundColor: 'rgba(239,246,255,0.5)',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <MicroLabel color={C.blue600}>{L('Spesen (Voransicht)', 'Meal Allowance (preview)')}</MicroLabel>
                  <Text style={{ marginTop: 2, fontSize: 11, fontWeight: '600', color: 'rgba(29,78,216,0.8)' }}>
                    {`${spesenTierLabel(mealAllowance, spesenRates, locale)} · ${formatHours(shift.netHours, locale)} ${hr}`}
                  </Text>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: C.blue700, fontVariant: ['tabular-nums'] }}>
                  {formatEuro(mealAllowance, locale)}
                </Text>
              </View>
            </View>

            <CustomerPicker value={customerId} onChange={setCustomerId} label={L('Kunde auswählen', 'Select Customer')} />

            <FormField
              label={L('Standort (optional)', 'Location (Optional)')}
              value={location}
              onChangeText={setLocation}
              placeholder={L('Standort eingeben', 'Enter Location')}
              leftIcon={fieldIcon(<MapPin size={18} color={C.blue600} />)}
            />

            <TextArea
              label={L('Notizen (optional)', 'Notes (Optional)')}
              value={notes}
              onChangeText={setNotes}
              placeholder={L('Notizen hinzufügen', 'Add Notes')}
              icon={fieldIcon(<FileText size={18} color={C.blue600} />)}
            />

            <ToggleCard
              icon={<IconTile icon={<CalendarClock size={18} color={C.blue600} />} />}
              title={L('Geplante Zeit (in der Zukunft)', 'Planned entry (in the future)')}
              subtitle={L(
                'Als Voranmeldung speichern — später als tatsächlich markieren',
                'Store as pre-announcement — mark as actual later',
              )}
              value={isPlanned}
              onValueChange={setIsPlanned}
            />

            {/* Betriebsstellen + Gastfahrt */}
            <View style={{ gap: 12 }}>
              <View>
                <MicroLabel color={C.slate500}>{L('Start- & Zielort', 'Start & Destination')}</MicroLabel>
                <MicroLabel style={{ marginTop: 4, fontWeight: '600', letterSpacing: 1 }}>
                  {L('Betriebsstellen · Fahrtart', 'Operational Locations · Travel Mode')}
                </MicroLabel>
              </View>
              <OperationalLocationPicker
                value={startLocationId}
                onChange={setStartLocationId}
                excludeId={destinationLocationId || null}
                label={L('Startort (Betriebsstelle)', 'Start (operational location)')}
              />
              <View style={{ alignItems: 'center' }}>
                <ArrowDown size={16} color={C.slate300} />
              </View>
              <OperationalLocationPicker
                value={destinationLocationId}
                onChange={setDestinationLocationId}
                excludeId={startLocationId || null}
                label={L('Zielort (Betriebsstelle)', 'Destination (operational location)')}
              />
              <ToggleCard
                icon={<IconTile icon={<UsersIcon size={18} color={C.blue600} />} />}
                title={L('Gastfahrt', 'Passenger Travel (Gastfahrt)')}
                subtitle={L('Mitarbeiter reist als Beifahrer (kein aktives Fahren)', 'Employee travels as passenger (not driving)')}
                value={isGastfahrt}
                onValueChange={setIsGastfahrt}
              />
            </View>

            {/* Footer — same order as the web form's sticky footer */}
            <View style={{ borderTopWidth: 1, borderTopColor: C.gray100, paddingTop: 16, gap: 12 }}>
              {requireReason ? (
                <FormField
                  label={L('Änderungsgrund (wird protokolliert) *', 'Reason for change (logged) *')}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={L('z. B. Korrektur nach Rücksprache mit dem Mitarbeiter', 'e.g. corrected after talking to the employee')}
                />
              ) : null}

              {isManagerial && !initial && !isPlanned ? (
                <ToggleCard
                  tone="emerald"
                  icon={<ShieldCheck size={16} color={C.emerald800} />}
                  title={L('Direkt freigeben', 'Approve right away')}
                  value={approveNow}
                  onValueChange={setApproveNow}
                  activeColor={C.emerald600}
                />
              ) : null}

              {overlaps && overlaps.length > 0 ? (
                <View style={{ borderRadius: 12, borderWidth: 1, borderColor: C.amber200, backgroundColor: C.amber50, padding: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AlertTriangle size={16} color={C.amber800} />
                    <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '900', color: C.amber800 }}>{L('Mögliche Doppelerfassung', 'Possible duplicate')}</Text>
                  </View>
                  {overlaps.map((o) => (
                    <Text key={o.id} style={{ fontSize: 12, color: C.amber900, marginTop: 4 }}>
                      {formatDateDE(o.date)} · {formatShiftRange(o.start_time, o.end_time, locale)} · {formatHours(o.net_hours, locale)} {hr}
                    </Text>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                    <Pressable onPress={() => setOverlaps(null)} style={{ flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.amber200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: C.amber800 }}>{L('Abbrechen', 'Cancel')}</Text>
                    </Pressable>
                    <Pressable onPress={() => submit(true)} style={{ flex: 1, height: 40, borderRadius: 10, backgroundColor: C.amber600, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>{L('Trotzdem speichern', 'Save anyway')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {formError ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <AlertTriangle size={16} color={C.red600} />
                  <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '600', color: C.red600, flex: 1 }}>{formError}</Text>
                </View>
              ) : null}

              <Button
                label={saving ? t('common.loading') : initial ? L('Änderung speichern', 'Save changes') : L('Zeiteintrag speichern', 'Save time entry')}
                onPress={() => submit(false)}
                loading={saving}
                disabled={!!formError}
                size="lg"
                leftIcon={initial ? <Save size={18} color="#FFFFFF" /> : undefined}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

/** Multi-line field with the same look as FormField (web Textarea `min-h-32`). */
function TextArea({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  icon?: React.ReactNode
}) {
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginLeft: 4, marginBottom: 6, color: '#6B7280' }}>
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          backgroundColor: '#F9FAFB',
          borderWidth: 2,
          borderColor: C.slate100,
          borderRadius: 16,
          minHeight: 112,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        {icon ? <View style={{ marginRight: 12, marginTop: 2 }}>{icon}</View> : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          multiline
          textAlignVertical="top"
          style={{ flex: 1, minHeight: 88, fontSize: 15, fontWeight: '600', color: '#111827', paddingTop: 8 }}
        />
      </View>
    </View>
  )
}
