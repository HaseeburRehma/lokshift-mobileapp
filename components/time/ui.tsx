/**
 * Shared building blocks for the time-tracking screens — native ports of
 * the webapp's Tailwind/shadcn look (slate neutrals, brand #0064E0,
 * `rounded-2xl border-slate-200` cards, uppercase `font-black` chips).
 * Pure presentation: no data access in here.
 */

import React from 'react'
import { View, Text, Pressable, ActivityIndicator, Switch, Platform, type StyleProp, type ViewStyle } from 'react-native'
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native'

import { Card } from '@/components/Card'
import { entryStatusLabel, type EntryStatus } from '@/lib/times/entry-status'

/** Tailwind palette values used by the webapp. */
export const C = {
  brand: '#0064E0',
  brandDark: '#0050B4',
  blue50: '#EFF6FF',
  blue100: '#DBEAFE',
  blue200: '#BFDBFE',
  blue600: '#2563EB',
  blue700: '#1D4ED8',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
  gray100: '#F3F4F6',
  gray400: '#9CA3AF',
  emerald50: '#ECFDF5',
  emerald100: '#D1FAE5',
  emerald200: '#A7F3D0',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065F46',
  amber50: '#FFFBEB',
  amber200: '#FDE68A',
  amber600: '#D97706',
  amber700: '#B45309',
  amber800: '#92400E',
  amber900: '#78350F',
  red50: '#FEF2F2',
  red200: '#FECACA',
  red400: '#F87171',
  red500: '#EF4444',
  red600: '#DC2626',
  red700: '#B91C1C',
  indigo50: '#EEF2FF',
  indigo200: '#C7D2FE',
  indigo700: '#4338CA',
  violet100: '#EDE9FE',
  violet600: '#7C3AED',
  violet700: '#6D28D9',
  sky50: '#F0F9FF',
  sky600: '#0284C7',
  yellow50: '#FEFCE8',
} as const

export interface Tone {
  bg: string
  fg: string
  border?: string
}

/** Same mapping as the webapp's ENTRY_STATUS_STYLE. */
export const ENTRY_STATUS_TONE: Record<EntryStatus, Tone> = {
  planned: { bg: '#F5F3FF', fg: '#6D28D9', border: '#DDD6FE' },
  running: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  draft: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  submitted: { bg: '#F0F9FF', fg: '#0369A1', border: '#BAE6FD' },
  approved: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
}

type ToneName = 'red' | 'amber' | 'slate' | 'slateSoft' | 'violet' | 'indigo' | 'emerald' | 'blue'

export const TONE: Record<ToneName, Tone> = {
  red: { bg: C.red50, fg: C.red700, border: C.red200 },
  amber: { bg: C.amber50, fg: C.amber700, border: C.amber200 },
  slate: { bg: C.slate100, fg: C.slate600, border: C.slate100 },
  slateSoft: { bg: C.slate50, fg: C.slate600, border: C.slate200 },
  violet: { bg: C.violet100, fg: C.violet700, border: C.violet100 },
  indigo: { bg: C.indigo50, fg: C.indigo700, border: C.indigo200 },
  emerald: { bg: C.emerald50, fg: C.emerald700, border: C.emerald200 },
  blue: { bg: C.blue50, fg: C.blue700, border: C.blue200 },
}

// ─── Chips ────────────────────────────────────────────────────────────────

export function Pill({
  label,
  tone,
  icon,
  size = 'sm',
}: {
  label: string
  tone: Tone
  icon?: React.ReactNode
  size?: 'sm' | 'lg'
}) {
  const lg = size === 'lg'
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: tone.bg,
        borderColor: tone.border ?? tone.bg,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: lg ? 14 : 9,
        paddingVertical: lg ? 5 : 3,
      }}
    >
      {icon ? <View style={{ marginRight: 4 }}>{icon}</View> : null}
      <Text
        style={{
          fontSize: lg ? 11 : 10,
          fontWeight: '900',
          color: tone.fg,
          textTransform: 'uppercase',
          letterSpacing: lg ? 1.4 : 0.6,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

export function EntryStatusPill({
  status,
  locale,
  size,
  icon,
}: {
  status: EntryStatus
  locale: 'de' | 'en'
  size?: 'sm' | 'lg'
  icon?: React.ReactNode
}) {
  return <Pill label={entryStatusLabel(status, locale)} tone={ENTRY_STATUS_TONE[status]} size={size} icon={icon} />
}

// ─── Surfaces ─────────────────────────────────────────────────────────────

/** `bg-white rounded-2xl border border-slate-200` — wraps the shared Card. */
export function SurfaceCard({
  children,
  style,
  padding = 16,
  radius = 16,
  borderColor = C.slate200,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  padding?: number
  radius?: number
  borderColor?: string
}) {
  return <Card style={[{ borderColor, borderRadius: radius, padding }, style]}>{children}</Card>
}

export function IconTile({
  icon,
  bg = C.blue50,
  size = 40,
  radius = 12,
}: {
  icon: React.ReactNode
  bg?: string
  size?: number
  radius?: number
}) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </View>
  )
}

