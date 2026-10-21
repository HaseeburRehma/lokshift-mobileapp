/**
 * Umverteilung (Kundenfeedback Punkt 8) — mobile replica of the webapp's
 * components/plans/ReassignDialog.tsx. Shows old → new before saving,
 * warns about overlaps, absences, expired qualifications and shifts that
 * already started (those need an explicit "Trotzdem umverteilen"), and
 * offers the "notify both employees" switch.
 *
 * Used by the week grid (app/dashboard) and the plan detail screen.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { AlertTriangle, ArrowRight, BellRing, Lock, Search, X } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import type { Plan } from '@/lib/types'
import { describePlan } from '@/lib/plans/notify'
import { hasStarted, reassignWarnings, type ReassignWarning } from '@/lib/plans/week'
import { formatDateDE, formatShiftRange } from '@/lib/time/format'

export const UNASSIGNED = '__unassigned__'

export function warningText(w: ReassignWarning, locale: 'de' | 'en'): string {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  switch (w.kind) {
    case 'started':
      return L('Die Schicht hat bereits begonnen bzw. ist abgeschlossen. Umverteilen nur in Ausnahmefällen.', 'The shift has already started or finished. Reassign only in exceptional cases.')
    case 'overlap':
      return L(`Überschneidung mit einer anderen Schicht (${formatShiftRange(w.start_time, w.end_time, 'de')}).`, `Overlaps another shift (${formatShiftRange(w.start_time, w.end_time, 'en')}).`)
    case 'absence':
      return w.absence.kind === 'sick'
        ? L('Mitarbeiter ist an diesem Tag krank gemeldet.', 'Employee is on sick leave that day.')
        : L(`Mitarbeiter hat an diesem Tag Urlaub${w.absence.pending ? ' (beantragt)' : ''}.`, `Employee is on vacation that day${w.absence.pending ? ' (requested)' : ''}.`)
    case 'qualification_expired':
      return L(`${w.name} ist am ${formatDateDE(w.expires_at)} abgelaufen.`, `${w.name} expired on ${w.expires_at}.`)
    case 'fitness_missing':
      return L('Keine gültige Tauglichkeit hinterlegt.', 'No valid fitness certificate on file.')
  }
}

type WarningCtx = Parameters<typeof reassignWarnings>[2]

interface Props {
  visible: boolean
  plan: Plan | null
  /** Preselected target (drag & drop); null = unassigned, undefined = none. */
  initialTarget: string | null | undefined
  employees: { id: string; full_name: string; role: string }[]
  plans: Plan[]
  absences: WarningCtx['absences']
  qualifications: WarningCtx['qualifications']
  /** True while the employee list / warning context is still loading. */
  loading?: boolean
  onConfirm: (plan: Plan, target: string | null, notify: boolean) => Promise<boolean>
  onClose: () => void
}

