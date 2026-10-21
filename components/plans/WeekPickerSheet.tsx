/**
 * Woche wählen — jump the week grid to a calendar week or a date
 * (Kundenfeedback: "Wochenwechsel über Kalenderwoche und Datum").
 * Mobile counterpart of the web's `<input type="date">` next to the
 * KW switcher: a text field that accepts JJJJ-MM-TT, TT.MM.JJJJ or
 * "KW 43" (optionally "KW 43/2026"), plus a month calendar whose rows
 * are labelled with their KW — tap a KW or any day to open that week.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, Text, TextInput, View } from 'react-native'
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { isoWeek, weekStartOf } from '@/lib/plans/week'
import { addDays, localDateKey } from '@/lib/time/shift-hours'
import { MONTHS_DE, MONTHS_EN, WEEKDAYS_SHORT_DE, WEEKDAYS_SHORT_EN } from '@/lib/time/format'

/** Parses JJJJ-MM-TT, TT.MM.JJJJ or "KW n[/JJJJ]" → YYYY-MM-DD (null if invalid). */
export function parseWeekInput(input: string, fallbackYear: number): string | null {
  const t = input.trim()
  if (!t) return null
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? localDateKey(dt) : null
  }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t)
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(?:kw\s*)?(\d{1,2})(?:\s*[/.]\s*(\d{4}))?$/i.exec(t)
  if (m) {
    const week = Number(m[1])
    const year = m[2] ? Number(m[2]) : fallbackYear
    if (week < 1 || week > 53) return null
    // ISO week 1 is the week containing 4 January.
    const monday = addDays(weekStartOf(`${year}-01-04`), (week - 1) * 7)
    return isoWeek(monday) === week ? monday : null
  }
  return null
}

interface Props {
  visible: boolean
  /** Monday (YYYY-MM-DD) of the week currently shown. */
  weekStart: string
  onPick: (date: string) => void
  onClose: () => void
}

export function WeekPickerSheet({ visible, weekStart, onPick, onClose }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [month, setMonth] = useState(weekStart.slice(0, 7))
  const [text, setText] = useState('')
  const [error, setError] = useState(false)
  const today = localDateKey()

  useEffect(() => {
    if (!visible) return
    // Show the month of the visible week's Thursday (= the KW's month).
    setMonth(addDays(weekStart, 3).slice(0, 7))
    setText('')
    setError(false)
  }, [visible, weekStart])

  const weeks = useMemo(() => {
    const first = `${month}-01`
    const [y, mo] = month.split('-').map(Number)
    const last = localDateKey(new Date(y, mo, 0))
    const rows: string[] = []
    for (let w = weekStartOf(first); w <= last; w = addDays(w, 7)) rows.push(w)
    return rows
  }, [month])

  const shiftMonth = (n: number) => {
    const [y, mo] = month.split('-').map(Number)
    setMonth(localDateKey(new Date(y, mo - 1 + n, 1)).slice(0, 7))
  }

  const submit = () => {
    const d = parseWeekInput(text, Number(addDays(weekStart, 3).slice(0, 4)))
    if (!d) {
      setError(true)
      return
    }
    onPick(d)
  }

  const [yy, mm] = month.split('-').map(Number)
  const monthName = `${(locale === 'de' ? MONTHS_DE : MONTHS_EN)[mm - 1]} ${yy}`
  // Monday-first weekday labels.
  const wd = locale === 'de' ? WEEKDAYS_SHORT_DE : WEEKDAYS_SHORT_EN
  const weekdayLabels = [1, 2, 3, 4, 5, 6, 0].map((i) => wd[i])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{ width: '100%', maxWidth: 520, alignSelf: 'center', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 20, fontWeight: '900', letterSpacing: -0.4, color: '#0F172A' }}>{L('Woche wählen', 'Pick week')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color="#94A3B8" />
            </Pressable>
          </View>
          <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500', marginTop: 2 }}>
            {L('Kalenderwoche oder Datum eingeben – oder unten antippen.', 'Enter a calendar week or a date – or tap below.')}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
            <View
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: error ? '#FECACA' : '#E2E8F0',
                backgroundColor: '#FFFFFF',
                paddingHorizontal: 12,
                justifyContent: 'center',
              }}
            >
              <TextInput
                value={text}
                onChangeText={(v) => {
                  setText(v)
                  if (error) setError(false)
                }}
                onSubmitEditing={submit}
                placeholder={L('JJJJ-MM-TT, TT.MM.JJJJ oder KW 43', 'YYYY-MM-DD, DD.MM.YYYY or CW 43')}
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                returnKeyType="go"
                style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}
              />
            </View>
            <Pressable onPress={submit}>
              <View style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>{L('Öffnen', 'Open')}</Text>
              </View>
            </Pressable>
          </View>
          {error ? (
            <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 4, marginLeft: 2 }}>
              {L('Ungültiges Datum bzw. ungültige Kalenderwoche.', 'Invalid date or calendar week.')}
            </Text>
          ) : null}

          {/* Month calendar with KW column */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 }}>
            <Pressable onPress={() => shiftMonth(-1)} hitSlop={8} accessibilityLabel={L('Vormonat', 'Previous month')}>
              <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronLeft size={16} color="#475569" />
              </View>
            </Pressable>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E293B' }}>{monthName}</Text>
            <Pressable onPress={() => shiftMonth(1)} hitSlop={8} accessibilityLabel={L('Folgemonat', 'Next month')}>
              <View style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={16} color="#475569" />
              </View>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={{ width: 44, fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#94A3B8', textAlign: 'center' }}>{L('KW', 'CW')}</Text>
            {weekdayLabels.map((w) => (
              <Text key={w} style={{ flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 0.6, color: '#94A3B8', textAlign: 'center', textTransform: 'uppercase' }}>
                {w}
              </Text>
            ))}
          </View>

          {weeks.map((w) => {
            const selected = w === weekStart
            return (
              <View
                key={w}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 12,
                  backgroundColor: selected ? '#EFF6FF' : 'transparent',
                  borderWidth: 1,
                  borderColor: selected ? '#BFDBFE' : 'transparent',
                  marginBottom: 2,
                }}
              >
                <Pressable onPress={() => onPick(w)} style={{ width: 44 }} accessibilityLabel={`KW ${isoWeek(w)}`}>
                  <View style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: selected ? '#0064E0' : '#64748B' }}>{isoWeek(w)}</Text>
                  </View>
                </Pressable>
                {Array.from({ length: 7 }, (_, i) => addDays(w, i)).map((d) => {
                  const inMonth = d.slice(0, 7) === month
                  const isToday = d === today
                  return (
                    <Pressable key={d} onPress={() => onPick(d)} style={{ flex: 1 }}>
                      <View style={{ height: 38, alignItems: 'center', justifyContent: 'center' }}>
                        <View
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 15,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: isToday ? '#0064E0' : 'transparent',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: isToday || selected ? '900' : '600',
                              color: isToday ? '#FFFFFF' : inMonth ? '#0F172A' : '#CBD5E1',
                            }}
                          >
                            {Number(d.slice(8, 10))}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )
          })}

          <Pressable onPress={() => onPick(today)} style={{ marginTop: 10 }}>
            <View style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: '#0064E0' }}>{L('Heute', 'Today')}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
