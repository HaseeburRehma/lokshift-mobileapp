/**
 * Korrektur beantragen (Kundenfeedback Punkt 3) — after submitting, an
 * employee proposes new values plus a short reason; the current values
 * stay valid until dispatch/admin approves.
 *
 * Layout mirrors the webapp's CorrectionRequestDialog: title +
 * "Aktuell gültig …" description, Datum / Beginn · Ende / Pause ·
 * Übernachtung / Notiz / Begründung *, "Beantragt" box, Abbrechen ·
 * Antrag senden.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, Switch, Platform, TextInput } from 'react-native'
import { AlertTriangle, Send } from 'lucide-react-native'

import { C, SheetHeader } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useOrgRules } from '@/hooks/useOrgRules'
import type { CorrectionValues, TimeEntry } from '@/lib/types'
import { calculateShiftTimes, isValidDate, isValidTime, localTimeKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatHours, formatShiftRange } from '@/lib/time/format'
import { calculateSpesen } from '@/lib/spesen'

interface Props {
  entry: TimeEntry | null
  open: boolean
  onClose: () => void
  onSubmit: (entry: TimeEntry, proposed: CorrectionValues, reason: string) => Promise<boolean>
}

const hhmm = (iso?: string | null) => (iso ? localTimeKey(new Date(iso)) : '')

const labelStyle = { fontSize: 12, fontWeight: '900' as const, letterSpacing: 1.4, textTransform: 'uppercase' as const, color: C.slate400 }
const inputStyle = {
  marginTop: 4,
  height: 44,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: C.slate200,
  backgroundColor: '#FFFFFF',
  paddingHorizontal: 12,
  fontSize: 15,
  fontWeight: '600' as const,
  color: C.slate900,
}

/** `grow` = takes an equal share of a row (web `grid-cols-2`). */
function Field({ label, grow, style: _style, ...props }: React.ComponentProps<typeof TextInput> & { label: string; grow?: boolean }) {
  return (
    <View style={grow ? { flex: 1 } : undefined}>
      <Text style={labelStyle}>{label}</Text>
      <TextInput {...props} placeholderTextColor={C.slate400} style={inputStyle} />
    </View>
  )
}

