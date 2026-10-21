/**
 * Abschlussansicht (Kundenfeedback Punkte 2 + 19) — shown after "Beenden"
 * and for every ended shift that wasn't submitted yet. Planned, recorded
 * and to-be-submitted values side by side; "Planzeit übernehmen" and
 * "Schicht absenden". A break of 0 minutes never blocks submitting.
 *
 * Layout mirrors the webapp's ShiftClosingDialog (title + description,
 * Geplant / Erfasst / Absenden grid, result box, Übernachtung + Notiz,
 * Schicht absenden · Planzeit übernehmen · Später absenden).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, Switch, Platform, TextInput } from 'react-native'
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Info, Moon, Send, Undo2 } from 'lucide-react-native'

import { C, MicroLabel, SheetHeader } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useOrgRules } from '@/hooks/useOrgRules'
import type { TimeEntry } from '@/lib/types'
import type { SubmitShiftValues } from '@/hooks/useTimeTracking'
import { calculateShiftTimes, isValidDate, isValidTime, localDateKey, localTimeKey } from '@/lib/time/shift-hours'
import { formatDateDE, formatEuro, formatHours, formatHoursLong, weekdayName } from '@/lib/time/format'
import { calculateSpesen, spesenTierLabel } from '@/lib/spesen'

interface Props {
  entry: TimeEntry | null
  open: boolean
  onClose: () => void
  onSubmit: (entryId: string, values: SubmitShiftValues) => Promise<boolean>
}

const hhmm = (iso?: string | null) => (iso ? localTimeKey(new Date(iso)) : '')
const dayOf = (iso?: string | null) => (iso ? localDateKey(new Date(iso)) : '')

/** Read-only cell (`h-11 rounded-xl bg-slate-50 text-sm font-bold text-slate-600`). */
function ReadCell({ children, small }: { children: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: C.slate50, alignItems: 'center', justifyContent: 'center', marginHorizontal: 3, paddingHorizontal: 2 }}>
      <Text style={{ fontSize: small ? 11 : 14, fontWeight: '700', color: C.slate600, fontVariant: ['tabular-nums'], textAlign: 'center' }} numberOfLines={2}>
        {children}
      </Text>
    </View>
  )
}

/** Editable cell (`h-11 rounded-xl border font-bold`), optional suffix like "Min.". */
function CellInput({ suffix, ...props }: React.ComponentProps<typeof TextInput> & { suffix?: string }) {
  return (
    <View
      style={{
        flex: 1.3,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: C.slate200,
        marginHorizontal: 3,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
      }}
    >
      <TextInput
        {...props}
        style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.slate900, fontVariant: ['tabular-nums'] }}
        placeholderTextColor={C.slate400}
      />
      {suffix ? <Text style={{ fontSize: 11, fontWeight: '700', color: C.slate400 }}>{suffix}</Text> : null}
    </View>
  )
}

