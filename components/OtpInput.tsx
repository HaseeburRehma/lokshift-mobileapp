/**
 * 6-digit OTP input with auto-advance + back-tab on delete, mirroring
 * the webapp's OtpInput. Renders as 3+3 boxes with a divider.
 *
 * The boxes are individual RN <TextInput>s tied to a controlled string
 * value held by the parent. We never store digits in local state — it
 * derives entirely from `value`, so the parent stays the single source
 * of truth (same approach as the webapp).
 */

import React, { useRef } from 'react'
import { TextInput, View, type TextInput as TextInputType } from 'react-native'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function OtpInput({ value, onChange, disabled }: OtpInputProps) {
  const refs = useRef<Array<TextInputType | null>>([])
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '')

  const updateDigit = (index: number, raw: string) => {
    // Only honour the last digit typed — handles paste and fast typing.
    const clean = raw.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = clean
    onChange(next.join(''))
    if (clean && index < 5) refs.current[index + 1]?.focus()
  }

  const handleKeyPress = (index: number, key: string) => {
    if (key !== 'Backspace') return
    if (digits[index]) {
      // Clear current cell
      const next = [...digits]
      next[index] = ''
      onChange(next.join(''))
    } else if (index > 0) {
      // Move back + clear previous
      const next = [...digits]
      next[index - 1] = ''
      onChange(next.join(''))
      refs.current[index - 1]?.focus()
    }
  }

  // Inline styles because some NativeWind compilers strip per-element
  // borderColor variants on focus — TextInput in particular doesn't get
  // a CSS pseudo-focus class.
  const inputProps = (i: number) => ({
    ref: (el: TextInputType | null) => { refs.current[i] = el },
    value: digits[i],
    keyboardType: 'number-pad' as const,
    inputMode: 'numeric' as const,
    maxLength: 1,
    editable: !disabled,
    onChangeText: (v: string) => updateDigit(i, v),
    onKeyPress: ({ nativeEvent }: { nativeEvent: { key: string } }) => handleKeyPress(i, nativeEvent.key),
    selectionColor: '#0064E0',
    style: {
      width: 48, height: 56,
      borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12,
      textAlign: 'center' as const,
      fontSize: 22, fontWeight: '700' as const, color: '#111827',
      backgroundColor: '#fff',
    },
  })

  return (
    <View className="flex-row items-center justify-center">
      <View className="flex-row gap-2">
        {[0, 1, 2].map((i) => <TextInput key={i} {...inputProps(i)} />)}
      </View>
      <View className="w-3 h-0.5 bg-gray-300 mx-3 rounded-full" />
      <View className="flex-row gap-2">
        {[3, 4, 5].map((i) => <TextInput key={i} {...inputProps(i)} />)}
      </View>
    </View>
  )
}
