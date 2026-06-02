/**
 * Animated toast notifications — non-blocking, ephemeral feedback.
 *
 * Replaces the previous Alert-based stub. The previous version called
 * `Alert.alert(...)` which is a *modal* popup — users perceived it as
 * "no toast" because it interrupted the flow instead of sliding in.
 *
 * Usage:
 *   toast.success('Plan erstellt')                              // pre-localized
 *   toast.success({ de: 'Plan erstellt', en: 'Plan created' })  // auto-localized
 *   toast.error(...)
 *   toast.info(...)
 *
 * The host (`<ToastHost />`) must be mounted once near the root of the
 * tree, inside the I18nProvider so locale-aware messages resolve.
 *
 * Implementation:
 *   - Toasts dispatched via a global emitter so any module can call
 *     toast.success() without React context. The host subscribes and
 *     renders the visible stack.
 *   - Slide-down + fade animation via RN's `Animated` API (no extra
 *     deps required).
 *   - Auto-dismiss after `durationMs` (success/info default 2800ms,
 *     errors 4500ms). Tap to dismiss earlier.
 *   - Stacks up to 4 visible at once; older toasts auto-expire so the
 *     stack height stays bounded.
 */

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Animated, AccessibilityInfo } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCircle, AlertCircle, Info } from 'lucide-react-native'
import { useTranslation } from '@/lib/i18n'

// ─── Public API ────────────────────────────────────────────────────────────

export type LocalizedMessage = string | { de: string; en: string }

type ToastKind = 'success' | 'error' | 'info'

interface ToastEvent {
  id: number
  kind: ToastKind
  message: LocalizedMessage
  durationMs: number
}

type Listener = (e: ToastEvent) => void
const _listeners = new Set<Listener>()
let _counter = 0

function emit(kind: ToastKind, message: LocalizedMessage, durationMs?: number) {
  const id = ++_counter
  const defaults: Record<ToastKind, number> = { success: 2800, info: 2800, error: 4500 }
  const event: ToastEvent = { id, kind, message, durationMs: durationMs ?? defaults[kind] }
  for (const l of _listeners) l(event)
}

export const toast = {
  success: (msg: LocalizedMessage, durationMs?: number) => emit('success', msg, durationMs),
  error: (msg: LocalizedMessage, durationMs?: number) => emit('error', msg, durationMs),
  info: (msg: LocalizedMessage, durationMs?: number) => emit('info', msg, durationMs),
}

// ─── Host ──────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 4

export function ToastHost() {
  const insets = useSafeAreaInsets()
  const { locale } = useTranslation()
  const [items, setItems] = useState<ToastEvent[]>([])

  useEffect(() => {
    const listener: Listener = (e) => {
      setItems((prev) => {
        // Cap the stack height — drop oldest first.
        const next = [...prev, e]
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
      })
    }
    _listeners.add(listener)
    return () => {
      _listeners.delete(listener)
    }
  }, [])

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id))

  if (items.length === 0) return null

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 99999,
      }}
    >
      {items.map((evt) => (
        <ToastItem key={evt.id} event={evt} locale={locale} onDismiss={() => dismiss(evt.id)} />
      ))}
    </View>
  )
}

// ─── Single toast item ─────────────────────────────────────────────────────

function ToastItem({
  event,
  locale,
  onDismiss,
}: {
  event: ToastEvent
  locale: 'de' | 'en'
  onDismiss: () => void
}) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(-12)).current
  const scale = useRef(new Animated.Value(0.96)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }),
    ]).start()

    // Accessibility: announce the toast for screen readers.
    const text = resolve(event.message, locale)
    try {
      AccessibilityInfo.announceForAccessibility(text)
    } catch {
      // Older RN versions — ignore.
    }

    const t = setTimeout(() => exitAndDismiss(), event.durationMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id])

  const exitAndDismiss = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 180, useNativeDriver: true }),
    ]).start(() => onDismiss())
  }

  const palette = PALETTES[event.kind]
  const text = resolve(event.message, locale)
  const Icon = palette.Icon

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }, { scale }],
        marginHorizontal: 16,
        marginTop: 8,
        maxWidth: 520,
        width: '92%',
      }}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Pressable onPress={exitAndDismiss} accessibilityLabel={text}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            backgroundColor: palette.bg,
            borderRadius: 14,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderLeftWidth: 4,
            borderLeftColor: palette.border,
            shadowColor: '#0F172A',
            shadowOpacity: 0.12,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 6,
          }}
        >
          <View style={{ marginTop: 1, marginRight: 10 }}>
            <Icon size={20} color={palette.icon} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: '600',
              color: palette.text,
              lineHeight: 18,
            }}
            numberOfLines={4}
          >
            {text}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolve(msg: LocalizedMessage, locale: 'de' | 'en'): string {
  if (typeof msg === 'string') return msg
  return locale === 'de' ? msg.de : msg.en
}

const PALETTES: Record<
  ToastKind,
  { bg: string; border: string; icon: string; text: string; Icon: React.ComponentType<{ size?: number; color?: string }> }
> = {
  success: {
    bg: '#DCFCE7',
    border: '#10B981',
    icon: '#059669',
    text: '#064E3B',
    Icon: CheckCircle,
  },
  error: {
    bg: '#FEE2E2',
    border: '#EF4444',
    icon: '#DC2626',
    text: '#7F1D1D',
    Icon: AlertCircle,
  },
  info: {
    bg: '#DBEAFE',
    border: '#0064E0',
    icon: '#0064E0',
    text: '#1E3A8A',
    Icon: Info,
  },
}