export function ShiftClosingSheet({ entry, open, onClose, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { spesenRates } = useOrgRules()

  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [breakMinutes, setBreakMinutes] = useState('0')
  const [overnight, setOvernight] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const plan = entry?.plan && entry.plan.start_time && entry.plan.end_time ? entry.plan : null
  const recordedStart = entry?.clock_start_time ?? entry?.start_time ?? null
  const recordedEnd = entry?.clock_end_time ?? entry?.end_time ?? null

  useEffect(() => {
    if (!entry || !open) return
    setDate(entry.date)
    setStartTime(hhmm(entry.start_time))
    setEndTime(hhmm(entry.end_time))
    setBreakMinutes(String(entry.break_minutes ?? 0))
    setOvernight(!!entry.overnight_stay)
    setNotes(entry.notes ?? '')
  }, [entry, open])

  const brk = Math.max(0, Number(breakMinutes) || 0)
  const shift = useMemo(() => calculateShiftTimes(date, startTime, endTime, brk), [date, startTime, endTime, brk])

  const errors: string[] = []
  const warnings: string[] = []
  if (!isValidDate(date)) errors.push(L('Bitte ein gültiges Datum eingeben (JJJJ-MM-TT).', 'Please enter a valid date (YYYY-MM-DD).'))
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    errors.push(L('Bitte Beginn und Ende im Format HH:MM eingeben.', 'Please enter start and end as HH:MM.'))
  } else if (startTime === endTime) {
    errors.push(L('Ende entspricht dem Beginn.', 'End equals start.'))
  } else if (shift.netHours <= 0) {
    errors.push(L('Die Pause ist so lang wie die Schicht.', 'The break is as long as the shift.'))
  }
  if (shift.grossHours > 16) warnings.push(L('Ungewöhnlich lange Schicht (über 16 Std.) – bitte Ende prüfen.', 'Unusually long shift (over 16 h) – please check the end.'))

  const deviates =
    !!recordedStart && !!recordedEnd && (hhmm(recordedStart) !== startTime || hhmm(recordedEnd) !== endTime || dayOf(recordedStart) !== date)

  // Forgotten clock-out: the recording spans 24 h or more, but HH:MM alone
  // can't express that — submitting unchanged would silently store < 24 h.
  const recordedHours =
    recordedStart && recordedEnd ? (new Date(recordedEnd).getTime() - new Date(recordedStart).getTime()) / 3_600_000 : null
  if (recordedHours != null && recordedHours >= 24 && !deviates) {
    errors.push(
      L(
        `Die Erfassung läuft über ${Math.floor(recordedHours)} Std. (bis ${formatDateDE(dayOf(recordedEnd))} ${hhmm(recordedEnd)}). Bitte das tatsächliche Ende eintragen oder „Planzeit übernehmen“.`,
        `The recording spans ${Math.floor(recordedHours)} h (until ${dayOf(recordedEnd)} ${hhmm(recordedEnd)}). Please enter the actual end or apply the planned time.`,
      ),
    )
  }
  const planApplied = !!plan && dayOf(plan.start_time) === date && hhmm(plan.start_time) === startTime && hhmm(plan.end_time) === endTime

  const applyPlan = () => {
    if (!plan?.start_time || !plan.end_time) return
    setDate(dayOf(plan.start_time))
    setStartTime(hhmm(plan.start_time))
    setEndTime(hhmm(plan.end_time))
  }

  const spesen = calculateSpesen(shift.netHours, overnight, spesenRates)

  const submit = async () => {
    if (!entry || errors.length) return
    setSubmitting(true)
    const ok = await onSubmit(entry.id, { date, startTime, endTime, breakMinutes: brk, overnightStay: overnight, notes })
    setSubmitting(false)
    if (ok) onClose()
  }

  const rowLabelStyle = { width: 58, fontSize: 10, fontWeight: '900' as const, letterSpacing: 1, textTransform: 'uppercase' as const, color: C.slate400 }
  const submitDisabled = !entry || errors.length > 0 || submitting
  const planDisabled = !plan || planApplied

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <SheetHeader title={L('Schicht absenden', 'Submit shift')} onClose={onClose} closeLabel={L('Schließen', 'Close')} />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {/* Dialog title + description */}
          <Text style={{ fontSize: 24, fontWeight: '900', color: C.slate900, letterSpacing: -0.5 }}>
            {L('Schicht prüfen und absenden', 'Review and submit shift')}
          </Text>
          {entry ? (
            <Text style={{ marginTop: 4, fontSize: 14, color: C.slate500 }}>
              {weekdayName(entry.date, locale)}, {formatDateDE(entry.date)}
              {plan?.shift_name || plan?.route ? ` · ${plan.shift_name || plan.route}` : ''}
            </Text>
          ) : null}

          {/* Comparison grid: Geplant · Erfasst · Absenden */}
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              <View style={{ width: 58 }} />
              <View style={{ flex: 1, marginHorizontal: 3 }}><MicroLabel style={{ textAlign: 'center' }}>{L('Geplant', 'Planned')}</MicroLabel></View>
              <View style={{ flex: 1, marginHorizontal: 3 }}><MicroLabel style={{ textAlign: 'center' }}>{L('Erfasst', 'Recorded')}</MicroLabel></View>
              <View style={{ flex: 1.3, marginHorizontal: 3 }}><MicroLabel color={C.brand} style={{ textAlign: 'center' }}>{L('Absenden', 'Submit')}</MicroLabel></View>
            </View>
            {[
              { k: L('Datum', 'Date'), p: plan ? formatDateDE(dayOf(plan.start_time)).slice(0, 6) : '—', r: recordedStart ? formatDateDE(dayOf(recordedStart)).slice(0, 6) : '—', small: false, input: <CellInput value={date} onChangeText={setDate} placeholder="JJJJ-MM-TT" autoCapitalize="none" /> },
              { k: L('Beginn', 'Start'), p: plan ? hhmm(plan.start_time) : '—', r: hhmm(recordedStart) || '—', small: false, input: <CellInput value={startTime} onChangeText={setStartTime} placeholder="10:00" keyboardType="numbers-and-punctuation" /> },
              { k: L('Ende', 'End'), p: plan ? hhmm(plan.end_time) : '—', r: hhmm(recordedEnd) || '—', small: false, input: <CellInput value={endTime} onChangeText={setEndTime} placeholder="18:00" keyboardType="numbers-and-punctuation" /> },
              { k: L('Pause', 'Break'), p: L('nicht hinterlegt', 'not set'), r: entry ? `${entry.break_minutes ?? 0} Min.` : '—', small: true, input: <CellInput value={breakMinutes} onChangeText={(v) => setBreakMinutes(v.replace(/\D/g, ''))} placeholder="0" keyboardType="number-pad" suffix="Min." accessibilityLabel={L('Pause in Minuten', 'Break in minutes')} /> },
            ].map((row) => (
              <View key={row.k} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={rowLabelStyle} numberOfLines={1}>{row.k}</Text>
                <ReadCell small={row.small}>{row.p}</ReadCell>
                <ReadCell>{row.r}</ReadCell>
                {row.input}
              </View>
            ))}
          </View>

          {!plan ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Info size={16} color={C.slate500} />
              <Text style={{ marginLeft: 8, fontSize: 12, color: C.slate500, flex: 1 }}>
                {L('Für diese Schicht ist keine Planung hinterlegt.', 'No planned shift is linked to this entry.')}
              </Text>
            </View>
          ) : null}

          {/* Result */}
          <View
            style={{
              marginTop: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: errors.length ? C.red200 : C.blue100,
              backgroundColor: errors.length ? C.red50 : 'rgba(239,246,255,0.6)',
              padding: 20,
            }}
          >
            <MicroLabel>{L('Arbeitszeit', 'Working time')}</MicroLabel>
            <Text style={{ fontSize: 36, fontWeight: '900', color: C.brand, letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>
              {formatHours(shift.netHours, locale)} <Text style={{ fontSize: 18 }}>{L('Std.', 'h')}</Text>
            </Text>
            <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '600', color: C.slate500 }}>
              = {formatHoursLong(shift.netHours, locale)}
              {brk > 0 ? ` · ${L('abzgl.', 'minus')} ${brk} Min. ${L('Pause', 'break')}` : ` · ${L('ohne Pause', 'no break')}`}
            </Text>
            {shift.isOvernight ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Moon size={16} color={C.indigo700} />
                <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '700', color: C.indigo700, flex: 1 }}>
                  {L('Ende am Folgetag', 'Ends next day')} ({weekdayName(shift.endDate, locale, true)}, {formatDateDE(shift.endDate).slice(0, 6)})
                </Text>
              </View>
            ) : null}
            <Text style={{ marginTop: 6, fontSize: 14, fontWeight: '600', color: C.slate600 }}>
              {L('Spesen', 'Per diem')}: {formatEuro(spesen, locale)}{' '}
              <Text style={{ color: C.slate400, fontWeight: '500' }}>({spesenTierLabel(spesen, spesenRates, locale)})</Text>
            </Text>
          </View>

          {errors.map((e) => (
            <View key={e} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
              <AlertTriangle size={16} color={C.red600} style={{ marginTop: 1 }} />
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '600', color: C.red600, flex: 1 }}>{e}</Text>
            </View>
          ))}
          {warnings.map((w) => (
            <View key={w} style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
              <AlertTriangle size={16} color={C.amber600} style={{ marginTop: 1 }} />
              <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '600', color: C.amber600, flex: 1 }}>{w}</Text>
            </View>
          ))}
          {deviates ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }}>
              <Clock size={16} color={C.slate500} style={{ marginTop: 1 }} />
              <Text style={{ marginLeft: 8, fontSize: 12, color: C.slate500, flex: 1 }}>
                {L(
                  `Abweichung zur Erfassung (erfasst ${hhmm(recordedStart)}–${hhmm(recordedEnd)}). Die ursprüngliche Erfassung bleibt für Disposition und Admin im Verlauf sichtbar.`,
                  `Differs from the recording (${hhmm(recordedStart)}–${hhmm(recordedEnd)}). The original recording stays visible to dispatch and admin in the history.`,
                )}
              </Text>
            </View>
          ) : null}

          {/* Übernachtung + Notiz */}
          <View style={{ marginTop: 20, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.slate100, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate700 }}>{L('Übernachtung', 'Overnight stay')}</Text>
              <Switch value={overnight} onValueChange={setOvernight} trackColor={{ false: '#D1D5DB', true: C.brand }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
            </View>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={L('Notiz (optional)', 'Note (optional)')}
              placeholderTextColor={C.slate400}
              multiline
              textAlignVertical="top"
              style={{ minHeight: 56, borderWidth: 1, borderColor: C.slate200, borderRadius: 16, padding: 12, fontSize: 14, color: C.slate900, backgroundColor: '#FFFFFF' }}
            />
          </View>

          {/* Actions — phone order of the web's flex-col-reverse footer */}
          <View style={{ marginTop: 24, gap: 10 }}>
            <Pressable onPress={submit} disabled={submitDisabled} accessibilityRole="button">
              <View style={{ height: 48, borderRadius: 12, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: submitDisabled ? 0.5 : 1 }}>
                <Send size={16} color="#FFFFFF" />
                <Text style={{ marginLeft: 8, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#FFFFFF' }}>
                  {submitting ? L('Wird gesendet…', 'Sending…') : L('Schicht absenden', 'Submit shift')}
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={applyPlan} disabled={planDisabled} accessibilityRole="button">
              <View style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: planDisabled ? 0.5 : 1 }}>
                {planApplied ? <CheckCircle2 size={16} color={C.emerald600} /> : <CalendarClock size={16} color={C.slate900} />}
                <Text style={{ marginLeft: 8, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.slate900 }}>
                  {L('Planzeit übernehmen', 'Apply planned time')}
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={onClose} accessibilityRole="button">
              <View style={{ height: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' }}>
                <Undo2 size={16} color={C.slate500} />
                <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '700', color: C.slate500 }}>{L('Später absenden', 'Submit later')}</Text>
              </View>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}
