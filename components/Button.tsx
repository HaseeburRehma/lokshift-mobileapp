/**
 * Brand-styled pressable button. Three variants (primary / secondary /
 * ghost), three sizes. Secondary swaps to dark surface in dark mode so
 * it remains visible.
 */

import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { useTheme } from '@/lib/theme'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: React.ReactNode
  style?: StyleProp<ViewStyle>
}

const HEIGHTS: Record<Size, string> = { sm: 'h-9', md: 'h-12', lg: 'h-14' }
const PADDINGS: Record<Size, string> = { sm: 'px-3', md: 'px-5', lg: 'px-6' }
const TEXT_SIZES: Record<Size, string> = {
  sm: 'text-[13px]',
  md: 'text-[15px]',
  lg: 'text-[16px]',
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'
  const isDisabled = disabled || loading

  const baseClass = `flex-row items-center justify-center rounded-2xl ${HEIGHTS[size]} ${PADDINGS[size]}`

  // Variant background uses inline style so dark mode can swap colors
  // without relying on `dark:` className resolution.
  const variantStyle: ViewStyle = (() => {
    if (variant === 'primary') return { backgroundColor: '#0064E0' }
    if (variant === 'secondary') {
      return {
        backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
        borderWidth: 1,
        borderColor: isDark ? '#334155' : '#E5E7EB',
      }
    }
    return { backgroundColor: 'transparent' }
  })()

  const labelColor = (() => {
    if (variant === 'primary') return '#FFFFFF'
    if (variant === 'secondary') return isDark ? '#F8FAFC' : '#111827'
    return '#0064E0'
  })()

  return (
    <Pressable
      disabled={isDisabled}
      className={`${baseClass} ${isDisabled ? 'opacity-50' : ''} active:opacity-80`}
      style={[variantStyle, style]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#0064E0'} />
      ) : (
        <>
          {leftIcon ? <View style={{ marginRight: 8 }}>{leftIcon}</View> : null}
          <Text className={`${TEXT_SIZES[size]} font-bold`} style={{ color: labelColor }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  )
}
