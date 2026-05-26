/**
 * Clock-in / clock-out card — mirrors the webapp's ClockInOutCard.
 *
 * Idle:
 *   white card, blue Clock icon in tinted square
 *   "Bereit" label + 00:00:00 timer (italic, blue-600)
 *   Optional plan chip-row (today's confirmed plans). Tapping a chip
 *   pre-selects the plan; chip toggles off if tapped again.
 *   "Schicht starten" CTA (full-width, blue, play icon)
 *
 * Active:
 *   blue background, white Clock icon
 *   "Einsatz aktiv" label + live timer in italic white
 *   Pause + Beenden buttons (Pause goes white→blue when on break)
 */

import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { Play, Square, Clock, Coffee } from 'lucide-react-native'

import { useTimeTracking } from '@/hooks/useTimeTracking'
import { useTranslation } from '@/lib/i18n'

function formatHHMMSS(total: number): string {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function timeOfDay(iso: string): string {
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return ''
  }
}

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
  } = useTimeTracking()

  const [selectedPlanId, setSelectedPlanId] = useState<string>('')
  const [busy, setBusy] = useState(false)

  if (loading) {
    return <View style={{ height: 96, backgroundColor: '#F1F5F9', borderRadius: 16 }} />
  }

  const isOnBreak = !!activeEntry?.is_on_break
  const isActive = !!activeEntry
  const displaySeconds = isOnBreak ? breakSeconds : elapsedSeconds

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
      await clockOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      style={{
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: isActive ? '#2563EB' : '#FFFFFF',
        borderWidth: isActive ? 0 : 1,
        borderColor: '#F1F5F9',
        padding: 16,
        shadowColor: '#000',
        shadowOpacity: isActive ? 0.1 : 0.04,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: isActive ? 'rgba(255,255,255,0.10)' : '#EFF6FF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Clock size={20} color={isActive ? '#FFFFFF' : '#0064E0'} />
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 9,
              fontWeight: '900',
              letterSpacing: 1.8,
              textTransform: 'uppercase',
              color: isActive ? 'rgba(255,255,255,0.6)' : '#94A3B8',
              marginBottom: 4,
            }}
          >
            {isActive ? L('Einsatz aktiv', 'Mission active') : L('Bereit', 'Ready')}
          </Text>
          <Text
            style={{
              fontSize: 28,
              fontWeight: '700',
              fontStyle: 'italic',
              color: isActive ? '#FFFFFF' : '#0064E0',
              letterSpacing: -0.5,
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatHHMMSS(displaySeconds)}
          </Text>
        </View>
      </View>

      {/* Plan picker — only visible when idle and there's at least one plan today */}
      {!isActive && todayPlans.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text
            style={{
              fontSize: 10,
              fontWeight: '900',
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: '#94A3B8',
              marginBottom: 8,
              marginLeft: 2,
            }}
          >
            {L('Heutige Schicht (optional)', 'Today’s shift (optional)')}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {todayPlans.map((p) => {
              const sel = selectedPlanId === p.id
              const label = `${timeOfDay(p.start_time)}–${timeOfDay(p.end_time)}${
                p.customer?.name ? ` · ${p.customer.name}` : ''
              }`
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedPlanId(sel ? '' : p.id)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 2,
                    backgroundColor: sel ? '#0064E0' : '#FFFFFF',
                    borderColor: sel ? '#0064E0' : '#E5E7EB',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: sel ? '#FFFFFF' : '#475569',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        {!isActive ? (
          <Pressable
            onPress={onStart}
            disabled={busy}
            style={({ pressed }: { pressed: boolean }) => ({
              flex: 1,
              height: 44,
              borderRadius: 12,
              backgroundColor: '#2563EB',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            <Play size={14} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 8 }} />
            <Text
              style={{
                color: '#FFFFFF',
                fontSize: 10,
                fontWeight: '900',
                letterSpacing: 1.6,
                textTransform: 'uppercase',
              }}
            >
              {busy ? L('Wird gestartet…', 'Starting…') : L('Schicht starten', 'Begin shift')}
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={isOnBreak ? endBreak : startBreak}
              disabled={busy}
              style={({ pressed }: { pressed: boolean }) => ({
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: isOnBreak ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {isOnBreak ? (
                <Play size={14} color="#2563EB" style={{ marginRight: 8 }} />
              ) : (
                <Coffee size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
              )}
              <Text
                style={{
                  color: isOnBreak ? '#2563EB' : '#FFFFFF',
                  fontSize: 10,
                  fontWeight: '900',
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                }}
              >
                {isOnBreak ? L('Fortsetzen', 'Resume') : L('Pause machen', 'Pause')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onEnd}
              disabled={busy}
              style={({ pressed }: { pressed: boolean }) => ({
                flex: 1,
                height: 44,
                borderRadius: 12,
                backgroundColor: '#DC2626',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                opacity: pressed || busy ? 0.7 : 1,
              })}
            >
              <Square size={14} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 8 }} />
              <Text
                style={{
                  color: '#FFFFFF',
                  fontSize: 10,
                  fontWeight: '900',
                  letterSpacing: 1.6,
                  textTransform: 'uppercase',
                }}
              >
                {busy ? L('Wird beendet…', 'Ending…') : L('Beenden', 'End')}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  )
}
