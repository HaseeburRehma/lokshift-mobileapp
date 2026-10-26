/**
 * Clock-in / clock-out card — mirrors the webapp's ClockInOutCard.
 *
 * Idle:
 *   white card (`border-slate-100 shadow-sm`), blue Clock in tinted square
 *   "Bereit" + 00:00:00 timer (italic, blue-600)
 *   Optional plan chips (today's plans) — tapping pre-selects the plan,
 *   tapping again clears it (clock-in then picks the closest plan, like
 *   the web's suggested default)
 *   "Schicht starten" CTA
 *
 * Active:
 *   blue-600 background, "Einsatz aktiv" / "Pause läuft" + live timer,
 *   linked plan ("Plan 06:00–14:00 · …"), Pause machen / Fortsetzen + Beenden
 *
 * Unsubmitted drafts: amber banner "… noch nicht abgesendet · Jetzt prüfen".
 */

import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { Play, Square, Clock, Coffee, AlertCircle, ArrowRight } from 'lucide-react-native'

import { useTimeTracking } from '@/hooks/useTimeTracking'
import { useTranslation } from '@/lib/i18n'
import { ShiftClosingSheet } from '@/components/ShiftClosingSheet'
import { C } from '@/components/time/ui'
import type { TimeEntry } from '@/lib/types'
import { formatTimeOfDay } from '@/lib/time/format'

