/**
 * Shared building blocks for the settings sub-pages — a phone-sized port
 * of the webapp's /dashboard/settings/<page> design language:
 *
 *   - "‹ EINSTELLUNGEN" back link (10px, black, uppercase, slate-400)
 *   - 48px coloured icon tile + brand-blue H1 + slate-500 subtitle
 *   - white `rounded-3xl border-slate-100` cards with an optional
 *     title/description header separated by a slate-100 rule
 *   - toggle rows: slate-50 icon tile, slate-800 label, slate-500 hint
 *   - uppercase slate-500 field labels + slate-50 inputs
 *
 * Pure presentation — no data access lives here.
 */

import React from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  type StyleProp,
  type ViewStyle,
  type TextInputProps,
} from 'react-native'
import { ChevronLeft, Check, AlertTriangle } from 'lucide-react-native'

import { AppHeader } from '@/components/AppHeader'
import { Screen } from '@/components/Screen'
import { useSafeBack } from '@/lib/use-safe-back'

// Tailwind palette used by the webapp settings pages.
export const SC = {
  brand: '#0064E0',
  blue600: '#2563EB',
  blue50: '#EFF6FF',
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
  red500: '#EF4444',
  red600: '#DC2626',
  emerald500: '#10B981',
  amber500: '#F59E0B',
  amber700: '#B45309',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  cyan500: '#06B6D4',
  pageBg: '#F8FAFC',
} as const

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>

/** AppHeader + safe-area Screen + scroll body used by every settings sub-page. */
export function SettingsShell({
  children,
  background = SC.pageBg,
}: {
  children: React.ReactNode
  background?: string
}) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background={background} noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 64 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Screen>
    </View>
  )
}

/** Web: back link + icon tile + `text-3xl font-bold text-[#0064E0]` title. */
export function SettingsPageHeader({
  title,
  subtitle,
  icon: Icon,
  tileColor = SC.brand,
  backLabel,
  backFallback = '/(tabs)/settings',
  right,
}: {
  title: string
  subtitle?: string
  icon?: IconType
  tileColor?: string
  backLabel: string
  backFallback?: string
  right?: React.ReactNode
}) {
  const goBack = useSafeBack(backFallback)
  return (
    <View style={{ marginBottom: 24 }}>
      <Pressable
        onPress={goBack}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 12 }}
      >
        <ChevronLeft size={12} color={SC.slate400} strokeWidth={3} />
        <Text
          style={{
            marginLeft: 6,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: SC.slate400,
          }}
        >
          {backLabel}
        </Text>
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {Icon ? (
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: tileColor,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16,
              shadowColor: '#0F172A',
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 3,
            }}
          >
            <Icon size={24} color="#FFFFFF" />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 26, fontWeight: '700', color: SC.brand, lineHeight: 31, letterSpacing: -0.3 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ fontSize: 14, color: SC.slate500, marginTop: 4, lineHeight: 20 }}>{subtitle}</Text>
          ) : null}
        </View>
        {right ? <View style={{ marginLeft: 12 }}>{right}</View> : null}
      </View>
    </View>
  )
}

/** Web: `bg-white rounded-3xl border border-slate-100 shadow-sm` with optional header. */
export function SectionCard({
  title,
  description,
  icon: Icon,
  badge,
  children,
  padded,
  dimmed,
  style,
}: {
  title?: string
  description?: string
  icon?: IconType
  badge?: string
  children?: React.ReactNode
  /** Wrap the body in the web's `p-6` padding (otherwise rows bring their own). */
  padded?: boolean
  /** Web `opacity-70` for read-only blocks. */
  dimmed?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const hasBody = children !== undefined && children !== null && children !== false
  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          borderWidth: 1,
          borderColor: SC.slate100,
          overflow: 'hidden',
          marginBottom: 20,
          opacity: dimmed ? 0.75 : 1,
        },
        style,
      ]}
    >
      {title ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingVertical: 18,
            borderBottomWidth: hasBody && !padded ? 1 : 0,
            borderBottomColor: SC.slate100,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {Icon ? (
              <View style={{ marginRight: 10 }}>
                <Icon size={18} color={SC.blue600} />
              </View>
            ) : null}
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: SC.slate900 }}>{title}</Text>
            {badge ? <Badge label={badge} /> : null}
          </View>
          {description ? (
            <Text style={{ fontSize: 13, color: SC.slate500, marginTop: 4, lineHeight: 19 }}>{description}</Text>
          ) : null}
        </View>
      ) : null}
      {hasBody ? (
        padded ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: title ? 0 : 20 }}>{children}</View>
        ) : (
          children
        )
      ) : null}
    </View>
  )
}

