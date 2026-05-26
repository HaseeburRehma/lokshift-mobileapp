/**
 * Reusable page header. Title color stays brand blue (works on both
 * themes); subtitle muted color shifts between slate-400 and slate-500
 * so it stays legible.
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'

import { useTheme } from '@/lib/theme'

interface PageHeaderProps {
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  rightSlot?: React.ReactNode
}

export function PageHeader({ title, subtitle, showBack, onBack, rightSlot }: PageHeaderProps) {
  const router = useRouter()
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'
  const subtitleColor = isDark ? '#64748B' : '#94A3B8'

  // Guard against an empty back-stack — when the user lands on a screen
  // via deep link, router.back() throws "GO_BACK was not handled". The
  // safest universal fallback is the home tab.
  const goBack = () => {
    if (onBack) {
      onBack()
      return
    }
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/home')
  }

  return (
    <View style={{ marginBottom: 24 }}>
      {showBack && (
        <Pressable onPress={goBack} style={{ marginLeft: -8, marginBottom: 8, padding: 8, alignSelf: 'flex-start' }}>
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
      )}
      <View className="flex-row items-start justify-between">
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#0064E0', fontSize: 32, fontWeight: '700', letterSpacing: -0.5, lineHeight: 34 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: subtitleColor, fontSize: 14, fontWeight: '500', marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightSlot ? <View style={{ marginLeft: 12 }}>{rightSlot}</View> : null}
      </View>
    </View>
  )
}
