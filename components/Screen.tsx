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
  type ViewStyle,
  type StyleProp,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
  const inner = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={`flex-1 ${className}`}
      style={style}
    >
      {children}
    </KeyboardAvoidingView>
  )

  // Only apply top safe-area when no AppHeader sits above us (auth screens,
  // change-password, onboarding). The (tabs) layout renders its own header
  // which already accounts for the inset.
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: background }} edges={['left', 'right']}>
      {noTapToDismiss ? inner : (
        <Pressable onPress={Keyboard.dismiss} className="flex-1">
          {inner}
        </Pressable>
      )}
    </SafeAreaView>
  )
}
