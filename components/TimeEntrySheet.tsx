/**
 * Modal sheet for creating/editing a single time entry. Mirrors the
 * webapp's TimeEntryForm full set of fields:
 *   - date (YYYY-MM-DD)
 *   - start / end times (HH:mm) with overnight detection
 *   - break minutes
 *   - employee (admin/dispatcher only — entry on behalf of someone else)
 *   - customer (chip-row picker)
 *   - start / destination Betriebsstellen
 *   - location, notes
 *   - overnight stay + hotel address  (auto-triggers full Spesen rate)
 *   - Gastfahrt (passenger travel) switch  (separates hours in reports)
 *   - is_planned flag — mark a future-dated entry as planned, not real
 *
 * Live preview shows net hours and the meal-allowance amount the entry
 * will carry on save (computed via the ported spesen engine).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, Switch, Platform } from 'react-native'
import { X, Trash2, Moon, Users as UsersIcon } from 'lucide-react-native'
import { format } from 'date-fns'

import { Button } from './Button'
import { FormField } from './FormField'
import { toast } from './Toast'
import { CustomerPicker } from './forms/CustomerPicker'
import { EmployeePicker } from './forms/EmployeePicker'
import { OperationalLocationPicker } from './forms/OperationalLocationPicker'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { calculateShiftTimes } from '@/lib/time/shift-hours'
import { calculateSpesen } from '@/lib/spesen'
import type { TimeEntry } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  initial: TimeEntry | null
  onCreate: (payload: Partial<TimeEntry>) => Promise<TimeEntry>
  onUpdate: (id: string, patch: Partial<TimeEntry>) => Promise<TimeEntry>
  onDelete: (id: string) => Promise<void>
}

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
  const { isAdmin, isDispatcher } = useUser()
  const isManagerial = isAdmin || isDispatcher
  const canDelete = isManagerial

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
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
  const [saving, setSaving] = useState(false)

  // Reset / hydrate fields whenever the modal opens with a different entry.
  useEffect(() => {
    if (!open) return
    if (initial) {
      setDate(initial.date.slice(0, 10))
      setStartTime(format(new Date(initial.start_time), 'HH:mm'))
      setEndTime(initial.end_time ? format(new Date(initial.end_time), 'HH:mm') : '16:00')
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
      setDate(format(new Date(), 'yyyy-MM-dd'))
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
  }, [open, initial])

  const shift = useMemo(
    () => calculateShiftTimes(date, startTime, endTime, Number(breakMinutes) || 0),
    [date, startTime, endTime, breakMinutes],
  )

  // Live meal-allowance preview. Uses default org rates (14€/28€) —
  // org-configurable rates will be wired when the company settings
  // screen ships (priority #21).
  const mealAllowance = useMemo(
    () => calculateSpesen(shift.netHours, overnight),
    [shift.netHours, overnight],
  )

  const submit = async () => {
    if (!date || !startTime || !endTime) {
      toast.error(L('Datum und Zeiten sind erforderlich.', 'Date and times are required.'))
      return
    }
    if (overnight && !hotelAddress.trim()) {
      toast.error(L('Bitte Hoteladresse angeben.', 'Hotel address required for overnight stay.'))
      return
    }
    if (isManagerial && !initial && !employeeId) {
      toast.error(
        L(
          'Bitte einen Mitarbeiter auswählen.',
          'Pick the employee this entry is for.',
        ),
      )
      return
    }
    setSaving(true)
    try {
      const payload: Partial<TimeEntry> = {
        date,
        start_time: shift.startISO,
        end_time: shift.endISO,
        break_minutes: Number(breakMinutes) || 0,
        net_hours: shift.netHours,
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
      if (initial) {
        await onUpdate(initial.id, payload)
      } else {
        await onCreate(payload)
      }
      toast.success(t('times.saved'))
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
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

  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white dark:bg-slate-900">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
          <Pressable onPress={onClose}>
            <X size={24} color="#0064E0" />
          </Pressable>
          <Text className="text-[16px] font-black text-gray-900 dark:text-white">
            {initial ? t('times.edit') : t('times.add')}
          </Text>
          {canDelete && initial ? (
            <Pressable onPress={confirmDelete}>
              <Trash2 size={20} color="#DC2626" />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View className="space-y-4">
            {/* Admin/Dispatcher: who is this for? (only on new entries) */}
            {isManagerial && !initial && (
              <View>
                <View className="flex-row items-center mb-1.5">
                  <UsersIcon size={14} color="#6B7280" />
                  <Text className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 ml-1.5">
                    {L('Für Mitarbeiter eintragen', 'Logging on behalf of')}
                  </Text>
                </View>
                <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} />
              </View>
            )}

            <FormField
              label={t('times.date')}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
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

            <FormField
              label={t('times.break')}
              value={breakMinutes}
              onChangeText={(v) => setBreakMinutes(v.replace(/\D/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
            />

            {/* Overnight + hotel — order matches webapp UX (overnight first,
                hotel revealed below). */}
            <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl p-4 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Moon size={20} color="#0064E0" style={{ marginRight: 10 }} />
                <View>
                  <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                    {t('times.overnight')}
                  </Text>
                  <Text className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-0.5">
                    {L('Voller Spesensatz', 'Full per-diem')}
                  </Text>
                </View>
              </View>
              <Switch
                value={overnight}
                onValueChange={setOvernight}
                trackColor={{ false: '#D1D5DB', true: '#0064E0' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>
            {overnight && (
              <FormField
                label={t('times.hotel')}
                value={hotelAddress}
                onChangeText={setHotelAddress}
                placeholder={L('Hotel oder Unterkunft', 'Hotel or lodging')}
              />
            )}

            {/* Gastfahrt switch */}
            <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl p-4 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                  {L('Gastfahrt (Mitfahrer)', 'Guest ride (passenger)')}
                </Text>
                <Text className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-0.5">
                  {L('Stunden separat ausgewiesen', 'Hours tracked separately')}
                </Text>
              </View>
              <Switch
                value={isGastfahrt}
                onValueChange={setIsGastfahrt}
                trackColor={{ false: '#D1D5DB', true: '#0064E0' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>

            {/* Planned vs actual */}
            <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl p-4 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                  {L('Geplant (nicht geleistet)', 'Planned (not yet worked)')}
                </Text>
                <Text className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-slate-500 mt-0.5">
                  {L(
                    'Für zukünftige Schichten markieren',
                    'Mark future shifts as planned',
                  )}
                </Text>
              </View>
              <Switch
                value={isPlanned}
                onValueChange={setIsPlanned}
                trackColor={{ false: '#D1D5DB', true: '#0064E0' }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
              />
            </View>

            {/* Live preview (net hours + Spesen) */}
            <View className="bg-brand/5 dark:bg-brand/15 border border-brand/20 rounded-2xl p-4">
              <View className="flex-row justify-between items-end">
                <View>
                  <Text className="text-[10px] font-black uppercase tracking-widest text-brand">
                    {t('times.net_hours')}
                  </Text>
                  <Text className="text-[24px] font-black text-brand mt-1">
                    {shift.netHours.toFixed(2)} h
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-brand">
                    {L('Spesen', 'Per-diem')}
                  </Text>
                  <Text className="text-[22px] font-black text-brand mt-1">
                    {mealAllowance.toFixed(0)} €
                  </Text>
                </View>
              </View>
              {shift.isOvernight && (
                <Text className="text-[11px] font-bold text-brand mt-2">
                  {L('Schicht über Mitternacht', 'Crosses midnight')}
                </Text>
              )}
            </View>

            <CustomerPicker value={customerId} onChange={setCustomerId} />

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

            <FormField label={t('times.location')} value={location} onChangeText={setLocation} />
            <FormField
              label={t('times.notes')}
              value={notes}
              onChangeText={setNotes}
              multiline
            />

            <Button
              label={saving ? t('common.loading') : t('times.save')}
              onPress={submit}
              loading={saving}
              size="lg"
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
