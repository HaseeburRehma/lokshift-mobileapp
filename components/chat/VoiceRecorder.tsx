/**
 * Inline voice-message recorder. Replaces the chat composer while
 * active. Three buttons:
 *   - Cancel (X)              — discards
 *   - Recording indicator     — visual only, animated pulse
 *   - Send (paper plane)      — stops recording, returns the local URI
 *                                as a ChatAttachmentSource for upload
 *
 * Uses expo-audio's useAudioRecorder hook. Permission is requested up
 * front; failure surfaces an Alert with a hint to grant it from system
 * settings.
 */

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Alert, Animated, Platform } from 'react-native'
import { X, Send } from 'lucide-react-native'
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio'

import { useTranslation } from '@/lib/i18n'
import type { ChatAttachmentSource } from '@/lib/chat/storage'

interface Props {
  onCancel: () => void
  onSend: (source: ChatAttachmentSource) => void
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function VoiceRecorder({ onCancel, onSend }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)

  const [elapsedMs, setElapsedMs] = useState(0)
  const [busy, setBusy] = useState(false)
  const startedAtRef = useRef<number | null>(null)
  const pulse = useRef(new Animated.Value(0)).current

  // Permission + start as soon as the component mounts so the user
  // doesn't have to press "record" after already tapping the mic in the
  // attachment sheet.
  useEffect(() => {
    let cancelled = false

    const start = async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync()
        if (!perm.granted) {
          Alert.alert(
            L('Mikrofon-Berechtigung fehlt', 'Microphone permission missing'),
            L(
              'Bitte erlauben Sie den Mikrofon-Zugriff in den Systemeinstellungen.',
              'Please grant microphone access in system settings.',
            ),
          )
          if (!cancelled) onCancel()
          return
        }

        // Configure for record-and-play behavior. Without this, iOS may
        // mute system audio after the recording stops.
        try {
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          })
        } catch {
          // Older expo-audio versions name fields differently; safe to ignore.
        }

        await recorder.prepareToRecordAsync()
        recorder.record()
        startedAtRef.current = Date.now()
      } catch (err: any) {
        Alert.alert(
          L('Aufnahme fehlgeschlagen', 'Recording failed'),
          err?.message ?? String(err),
        )
        if (!cancelled) onCancel()
      }
    }

    start()

    // Tick the elapsed counter.
    const tick = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current)
    }, 200)

    // Pulse animation for the red recording dot.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    )
    loop.start()

    return () => {
      cancelled = true
      clearInterval(tick)
      loop.stop()
      // Best-effort stop on unmount so we don't keep a microphone session
      // alive if the user navigates away. Errors here are non-fatal.
      try {
        recorder.stop()
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cancel = async () => {
    setBusy(true)
    try {
      await recorder.stop()
    } catch {}
    onCancel()
  }

  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) {
        Alert.alert(
          L('Aufnahme leer', 'Empty recording'),
          L('Keine Datei aufgenommen.', 'No audio was recorded.'),
        )
        onCancel()
        return
      }
      const ext = Platform.OS === 'ios' ? 'm4a' : 'm4a'
      const contentType = 'audio/m4a'
      onSend({
        uri,
        name: `Sprachnachricht-${Date.now()}.${ext}`,
        contentType,
      })
    } catch (err: any) {
      Alert.alert(
        L('Senden fehlgeschlagen', 'Send failed'),
        err?.message ?? String(err),
      )
      onCancel()
    } finally {
      setBusy(false)
    }
  }

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] })
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] })

  return (
    <View
      className="flex-row items-center px-3 py-2 bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800"
      style={{ paddingBottom: Platform.OS === 'ios' ? 8 : 12 }}
    >
      <Pressable
        onPress={cancel}
        disabled={busy}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        }}
      >
        <X size={22} color="#DC2626" />
      </Pressable>

      <View
        style={{
          flex: 1,
          backgroundColor: '#FEF2F2',
          borderRadius: 22,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Animated.View
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            backgroundColor: '#DC2626',
            marginRight: 10,
            transform: [{ scale }],
            opacity,
          }}
        />
        <Text
          style={{
            color: '#991B1B',
            fontSize: 14,
            fontWeight: '700',
            letterSpacing: 0.2,
          }}
        >
          {L('Aufnahme läuft', 'Recording')}
        </Text>
        <Text
          style={{
            color: '#991B1B',
            fontSize: 14,
            fontWeight: '700',
            marginLeft: 'auto',
          }}
        >
          {formatDuration(elapsedMs)}
        </Text>
      </View>

      <Pressable
        onPress={send}
        disabled={busy}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: busy ? '#CBD5E1' : '#0064E0',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 8,
        }}
      >
        <Send size={20} color="#fff" />
      </Pressable>
    </View>
  )
}