/** Small uppercase pill (`text-[10px] font-black uppercase bg-slate-100`). */
export function Badge({ label, tone = 'slate' }: { label: string; tone?: 'slate' | 'blue' | 'emerald' | 'red' }) {
  const tones = {
    slate: { bg: SC.slate100, fg: SC.slate500 },
    blue: { bg: SC.blue50, fg: SC.blue600 },
    emerald: { bg: '#ECFDF5', fg: '#059669' },
    red: { bg: '#FEF2F2', fg: SC.red600 },
  }[tone]
  return (
    <View style={{ backgroundColor: tones.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: tones.fg }}>
        {label}
      </Text>
    </View>
  )
}

/** Web ToggleRow: slate-50 icon tile, label + hint, blue switch. */
export function ToggleRow({
  icon: Icon,
  label,
  desc,
  value,
  onValueChange,
  disabled,
  last,
}: {
  icon?: IconType
  label: string
  desc?: string
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
  last?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: SC.slate50,
      }}
    >
      {Icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 12,
            backgroundColor: SC.slate50,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Icon size={16} color={SC.slate500} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: SC.slate800 }}>{label}</Text>
        {desc ? <Text style={{ fontSize: 12, color: SC.slate500, marginTop: 2, lineHeight: 17 }}>{desc}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: SC.blue600, false: SC.slate200 }}
        ios_backgroundColor={SC.slate200}
        thumbColor="#FFFFFF"
      />
    </View>
  )
}

/** Label-left / control-right row (web `Row`). */
export function SettingsRow({
  label,
  desc,
  children,
  last,
}: {
  label: string
  desc?: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: SC.slate50,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: SC.slate700 }}>{label}</Text>
        {desc ? <Text style={{ fontSize: 12, color: SC.slate500, marginTop: 2 }}>{desc}</Text> : null}
      </View>
      {children}
    </View>
  )
}

/** Web `block text-xs font-bold uppercase tracking-wider text-slate-500`. */
export function FieldLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: SC.slate500,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  )
}

/** Web `text-sm bg-slate-50 px-3 py-2 rounded-lg border border-slate-200`. */
export function SettingsInput({
  disabled,
  style,
  multiline,
  ...rest
}: Omit<TextInputProps, 'style' | 'editable'> & { disabled?: boolean; style?: StyleProp<any> }) {
  return (
    <TextInput
      editable={!disabled}
      multiline={multiline}
      placeholderTextColor={SC.slate300}
      style={[
        {
          minHeight: 44,
          backgroundColor: disabled ? SC.slate100 : SC.slate50,
          borderWidth: 1,
          borderColor: SC.slate200,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: multiline ? 10 : 0,
          fontSize: 14,
          fontWeight: '500',
          color: disabled ? SC.slate500 : SC.slate700,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        style,
      ]}
      {...rest}
    />
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  sub?: string
  leading?: string
}

/** Web option buttons: `border-2 rounded-2xl`, active `border-blue-600 bg-blue-50`. */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
  columns = 2,
  showCheck,
}: {
  options: ChoiceOption<T>[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
  columns?: number
  showCheck?: boolean
}) {
  const basis = `${Math.floor(100 / Math.max(1, columns)) - 2}%` as const
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              if (!disabled) onChange(opt.value)
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!disabled }}
            style={{
              width: basis as any,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: active ? SC.blue600 : SC.slate100,
              backgroundColor: active ? SC.blue50 : '#FFFFFF',
            }}
          >
            {opt.leading ? <Text style={{ fontSize: 22, marginRight: 10 }}>{opt.leading}</Text> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: SC.slate800 }} numberOfLines={1}>
                {opt.label}
              </Text>
              {opt.sub ? (
                <Text style={{ fontSize: 11, color: SC.slate500, marginTop: 1 }} numberOfLines={1}>
                  {opt.sub}
                </Text>
              ) : null}
            </View>
            {showCheck && active ? <Check size={16} color={SC.blue600} /> : null}
          </Pressable>
        )
      })}
    </View>
  )
}

/** Amber footer note (web `bg-amber-50/40 text-amber-700`). */
export function AmberNote({ children }: { children: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: 'rgba(255,251,235,0.6)',
        borderTopWidth: 1,
        borderTopColor: SC.slate100,
      }}
    >
      <AlertTriangle size={15} color={SC.amber700} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, marginLeft: 8, fontSize: 12, lineHeight: 17, color: SC.amber700 }}>{children}</Text>
    </View>
  )
}

/** Centered muted helper line at the bottom of a page. */
export function FootNote({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 11, color: SC.slate400, textAlign: 'center', lineHeight: 16, marginTop: 4, paddingHorizontal: 12 }}>
      {children}
    </Text>
  )
}