export function SectionTitle({ title, count, style }: { title: string; count?: number; style?: StyleProp<ViewStyle> }) {
  const has = (count ?? 0) > 0
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }, style]}>
      <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate900, letterSpacing: -0.3, flexShrink: 1 }}>{title}</Text>
      {count != null ? (
        <View
          style={{
            marginLeft: 8,
            minWidth: 24,
            height: 24,
            paddingHorizontal: 7,
            borderRadius: 12,
            backgroundColor: has ? C.blue600 : C.slate100,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '900', color: has ? '#FFFFFF' : C.slate400 }}>{String(count)}</Text>
        </View>
      ) : null}
    </View>
  )
}

/** Dashed empty state (`border-dashed border-slate-200`). */
export function EmptyState({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: C.slate200,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 24,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 13, fontWeight: '600', color: C.slate400, textAlign: 'center' }}>{text}</Text>
    </View>
  )
}

/** Uppercase micro label (`text-[10px] font-black uppercase tracking-widest text-slate-400`). */
export function MicroLabel({ children, color = C.slate400, style }: { children: React.ReactNode; color?: string; style?: any }) {
  return (
    <Text style={[{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color }, style]}>
      {children}
    </Text>
  )
}

// ─── Buttons ──────────────────────────────────────────────────────────────

type OutlineTone = 'slate' | 'blue' | 'emerald' | 'red' | 'amber'
const OUTLINE: Record<OutlineTone, { border: string; fg: string }> = {
  slate: { border: C.slate200, fg: C.slate700 },
  blue: { border: C.blue200, fg: C.blue700 },
  emerald: { border: C.emerald200, fg: C.emerald700 },
  red: { border: C.red200, fg: C.red600 },
  amber: { border: C.amber200, fg: C.amber800 },
}