export function CorrectionRequestSheet({ entry, open, onClose, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { spesenRates } = useOrgRules()
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [overnight, setOvernight] = useState(false)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!entry || !open) return
    setDate(entry.date)
    setStartTime(hhmm(entry.start_time))
    setEndTime(hhmm(entry.end_time))
    setBreakMinutes(String(entry.break_minutes ?? 0))
    setOvernight(!!entry.overnight_stay)
    setNotes(entry.notes ?? '')
    setReason('')
  }, [entry, open])

  const brk = Math.max(0, Number(breakMinutes) || 0)
  const shift = useMemo(() => calculateShiftTimes(date, startTime, endTime, brk), [date, startTime, endTime, brk])
  const changed =
    !!entry &&
    (date !== entry.date ||
      startTime !== hhmm(entry.start_time) ||
      endTime !== hhmm(entry.end_time) ||
      brk !== (entry.break_minutes ?? 0) ||
      overnight !== !!entry.overnight_stay ||
      (notes || '') !== (entry.notes || ''))

  let error: string | null = null
  if (!isValidDate(date) || !isValidTime(startTime) || !isValidTime(endTime)) error = L('Bitte Datum, Beginn und Ende vollständig angeben.', 'Please fill in date, start and end.')
  else if (shift.netHours <= 0) error = L('Die beantragte Schicht ergibt 0 Stunden.', 'The requested shift results in 0 hours.')
  else if (!changed) error = L('Bitte mindestens einen Wert ändern.', 'Please change at least one value.')
  else if (reason.trim().length < 3) error = L('Bitte eine kurze Begründung angeben.', 'Please give a short reason.')

  const submit = async () => {
    if (!entry || error) return
    setSending(true)
    const ok = await onSubmit(
      entry,
      {
        date,
        start_time: shift.startISO,
        end_time: shift.endISO,
        break_minutes: brk,
        overnight_stay: overnight,
        meal_allowance: calculateSpesen(shift.netHours, overnight, spesenRates),
        notes: notes.trim() || null,
      },
      reason,
    )
    setSending(false)
    if (ok) onClose()
  }

  const sendDisabled = !!error || sending

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SheetHeader title={L('Korrektur beantragen', 'Request correction')} onClose={onClose} closeLabel={L('Schließen', 'Close')} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 24, fontWeight: '900', color: C.slate900, letterSpacing: -0.5 }}>{L('Korrektur beantragen', 'Request correction')}</Text>
          {entry ? (
            <Text style={{ marginTop: 6, fontSize: 14, color: C.slate500, lineHeight: 20 }}>
              {L(
                `Aktuell gültig: ${formatDateDE(entry.date)}, ${formatShiftRange(entry.start_time, entry.end_time, 'de')}, ${formatHours(entry.net_hours, 'de')} Std. Die bisherigen Werte bleiben bis zur Freigabe durch Disposition oder Admin maßgeblich.`,
                `Currently valid: ${entry.date}, ${formatShiftRange(entry.start_time, entry.end_time, 'en')}, ${formatHours(entry.net_hours, 'en')} h. The current values stay valid until dispatch or admin approves.`,
              )}
            </Text>
          ) : null}

          <View style={{ marginTop: 16, gap: 12 }}>
            <Field label={L('Datum', 'Date')} value={date} onChangeText={setDate} placeholder="JJJJ-MM-TT" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Field grow label={L('Beginn', 'Start')} value={startTime} onChangeText={setStartTime} placeholder="10:00" keyboardType="numbers-and-punctuation" />
              <Field grow label={L('Ende', 'End')} value={endTime} onChangeText={setEndTime} placeholder="18:00" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
              <Field
                grow
                label={L('Pause (Min.)', 'Break (min)')}
                value={breakMinutes}
                onChangeText={(v) => setBreakMinutes(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="0"
              />
              <View style={{ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate700 }}>{L('Übernachtung', 'Overnight')}</Text>
                <Switch value={overnight} onValueChange={setOvernight} trackColor={{ false: '#D1D5DB', true: C.brand }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
              </View>
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={L('Notiz (optional)', 'Note (optional)')}
              placeholderTextColor={C.slate400}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 64, borderWidth: 1, borderColor: C.slate200, borderRadius: 12, padding: 12, fontSize: 14, color: C.slate900, backgroundColor: '#FFFFFF' }}
            />
            <View>
              <Text style={labelStyle}>{`${L('Begründung', 'Reason')} *`}</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                textAlignVertical="top"
                placeholder={L('z. B. Zug hatte 45 Minuten Verspätung', 'e.g. train was 45 minutes late')}
                placeholderTextColor={C.slate400}
                style={{ marginTop: 4, minHeight: 72, borderWidth: 1, borderColor: C.slate200, borderRadius: 12, padding: 12, fontSize: 14, color: C.slate900, backgroundColor: '#FFFFFF' }}
              />
            </View>
          </View>

          <View style={{ marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: C.blue100, backgroundColor: 'rgba(239,246,255,0.6)', paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate700 }}>
              {L('Beantragt', 'Requested')}: {formatHours(shift.netHours, locale)} {L('Std.', 'h')}
              {shift.isOvernight ? ` · ${L('Ende am Folgetag', 'ends next day')}` : ''}
            </Text>
          </View>

          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
              <AlertTriangle size={16} color={C.red600} style={{ marginTop: 1 }} />
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '600', color: C.red600, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
            <Pressable onPress={onClose} accessibilityRole="button">
              <View style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate700 }}>{L('Abbrechen', 'Cancel')}</Text>
              </View>
            </Pressable>
            <Pressable onPress={submit} disabled={sendDisabled} accessibilityRole="button">
              <View style={{ height: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: sendDisabled ? 0.5 : 1 }}>
                <Send size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#FFFFFF' }}>
                  {sending ? L('Wird gesendet…', 'Sending…') : L('Antrag senden', 'Send request')}
                </Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