export function ReassignSheet({
  visible,
  plan,
  initialTarget,
  employees,
  plans,
  absences,
  qualifications,
  loading,
  onConfirm,
  onClose,
}: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [target, setTarget] = useState<string>('')
  const [notify, setNotify] = useState(true)
  const [ackStarted, setAckStarted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible) return
    setTarget(initialTarget === null ? UNASSIGNED : initialTarget ?? '')
    setNotify(true)
    setAckStarted(false)
    setQuery('')
  }, [visible, initialTarget])

  const targetId = target === UNASSIGNED ? null : target || undefined
  const warnings: ReassignWarning[] = useMemo(() => {
    if (!plan) return []
    if (!targetId) return hasStarted(plan) ? [{ kind: 'started' }] : []
    return reassignWarnings(plan, targetId, { plans, absences, qualifications })
  }, [plan, targetId, plans, absences, qualifications])

  if (!plan) return null
  const name = (id: string | null) => (id ? employees.find((e) => e.id === id)?.full_name ?? '—' : L('Unbesetzt', 'Unassigned'))
  const started = warnings.some((w) => w.kind === 'started')
  const sameTarget = target !== '' && (targetId ?? null) === plan.employee_id
  const canSave = target !== '' && !sameTarget && (!started || ackStarted) && !saving
  const q = query.trim().toLowerCase()
  const options = employees.filter((e) => e.id !== plan.employee_id && (!q || e.full_name.toLowerCase().includes(q)))

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    await onConfirm(plan, targetId ?? null, notify)
    setSaving(false)
  }

  const option = (id: string, label: string, sub?: string, amber?: boolean) => {
    const on = target === id
    return (
      <Pressable key={id} onPress={() => setTarget(id)}>
        <View
          style={{
            paddingVertical: 11,
            paddingHorizontal: 10,
            borderBottomWidth: 1,
            borderColor: '#F1F5F9',
            backgroundColor: on ? '#EFF6FF' : 'transparent',
            borderRadius: on ? 10 : 0,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: on ? '900' : '700', color: on ? '#0064E0' : amber ? '#B45309' : '#0F172A' }} numberOfLines={1}>
            {label}
          </Text>
          {sub ? <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{sub}</Text> : null}
        </View>
      </Pressable>
    )
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '92%',
            alignSelf: 'center',
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: 20,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <Text style={{ fontSize: 22, fontWeight: '900', letterSpacing: -0.4, color: '#0F172A' }}>{L('Schicht umverteilen', 'Reassign shift')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: '#64748B', marginBottom: 14 }}>{describePlan(plan)}</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#94A3B8', textTransform: 'uppercase' }}>{L('Bisher', 'Current')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E293B', marginTop: 2 }} numberOfLines={1}>{name(plan.employee_id)}</Text>
            </View>
            <ArrowRight size={18} color="#94A3B8" />
            <View style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', padding: 12 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, color: '#3B82F6', textTransform: 'uppercase' }}>{L('Neu', 'New')}</Text>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#0064E0', marginTop: 2 }} numberOfLines={1}>
                {target === '' ? L('Mitarbeiter wählen', 'Choose employee') : name(targetId ?? null)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 10, height: 40, backgroundColor: '#FFFFFF', marginBottom: 6 }}>
            <Search size={14} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={L('Mitarbeiter suchen …', 'Search employee …')}
              placeholderTextColor="#94A3B8"
              style={{ flex: 1, marginLeft: 6, fontSize: 13, color: '#0F172A' }}
              autoCapitalize="none"
            />
          </View>
          <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
            {plan.employee_id ? option(UNASSIGNED, L('Unbesetzt', 'Unassigned'), L('Schicht ohne Mitarbeiter', 'Shift without employee'), true) : null}
            {loading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color="#0064E0" />
              </View>
            ) : (
              options.map((e) => option(e.id, e.full_name, e.role))
            )}
          </ScrollView>

          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 10 }}>
            {L(
              'Zeiten, Kunde, Betriebsstellen und weitere Angaben bleiben unverändert. Der neue Mitarbeiter muss die Schicht bestätigen.',
              'Times, customer, locations and other details stay unchanged. The new employee has to confirm the shift.',
            )}
          </Text>

          {warnings.length > 0 ? (
            <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB', padding: 12, gap: 6 }}>
              {warnings.map((w, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {w.kind === 'started' ? <Lock size={14} color="#78350F" style={{ marginTop: 2 }} /> : <AlertTriangle size={14} color="#78350F" style={{ marginTop: 2 }} />}
                  <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '600', color: '#78350F', flex: 1 }}>{warningText(w, locale)}</Text>
                </View>
              ))}
              {started ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#78350F' }}>{L('Trotzdem umverteilen', 'Reassign anyway')}</Text>
                  <Switch value={ackStarted} onValueChange={setAckStarted} trackColor={{ false: '#D1D5DB', true: '#D97706' }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <BellRing size={15} color="#94A3B8" />
              <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: '#334155', flex: 1 }}>
                {L('Beide Mitarbeiter per E-Mail und App benachrichtigen', 'Notify both employees by email and app')}
              </Text>
            </View>
            <Switch value={notify} onValueChange={setNotify} trackColor={{ false: '#D1D5DB', true: '#0064E0' }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Pressable onPress={onClose} style={{ flex: 1 }}>
              <View style={{ height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#475569' }}>{L('Abbrechen', 'Cancel')}</Text>
              </View>
            </Pressable>
            <Pressable onPress={save} disabled={!canSave} style={{ flex: 2 }}>
              <View style={{ height: 48, borderRadius: 14, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', opacity: canSave ? 1 : 0.45 }}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.4, color: '#FFFFFF' }}>{L('UMVERTEILUNG SPEICHERN', 'SAVE REASSIGNMENT')}</Text>
                )}
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
