/**
 * Modal sheet for employees to submit a per-diem claim. Mirrors the
 * webapp's PerDiemForm: travel date(s), country, rate, computed amount,
 * notes. We default to the German domestic partial rate (€14) but let
 * the user override.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable } from 'react-native'
import { X, Euro } from 'lucide-react-native'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { Button } from './Button'
import { FormField } from './FormField'
import { toast } from './Toast'
import { useTranslation } from '@/lib/i18n'
import type { PerDiem } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (payload: Partial<PerDiem>) => Promise<PerDiem>
}

const DEFAULT_RATE = 14

export function PerDiemSheet({ open, onClose, onSubmit }: Props) {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [country, setCountry] = useState('Germany (Domestic)')
  const [rate, setRate] = useState(String(DEFAULT_RATE))
  const [task, setTask] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setStartDate(today)
    setEndDate(today)
    setCountry('Germany (Domestic)')
    setRate(String(DEFAULT_RATE))
    setTask('')
    setNotes('')
  }, [open])

  const numDays = useMemo(() => {
    try {
      const diff = differenceInCalendarDays(parseISO(endDate), parseISO(startDate))
      return diff < 0 ? 1 : diff + 1
    } catch { return 1 }
  }, [startDate, endDate])

  const total = numDays * (Number(rate) || 0)

  const submit = async () => {
    if (!startDate || !endDate) {
      toast.error(L('Datum ist erforderlich.', 'Date is required.'))
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        date: startDate,
        start_date: startDate,
        end_date: endDate,
        num_days: numDays,
        country,
        rate: Number(rate) || 0,
        amount: total,
        task: task || null,
        notes: notes || null,
      })
      toast.success(L('Antrag eingereicht', 'Claim submitted'))
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white dark:bg-slate-900">
        <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-slate-800">
          <Pressable onPress={onClose}><X size={24} color="#0064E0" /></Pressable>
          <Text className="text-[16px] font-black text-gray-900 dark:text-white">
            {L('Spesen einreichen', 'Submit per-diem')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View className="space-y-4">
            <View className="flex-row gap-3">
              <View className="flex-1"><FormField label={L('Von', 'From')} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" /></View>
              <View className="flex-1"><FormField label={L('Bis', 'To')} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" /></View>
            </View>

            <FormField label={L('Land / Region', 'Country / Region')} value={country} onChangeText={setCountry} />

            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField
                  label={L('Tagessatz (€)', 'Daily rate (€)')}
                  value={rate}
                  onChangeText={(v) => setRate(v.replace(/[^\d.]/g, ''))}
                  keyboardType="decimal-pad"
                  leftIcon={<Euro size={18} color="#0064E0" />}
                />
              </View>
              <View className="flex-1 bg-brand/5 dark:bg-brand/15 border-2 border-brand/20 rounded-2xl p-4">
                <Text className="text-[10px] font-black uppercase tracking-widest text-brand">
                  {L('Gesamtbetrag', 'Total')}
                </Text>
                <Text className="text-[20px] font-black text-brand mt-1">€{total.toFixed(2)}</Text>
                <Text className="text-[11px] text-brand/70 mt-0.5">
                  {numDays} {L('Tag(e)', 'day(s)')}
                </Text>
              </View>
            </View>

            <FormField label={L('Tätigkeit', 'Task')} value={task} onChangeText={setTask} placeholder={L('z. B. Kundeneinsatz', 'e.g. customer visit')} />
            <FormField label={t('times.notes')} value={notes} onChangeText={setNotes} multiline />

            <Button label={saving ? t('common.loading') : t('auth.continue')} onPress={submit} loading={saving} size="lg" />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
