/**
 * Standard page wrapper — applies safe-area insets + a white background +
 * dismisses the keyboard when the user taps outside an input. Use this
 * for every screen so layout assumptions stay consistent.
 */

import React from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  View,
  useWindowDimensions,
  type ViewStyle,
  type StyleProp,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Phone-width cap. On iPad / Mac Catalyst / iOS-on-Mac the window can be
// 1024+px wide; content rendered full-width looks stretched and hard to scan.
// Capping at ~540px keeps a phone-style reading column on wide displays and
// is a no-op on real phones.
const PHONE_MAX_WIDTH = 540

interface ScreenProps {
  children: React.ReactNode
  /** Tailwind extension classes for the inner container. */
  className?: string
  /** Override the safe-area background (default white). */
  background?: string
  /** Disable keyboard-dismiss on tap (useful when the children manage focus). */
  noTapToDismiss?: boolean
  style?: StyleProp<ViewStyle>
}

export function Screen({
  children,
  className = '',
  background = '#FFFFFF',
  noTapToDismiss,
  style,
}: ScreenProps) {
  const { width } = useWindowDimensions()
  const isWide = width > PHONE_MAX_WIDTH

  const inner = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={`flex-1 ${className}`}
      style={style}
    >
      {isWide ? (
        <View style={{ flex: 1, width: PHONE_MAX_WIDTH, alignSelf: 'center' }}>
          {children}
        </View>
      ) : (
        children
      )}
    </KeyboardAvoidingView>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['top', 'left', 'right']}>
      {noTapToDismiss ? inner : (
        <Pressable onPress={Keyboard.dismiss} className="flex-1">
          {inner}
        </Pressable>
      )}
    </SafeAreaView>
  )
}
