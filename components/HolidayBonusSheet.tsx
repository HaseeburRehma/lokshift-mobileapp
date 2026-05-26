/**
 * Modal sheet — managerial users grant a holiday bonus.
 * Mirrors the webapp's HolidayBonusForm: employee picker, bonus_type
 * enum, amount, notes.
 */

import React, { useEffect, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable } from 'react-native'
import { X, Euro, Gift } from 'lucide-react-native'

import { Button } from './Button'
import { FormField } from './FormField'
import { toast } from './Toast'
import { EmployeePicker } from './forms/EmployeePicker'
import { useTranslation } from '@/lib/i18n'
import type { HolidayBonus, HolidayBonusType } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (payload: Partial<HolidayBonus>) => Promise<HolidayBonus>
}

const TYPE_LABELS: Record<HolidayBonusType, { de: string; en: string }> = {
  holiday_pay: { de: 'Urlaubsgeld',     en: 'Holiday pay' },
  christmas:   { de: 'Weihnachtsgeld',  en: 'Christmas bonus' },
  vacation:    { de: 'Urlaubsbonus',    en: 'Vacation bonus' },
  performance: { de: 'Leistungsbonus',  en: 'Performance bonus' },
  other:       { de: 'Sonstiges',       en: 'Other' },
}

export function HolidayBonusSheet({ open, onClose, onSubmit }: Props) {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [employeeId, setEmployeeId] = useState('')
  const [bonusType, setBonusType] = useState<HolidayBonusType>('holiday_pay')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmployeeId('')
    setBonusType('holiday_pay')
    setAmount('')
    setNotes('')
  }, [open])

  const submit = async () => {
    if (!employeeId) {
      toast.error(L('Bitte einen Mitarbeiter auswählen.', 'Pick an employee.'))
      return
    }
    const amt = Number(amount)
    if (!amt || amt <= 0) {
      toast.error(L('Betrag eingeben.', 'Enter an amount.'))
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        employee_id: employeeId,
        bonus_type: bonusType,
        amount: amt,
        notes: notes || null,
      })
      toast.success(L('Bonus vergeben', 'Bonus granted'))
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
            {L('Bonus vergeben', 'Grant bonus')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View className="space-y-4">
            <EmployeePicker mode="single" value={employeeId} onChange={setEmployeeId} />

            <View>
              <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-1.5">
                {L('Art des Bonus', 'Bonus type')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {(Object.keys(TYPE_LABELS) as HolidayBonusType[]).map((bt) => (
                  <Pressable
                    key={bt}
                    onPress={() => setBonusType(bt)}
                    className={`px-4 py-2 rounded-full border-2 ${bonusType === bt ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
                  >
                    <Text className={`text-[12px] font-bold ${bonusType === bt ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
                      {locale === 'de' ? TYPE_LABELS[bt].de : TYPE_LABELS[bt].en}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <FormField
              label={L('Bonusbetrag (€)', 'Bonus amount (€)')}
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0.00"
              leftIcon={<Euro size={18} color="#0064E0" />}
            />

            <FormField label={L('Beschreibung', 'Description')} value={notes} onChangeText={setNotes} multiline />

            <Button
              label={saving ? t('common.loading') : L('Bonus vergeben', 'Grant bonus')}
              onPress={submit}
              loading={saving}
              size="lg"
              leftIcon={<Gift size={18} color="#fff" />}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function bonusTypeLabel(t: HolidayBonusType, locale: string): string {
  const entry = TYPE_LABELS[t] ?? TYPE_LABELS.other
  return locale === 'de' ? entry.de : entry.en
}
