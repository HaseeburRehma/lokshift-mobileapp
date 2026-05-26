/**
 * Labelled text input — keeps every form looking identical. Reads
 * useTheme() so the field surface and text colors swap in dark mode.
 * Errors stay red in both modes.
 */

import React from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'

import { useTheme } from '@/lib/theme'

interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  label: string
  leftIcon?: React.ReactNode
  error?: string | null
}

export function FormField({ label, leftIcon, error, ...rest }: FormFieldProps) {
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'

  const labelColor = error
    ? (isDark ? '#FCA5A5' : '#EF4444')
    : (isDark ? '#94A3B8' : '#6B7280')
  const fieldBg = isDark ? '#0F172A' : '#F9FAFB'
  const borderColor = error
    ? (isDark ? '#7F1D1D' : '#FECACA')
    : (isDark ? '#1F2937' : '#F1F5F9')
  const inputColor = isDark ? '#F8FAFC' : '#111827'
  const placeholderColor = isDark ? '#475569' : '#9CA3AF'

  return (
    <View className="space-y-1.5">
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginLeft: 4,
          color: labelColor,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: fieldBg,
          borderWidth: 2,
          borderColor,
          borderRadius: 16,
          height: 56,
          paddingHorizontal: 16,
        }}
      >
        {leftIcon ? <View style={{ marginRight: 12 }}>{leftIcon}</View> : null}
        <TextInput
          style={{ flex: 1, fontSize: 15, fontWeight: '600', color: inputColor }}
          placeholderTextColor={placeholderColor}
          {...rest}
        />
      </View>
      {error ? (
        <Text style={{ fontSize: 12, color: '#EF4444', marginLeft: 4 }}>{error}</Text>
      ) : null}
    </View>
  )
}