/** shadcn `variant="outline"` button — `h-10 rounded-xl font-bold`. */
export function OutlineButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  tone = 'slate',
  badge,
  style,
  height = 40,
  uppercase,
}: {
  label: string
  icon?: React.ReactNode
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  tone?: OutlineTone
  badge?: number
  style?: StyleProp<ViewStyle>
  height?: number
  uppercase?: boolean
}) {
  const t = OUTLINE[tone]
  const off = disabled || loading
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={label} style={style}>
      <View
        style={{
          height,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: '#FFFFFF',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color={t.fg} style={{ marginRight: 8 }} /> : icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
        <Text
          style={{
            fontSize: uppercase ? 11 : 13,
            fontWeight: uppercase ? '900' : '800',
            letterSpacing: uppercase ? 1.2 : 0,
            textTransform: uppercase ? 'uppercase' : 'none',
            color: t.fg,
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        {(badge ?? 0) > 0 ? (
          <View style={{ marginLeft: 8, minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: C.emerald600, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFFFFF' }}>{String(badge)}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Filled button (`bg-[#0064E0] font-black uppercase text-[11px] tracking-widest`). */
export function SolidButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  color = C.brand,
  height = 44,
  uppercase = true,
  style,
}: {
  label: string
  icon?: React.ReactNode
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  color?: string
  height?: number
  uppercase?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const off = disabled || loading
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityLabel={label} style={style}>
      <View
        style={{
          height,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: color,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: off ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} /> : icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
        <Text
          style={{
            fontSize: uppercase ? 11 : 15,
            fontWeight: '900',
            letterSpacing: uppercase ? 1.4 : 0,
            textTransform: uppercase ? 'uppercase' : 'none',
            color: '#FFFFFF',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/** Ghost text button (`variant="ghost"`). */
export function GhostButton({
  label,
  icon,
  onPress,
  disabled,
  color = C.slate500,
  style,
  uppercase,
}: {
  label: string
  icon?: React.ReactNode
  onPress: () => void
  disabled?: boolean
  color?: string
  style?: StyleProp<ViewStyle>
  uppercase?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} style={style}>
      <View style={{ height: 44, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
        {icon ? <View style={{ marginRight: 8 }}>{icon}</View> : null}
        <Text
          style={{
            fontSize: uppercase ? 11 : 13,
            fontWeight: uppercase ? '900' : '700',
            letterSpacing: uppercase ? 1.4 : 0,
            textTransform: uppercase ? 'uppercase' : 'none',
            color,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}

/** Square icon action (`h-8 w-8 rounded-lg bg-*-50 text-*-500`). */
export function IconAction({
  icon,
  bg,
  onPress,
  disabled,
  label,
}: {
  icon: React.ReactNode
  bg: string
  onPress: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
        {icon}
      </View>
    </Pressable>
  )
}

// ─── Form bits ────────────────────────────────────────────────────────────

/** Toggle row (`p-5 rounded-2xl bg-slate-50/50 border-2 border-gray-100`). */
export function ToggleCard({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  activeColor = C.brand,
  tone = 'default',
}: {
  icon?: React.ReactNode
  title: string
  subtitle?: string
  value: boolean
  onValueChange: (v: boolean) => void
  activeColor?: string
  tone?: 'default' | 'emerald'
}) {
  const emerald = tone === 'emerald'
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 16,
        borderWidth: emerald ? 1 : 2,
        borderColor: emerald ? C.emerald100 : C.gray100,
        backgroundColor: emerald ? C.emerald50 : 'rgba(248,250,252,0.6)',
        paddingHorizontal: 16,
        paddingVertical: emerald ? 12 : 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
        {icon ? <View style={{ marginRight: 12 }}>{icon}</View> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: emerald ? '800' : '900', color: emerald ? C.emerald800 : '#111827' }}>{title}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: C.gray400, marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D1D5DB', true: activeColor }}
        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
      />
    </View>
  )
}

/** Modal header bar — close (X) left, uppercase title, optional right slot. */
export function SheetHeader({ title, onClose, right, closeLabel = 'Close' }: { title: string; onClose: () => void; right?: React.ReactNode; closeLabel?: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.gray100,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={closeLabel} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
        <X size={22} color={C.blue600} />
      </Pressable>
      <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '900', letterSpacing: -0.2, textTransform: 'uppercase', color: '#111827' }} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 40, alignItems: 'flex-end' }}>{right}</View>
    </View>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────

/** Prev / page numbers / next — numbers windowed so they fit a phone row. */
export function Pagination({
  page,
  totalPages,
  onChange,
  labels,
}: {
  page: number
  totalPages: number
  onChange: (p: number) => void
  /** When given, renders "← Zurück" / "Weiter →" text buttons instead of chevrons. */
  labels?: { prev: string; next: string }
}) {
  if (totalPages <= 1 && !labels) return null
  const windowSize = 5
  let start = Math.max(1, page - Math.floor(windowSize / 2))
  const end = Math.min(totalPages, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  const pages: number[] = []
  for (let i = start; i <= end; i++) pages.push(i)

  const nav = (dir: -1 | 1) => {
    const disabled = dir < 0 ? page <= 1 : page >= totalPages
    if (labels) {
      return (
        <Pressable onPress={() => onChange(page + dir)} disabled={disabled} hitSlop={6}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: C.slate600, opacity: disabled ? 0.4 : 1, paddingHorizontal: 6, paddingVertical: 6 }}>
            {dir < 0 ? `← ${labels.prev}` : `${labels.next} →`}
          </Text>
        </Pressable>
      )
    }
    return (
      <Pressable onPress={() => onChange(page + dir)} disabled={disabled} hitSlop={6}>
        <View style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.slate200, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
          {dir < 0 ? <ChevronLeft size={16} color={C.slate600} /> : <ChevronRight size={16} color={C.slate600} />}
        </View>
      </Pressable>
    )
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: labels ? 'space-between' : 'flex-end' }}>
      {nav(-1)}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 }}>
        {pages.map((p) => {
          const active = p === page
          return (
            <Pressable key={p} onPress={() => onChange(p)}>
              <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? (labels ? C.blue600 : C.slate900) : 'transparent' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : C.slate600 }}>{String(p)}</Text>
              </View>
            </Pressable>
          )
        })}
      </View>
      {nav(1)}
    </View>
  )
}

/** Centered back-nav bar used by the webapp's mobile layouts (round back button + title). */
export function BackNavBar({ title, onBack, backLabel }: { title: string; onBack: () => void; backLabel: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        paddingHorizontal: 56,
        borderBottomWidth: 1,
        borderColor: C.slate100,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Pressable onPress={onBack} accessibilityLabel={backLabel} hitSlop={10} style={{ position: 'absolute', left: 16 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.slate200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={16} color={C.blue600} />
        </View>
      </Pressable>
      <Text style={{ fontSize: 17, fontWeight: '700', color: C.slate900, letterSpacing: -0.3 }} numberOfLines={1}>
        {title}
      </Text>
    </View>
  )
}
