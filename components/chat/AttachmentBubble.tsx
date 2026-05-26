/**
 * Renders the attachment portion of a chat message bubble.
 *   - image  → tappable preview, opens fullscreen in the system browser
 *   - file   → row with filename + extension chip, opens the URL
 *   - audio  → inline player with play/pause + duration timer
 *
 * The audio player is its own subcomponent so the expo-audio hook only
 * mounts when there's an audio attachment — keeps the message list
 * cheap when most rows are text or image.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native'
import { FileText, Play, Pause } from 'lucide-react-native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'

import { useTranslation } from '@/lib/i18n'
import type { ChatAttachmentType } from '@/lib/types'

interface Props {
  url: string
  type: ChatAttachmentType
  name?: string | null
  /** True when this bubble belongs to the current user (alignment / colors). */
  mine: boolean
}

export function AttachmentBubble({ url, type, name, mine }: Props) {
  if (type === 'image') return <ImageAttachment url={url} />
  if (type === 'audio') return <AudioAttachment url={url} mine={mine} />
  return <FileAttachment url={url} name={name ?? 'Datei'} mine={mine} />
}

// ─── Image ────────────────────────────────────────────────────────────

function ImageAttachment({ url }: { url: string }) {
  const [loading, setLoading] = useState(true)
  const [errored, setErrored] = useState(false)

  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={{
        width: 220,
        height: 220,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!errored ? (
        <Image
          source={{ uri: url }}
          style={{ width: 220, height: 220 }}
          resizeMode="cover"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false)
            setErrored(true)
          }}
        />
      ) : (
        <Text style={{ color: '#94A3B8', fontSize: 12 }}>Bild konnte nicht geladen werden</Text>
      )}
      {loading && !errored && (
        <View style={{ position: 'absolute' }}>
          <ActivityIndicator color="#0064E0" />
        </View>
      )}
    </Pressable>
  )
}

// ─── File ────────────────────────────────────────────────────────────

function FileAttachment({
  url,
  name,
  mine,
}: {
  url: string
  name: string
  mine: boolean
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const i = name.lastIndexOf('.')
  const ext = i > 0 ? name.slice(i + 1).toUpperCase() : 'FILE'
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        minWidth: 200,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          backgroundColor: mine ? 'rgba(255,255,255,0.18)' : '#EEF6FF',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <FileText size={18} color={mine ? '#fff' : '#0064E0'} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: mine ? '#fff' : '#0F172A',
            fontWeight: '700',
            fontSize: 13,
          }}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={{
            color: mine ? 'rgba(255,255,255,0.75)' : '#64748B',
            fontSize: 11,
            marginTop: 1,
          }}
        >
          {ext} · {L('Tippen zum Öffnen', 'Tap to open')}
        </Text>
      </View>
    </Pressable>
  )
}

// ─── Audio ───────────────────────────────────────────────────────────

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '00:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function AudioAttachment({ url, mine }: { url: string; mine: boolean }) {
  const player = useAudioPlayer({ uri: url })
  const status = useAudioPlayerStatus(player)

  // Stop playback when the bubble unmounts (scrolled far off-screen).
  useEffect(() => {
    return () => {
      try {
        player.pause()
      } catch {}
    }
  }, [player])

  const isPlaying = !!status?.playing
  const dur = status?.duration ?? 0
  const cur = status?.currentTime ?? 0
  const progress = dur > 0 ? Math.min(1, cur / dur) : 0

  const toggle = () => {
    try {
      if (isPlaying) {
        player.pause()
      } else {
        if (status?.didJustFinish || (dur > 0 && cur >= dur - 0.05)) {
          player.seekTo(0)
        }
        player.play()
      }
    } catch {}
  }

  const fg = mine ? '#fff' : '#0F172A'
  const muted = mine ? 'rgba(255,255,255,0.7)' : '#64748B'
  const trackBg = mine ? 'rgba(255,255,255,0.25)' : '#E2E8F0'
  const trackFill = mine ? '#fff' : '#0064E0'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        minWidth: 200,
      }}
    >
      <Pressable
        onPress={toggle}
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          backgroundColor: mine ? 'rgba(255,255,255,0.18)' : '#EEF6FF',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        {isPlaying ? (
          <Pause size={18} color={mine ? '#fff' : '#0064E0'} />
        ) : (
          <Play size={18} color={mine ? '#fff' : '#0064E0'} />
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <View
          style={{
            height: 4,
            borderRadius: 999,
            backgroundColor: trackBg,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progress * 100}%`,
              height: '100%',
              backgroundColor: trackFill,
            }}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 4,
          }}
        >
          <Text style={{ color: muted, fontSize: 10, fontWeight: '600' }}>
            {formatSeconds(cur)}
          </Text>
          <Text style={{ color: muted, fontSize: 10, fontWeight: '600' }}>
            {formatSeconds(dur)}
          </Text>
        </View>
      </View>
    </View>
  )
}