function formatHHMMSS(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function timeOfDay(iso: string): string {
  return formatTimeOfDay(iso)
}

const planLabel = (p: { start_time: string; end_time: string; shift_name?: string | null; route?: string | null }) =>
  `${timeOfDay(p.start_time)}–${timeOfDay(p.end_time)}${p.shift_name || p.route ? ` · ${p.shift_name || p.route}` : ''}`

const BUTTON_TEXT = { fontSize: 10, fontWeight: '900' as const, letterSpacing: 1.6, textTransform: 'uppercase' as const }

export function ClockInOutCard() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const {
    activeEntry,
    clockIn,
    startBreak,
    endBreak,
    clockOut,
    elapsedSeconds,
    breakSeconds,
    loading,
    todayPlans,
    drafts,
    submitEntry,
  } = useTimeTracking()

  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [reviewEntry, setReviewEntry] = useState<TimeEntry | null>(null)

  if (loading) {
    return <View style={{ height: 64, backgroundColor: C.slate50, borderRadius: 16 }} />
  }

  const isOnBreak = !!activeEntry?.is_on_break
  const isActive = !!activeEntry
  const displaySeconds = isOnBreak ? breakSeconds : elapsedSeconds
  const activePlan = activeEntry ? todayPlans.find((p) => p.id === activeEntry.plan_id) ?? null : null

  const onStart = async () => {
    if (busy || isActive) return
    setBusy(true)
    try {
      await clockIn(selectedPlanId || undefined)
      setSelectedPlanId('')
    } finally {
      setBusy(false)
    }
  }

  const onEnd = async () => {
    if (busy || !isActive) return
    setBusy(true)
    try {
      const closed = await clockOut()
      // Open the closing view right away (Kundenfeedback Punkt 2).
      if (closed) setReviewEntry(closed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <View
        style={{
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: isActive ? C.blue600 : '#FFFFFF',
          borderWidth: isActive ? 0 : 1,
          borderColor: C.slate100,
          padding: 16,
          shadowColor: '#000',
          shadowOpacity: isActive ? 0.12 : 0.04,
          shadowRadius: isActive ? 14 : 6,
          shadowOffset: { width: 0, height: isActive ? 6 : 2 },
          elevation: isActive ? 4 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: isActive ? 'rgba(255,255,255,0.10)' : C.blue50,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Clock size={20} color={isActive ? '#FFFFFF' : C.blue600} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 9,
                fontWeight: '900',
                letterSpacing: 1.8,
                textTransform: 'uppercase',
                color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(148,163,184,0.85)',
                marginBottom: 4,
              }}
            >
              {isActive
                ? isOnBreak
                  ? L('Pause läuft', 'On break')
                  : L('Einsatz aktiv', 'Shift active')
                : L('Bereit', 'Ready')}
            </Text>
            <Text
              style={{
                fontSize: 26,
                fontWeight: '700',
                fontStyle: 'italic',
                color: isActive ? '#FFFFFF' : C.blue600,
                letterSpacing: -0.5,
                fontVariant: ['tabular-nums'],
              }}
            >
              {formatHHMMSS(displaySeconds)}
            </Text>
            {isActive && activePlan?.start_time && activePlan?.end_time ? (
              <Text
                style={{ marginTop: 4, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#FFFFFF' }}
                numberOfLines={1}
              >
                {`${L('Plan', 'Plan')} ${planLabel(activePlan)}`}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Plan picker — only visible when idle and there's at least one plan today */}
        {!isActive && todayPlans.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.slate400, marginBottom: 8, marginLeft: 2 }}>
              {L('Geplante Schicht', 'Planned shift')}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {todayPlans.map((p) => {
                const sel = selectedPlanId === p.id
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelectedPlanId(sel ? '' : p.id)}
                    accessibilityState={{ selected: sel }}
                    style={{
                      height: 40,
                      justifyContent: 'center',
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      backgroundColor: sel ? C.brand : C.slate50,
                      borderColor: sel ? C.brand : C.slate100,
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', color: sel ? '#FFFFFF' : C.slate700 }}>
                      {`${planLabel(p)}${!(p.shift_name || p.route) && p.customer?.name ? ` · ${p.customer.name}` : ''}`}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          {!isActive ? (
            <Pressable onPress={onStart} disabled={busy} style={{ flex: 1 }} accessibilityRole="button">
              <View
                style={{
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: C.blue600,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  opacity: busy ? 0.7 : 1,
                  shadowColor: '#000',
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                <Play size={14} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={[BUTTON_TEXT, { color: '#FFFFFF' }]}>
                  {busy ? L('Wird gestartet…', 'Starting…') : L('Schicht starten', 'Start shift')}
                </Text>
              </View>
            </Pressable>
          ) : (
            <>
              <Pressable onPress={isOnBreak ? endBreak : startBreak} disabled={busy} style={{ flex: 1, marginRight: 8 }} accessibilityRole="button">
                <View
                  style={{
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: isOnBreak ? '#FFFFFF' : 'rgba(255,255,255,0.10)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  {isOnBreak ? (
                    <Play size={14} color={C.blue600} style={{ marginRight: 8 }} />
                  ) : (
                    <Coffee size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
                  )}
                  <Text style={[BUTTON_TEXT, { color: isOnBreak ? C.blue600 : '#FFFFFF' }]}>
                    {isOnBreak ? L('Fortsetzen', 'Resume') : L('Pause machen', 'Break')}
                  </Text>
                </View>
              </Pressable>
              <Pressable onPress={onEnd} disabled={busy} style={{ flex: 1 }} accessibilityRole="button">
                <View
                  style={{
                    height: 40,
                    borderRadius: 12,
                    backgroundColor: C.red600,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  <Square size={14} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={[BUTTON_TEXT, { color: '#FFFFFF' }]}>
                    {busy ? L('Wird beendet…', 'Ending…') : L('Beenden', 'End')}
                  </Text>
                </View>
              </Pressable>
            </>
          )}
        </View>

        {!isActive && drafts.length > 0 ? (
          <Pressable onPress={() => setReviewEntry(drafts[0])} style={{ marginTop: 16 }} accessibilityRole="button">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: C.amber50,
                borderWidth: 1,
                borderColor: C.amber200,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <AlertCircle size={16} color={C.amber800} />
              <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '700', color: C.amber800 }}>
                {drafts.length === 1
                  ? L('1 beendete Schicht ist noch nicht abgesendet.', '1 finished shift has not been submitted.')
                  : L(`${drafts.length} beendete Schichten sind noch nicht abgesendet.`, `${drafts.length} finished shifts have not been submitted.`)}
              </Text>
              <Text style={{ marginLeft: 8, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: C.amber700 }}>
                {L('Jetzt prüfen', 'Review now')}
              </Text>
              <ArrowRight size={14} color={C.amber700} style={{ marginLeft: 4 }} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <ShiftClosingSheet
        entry={reviewEntry}
        open={!!reviewEntry}
        onClose={() => setReviewEntry(null)}
        onSubmit={submitEntry}
      />
    </>
  )
}
