/**
 * Sonderzahlung anlegen / bearbeiten (Kundenfeedback Punkt 6) — phone
 * replica of the webapp's components/shared/SpecialPaymentForm: same
 * field order, labels, checks and summary line —
 *
 *   Mitarbeiter * → Art → Betrag (€) * → Bezeichnung / Anlass * →
 *   Abrechnung * (einmalig / monatlich / anteilig + month pickers) →
 *   Bemerkung zur Vereinbarung → Abbrechen | Speichern
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { X, Euro, Save, AlertTriangle, User, Gift, FileText, ChevronDown, ChevronUp, Check } from 'lucide-react-native'

import { MonthStepper } from '@/components/reports/MonthStepper'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { HolidayBonus, HolidayBonusType, SpecialPaymentDistribution } from '@/lib/types'
import type { SpecialPaymentInput } from '@/hooks/useHolidayBonus'
import { DISTRIBUTIONS, SPECIAL_PAYMENT_TYPES, monthsInPeriod, specialPaymentTypeLabel } from '@/lib/special-payments'
import { formatEuro } from '@/lib/time/format'

interface Props {
  open: boolean
  initial?: HolidayBonus | null
  onClose: () => void
  onSubmit: (data: SpecialPaymentInput) => Promise<boolean>
}

const thisMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthOf = (date?: string | null) => (date ? date.slice(0, 7) : '')
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)
const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}

const FIELD = {
  height: 48,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#F3F4F6',
  backgroundColor: '#F9FAFB',
  paddingHorizontal: 16,
  fontSize: 15,
  fontWeight: '700' as const,
  color: '#111827',
}

function FieldLabel({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      {icon ? <View style={{ marginRight: 6 }}>{icon}</View> : null}
      <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#9CA3AF' }}>
        {text}
      </Text>
    </View>
  )
}

export function HolidayBonusSheet({ open, initial, onClose, onSubmit }: Props) {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile } = useUser()

  const [employees, setEmployees] = useState<{ id: string; full_name: string | null }[]>([])
  const [employeesLoading, setEmployeesLoading] = useState(false)
  const [employeeListOpen, setEmployeeListOpen] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [bonusType, setBonusType] = useState<HolidayBonusType>('holiday_pay')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [distribution, setDistribution] = useState<SpecialPaymentDistribution>('once')
  const [billingMonth, setBillingMonth] = useState(thisMonth())
  const [fromMonth, setFromMonth] = useState(thisMonth())
  const [toMonth, setToMonth] = useState(thisMonth())
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmployeeId(initial?.employee_id ?? '')
    setBonusType(initial?.bonus_type ?? 'holiday_pay')
    setTitle(initial?.title ?? (initial ? '' : specialPaymentTypeLabel('holiday_pay', 'de')))
    setAmount(initial ? String(initial.amount).replace('.', ',') : '')
    setDistribution(initial?.distribution ?? 'once')
    setBillingMonth(monthOf(initial?.billing_month) || monthOf(initial?.created_at) || thisMonth())
    setFromMonth(monthOf(initial?.period_start) || thisMonth())
    setToMonth(monthOf(initial?.period_end) || thisMonth())
    setNotes(initial?.notes ?? '')
    setEmployeeListOpen(false)
  }, [open, initial])

  // Web: every active profile of the organisation (plus the current
  // recipient when editing an inactive one).
  useEffect(() => {
    if (!open || !profile?.organization_id) return
    let alive = true
    setEmployeesLoading(true)
    getSupabase()
      .from('profiles')
      .select('id, full_name, is_active')
      .eq('organization_id', profile.organization_id)
      .order('full_name')
      .then(({ data }: { data: Array<{ id: string; full_name: string | null; is_active: boolean | null }> | null }) => {
        if (!alive) return
        setEmployees((data ?? []).filter((p) => p.is_active !== false || p.id === initial?.employee_id))
        setEmployeesLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, profile?.organization_id, initial?.employee_id])

  const value = Number(amount.replace(/\./g, '').replace(',', '.'))
  const periodOk = isMonth(fromMonth) && isMonth(toMonth) && toMonth >= fromMonth
  const months = distribution === 'once' ? 1 : periodOk ? monthsInPeriod(fromMonth, toMonth) : 0

  const error = useMemo(() => {
    if (!employeeId) return L('Bitte einen Mitarbeiter auswählen.', 'Please select an employee.')
    if (!title.trim()) return L('Bitte eine Bezeichnung angeben.', 'Please enter a title.')
    if (!Number.isFinite(value) || value <= 0) return L('Bitte einen Betrag größer 0 eingeben.', 'Please enter an amount above 0.')
    if (distribution === 'once' && !isMonth(billingMonth)) return L('Bitte den Abrechnungsmonat wählen.', 'Please choose the billing month.')
    if (distribution !== 'once' && !periodOk) return L('Bitte einen gültigen Zeitraum wählen (bis ≥ von).', 'Please choose a valid period (to ≥ from).')
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, title, value, distribution, billingMonth, periodOk, locale])

  const pickType = (next: HolidayBonusType) => {
    // Keep a hand-written title; replace the auto-filled default.
    if (!title.trim() || title === specialPaymentTypeLabel(bonusType, 'de')) setTitle(specialPaymentTypeLabel(next, 'de'))
    setBonusType(next)
  }

  const submit = async () => {
    if (error) return
    setSaving(true)
    const ok = await onSubmit({
      employee_id: employeeId,
      bonus_type: bonusType,
      title: title.trim() || specialPaymentTypeLabel(bonusType, 'de'),
      amount: Math.round(value * 100) / 100,
      distribution,
      billing_month: distribution === 'once' ? `${billingMonth}-01` : null,
      period_start: distribution === 'once' ? null : `${fromMonth}-01`,
      period_end: distribution === 'once' ? null : lastDay(toMonth),
      notes: notes.trim() || null,
    })
    setSaving(false)
    if (ok) onClose()
  }

  const selectedName =
    employees.find((e) => e.id === employeeId)?.full_name ??
    (employeeId && initial?.employee_id === employeeId ? initial?.employee?.full_name : null) ??
    null

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 20,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#F3F4F6',
          }}
        >
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', flex: 1 }}>
            {initial ? L('Sonderzahlung bearbeiten', 'Edit special payment') : L('Neue Sonderzahlung', 'New special payment')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={L('Schließen', 'Close')}>
            <X size={22} color="#9CA3AF" />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }} keyboardShouldPersistTaps="handled">
          {/* Mitarbeiter * */}
          <View>
            <FieldLabel icon={<User size={12} color="#9CA3AF" />} text={`${L('Mitarbeiter', 'Employee')} *`} />
            <Pressable onPress={() => setEmployeeListOpen((v) => !v)}>
              <View style={{ ...FIELD, flexDirection: 'row', alignItems: 'center' }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: '700', color: selectedName ? '#111827' : '#9CA3AF' }}>
                  {selectedName ?? L('Mitarbeiter auswählen…', 'Select an employee…')}
                </Text>
                {employeeListOpen ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
              </View>
            </Pressable>
            {employeeListOpen ? (
              <View style={{ marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' }}>
                {employeesLoading ? (
                  <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#0064E0" />
                  </View>
                ) : employees.length === 0 ? (
                  <Text style={{ padding: 14, fontSize: 13, color: '#9CA3AF' }}>
                    {L('Keine Mitarbeiter gefunden.', 'No employees found.')}
                  </Text>
                ) : (
                  employees.map((emp, i) => {
                    const active = emp.id === employeeId
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => {
                          setEmployeeId(emp.id)
                          setEmployeeListOpen(false)
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderTopWidth: i > 0 ? 1 : 0,
                          borderTopColor: '#F3F4F6',
                          backgroundColor: active ? '#EFF6FF' : '#FFFFFF',
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '500', color: active ? '#0064E0' : '#374151' }}>
                          {emp.full_name ?? '—'}
                        </Text>
                        {active ? <Check size={16} color="#0064E0" /> : null}
                      </Pressable>
                    )
                  })
                )}
              </View>
            ) : null}
          </View>

          {/* Art */}
          <View>
            <FieldLabel icon={<Gift size={12} color="#9CA3AF" />} text={L('Art', 'Type')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(Object.keys(SPECIAL_PAYMENT_TYPES) as HolidayBonusType[]).map((bt) => {
                const active = bonusType === bt
                return (
                  <Pressable
                    key={bt}
                    onPress={() => pickType(bt)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 9,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? '#0064E0' : '#F3F4F6',
                      backgroundColor: active ? '#EFF6FF' : '#F9FAFB',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#0064E0' : '#4B5563' }}>
                      {specialPaymentTypeLabel(bt, locale)}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* Betrag (€) * */}
          <View>
            <FieldLabel icon={<Euro size={12} color="#9CA3AF" />} text={`${L('Betrag (€)', 'Amount (€)')} *`} />
            <TextInput
              value={amount}
              onChangeText={(v) => setAmount(v.replace(/[^\d.,]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#9CA3AF"
              style={FIELD}
            />
          </View>

          {/* Bezeichnung / Anlass * */}
          <View>
            <FieldLabel icon={<FileText size={12} color="#9CA3AF" />} text={`${L('Bezeichnung / Anlass', 'Title / occasion')} *`} />
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder={L('z. B. Urlaubsgeld 2026, Prämie Projekt X', 'e.g. holiday pay 2026, project bonus')}
              placeholderTextColor="#9CA3AF"
              style={FIELD}
            />
          </View>

          {/* Abrechnung * */}
          <View>
            <FieldLabel text={`${L('Abrechnung', 'Billing')} *`} />
            <View style={{ gap: 8 }}>
              {(Object.keys(DISTRIBUTIONS) as SpecialPaymentDistribution[]).map((d) => {
                const active = distribution === d
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDistribution(d)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? '#0064E0' : '#F3F4F6',
                      backgroundColor: active ? '#EFF6FF' : '#F9FAFB',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#0064E0' : '#4B5563' }}>
                      {locale === 'de' ? DISTRIBUTIONS[d].de : DISTRIBUTIONS[d].en}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
            <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>
              {locale === 'de' ? DISTRIBUTIONS[distribution].hintDe : DISTRIBUTIONS[distribution].hintEn}
            </Text>

            <View style={{ marginTop: 12 }}>
              {distribution === 'once' ? (
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 }}>
                    {L('Abrechnungsmonat', 'Billing month')}
                  </Text>
                  <MonthStepper value={billingMonth} onChange={setBillingMonth} />
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 }}>
                      {L('Gültig von', 'Valid from')}
                    </Text>
                    <MonthStepper value={fromMonth} onChange={setFromMonth} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280', marginBottom: 6 }}>{L('bis', 'to')}</Text>
                    <MonthStepper value={toMonth} onChange={setToMonth} />
                  </View>
                </View>
              )}
            </View>

            {distribution !== 'once' && months > 0 && Number.isFinite(value) && value > 0 ? (
              <View
                style={{
                  marginTop: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#DBEAFE',
                  backgroundColor: '#F5F9FF',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E40AF' }}>
                  {distribution === 'monthly'
                    ? L(
                        `${months} Monate × ${formatEuro(value, 'de')} = ${formatEuro(value * months, 'de')} insgesamt`,
                        `${months} months × ${formatEuro(value, 'en')} = ${formatEuro(value * months, 'en')} in total`,
                      )
                    : L(
                        `${formatEuro(value, 'de')} verteilt auf ${months} Monate ≈ ${formatEuro(value / months, 'de')} je Monat`,
                        `${formatEuro(value, 'en')} split over ${months} months ≈ ${formatEuro(value / months, 'en')} per month`,
                      )}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Bemerkung zur Vereinbarung */}
          <View>
            <FieldLabel text={L('Bemerkung zur Vereinbarung', 'Note on the agreement')} />
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={L('z. B. laut Vereinbarung vom 01.06.2026', 'e.g. as agreed on 1 June 2026')}
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
              style={{ ...FIELD, height: undefined, minHeight: 88, paddingTop: 14, paddingBottom: 14, fontSize: 14, fontWeight: '500' }}
            />
          </View>

          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <AlertTriangle size={16} color="#DC2626" />
              <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#DC2626', flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable
              onPress={onClose}
              style={{ flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#6B7280' }}>{L('Abbrechen', 'Cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!!error || saving}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                backgroundColor: '#0064E0',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: error || saving ? 0.5 : 1,
              }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Save size={16} color="#FFFFFF" />}
              <Text numberOfLines={1} style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>
                {saving ? t('common.loading') : initial ? L('Änderung speichern', 'Save changes') : L('Sonderzahlung anlegen', 'Add special payment')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function bonusTypeLabel(t: HolidayBonusType, locale: string): string {
  return specialPaymentTypeLabel(t, locale === 'de' ? 'de' : 'en')
}
