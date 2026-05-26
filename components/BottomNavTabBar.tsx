/**
 * Custom bottom-nav tab bar — mirrors the webapp's BottomNav and
 * switches palette with the active theme.
 */

import React from 'react'
import { View, Text, Pressable, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/lib/theme'

type BottomTabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> }
  descriptors: Record<string, { options: any }>
  navigation: {
    emit: (e: { type: string; target: string; canPreventDefault?: boolean }) => { defaultPrevented?: boolean }
    navigate: (name: never) => void
  }
}

export function BottomNavTabBar(props: any) {
  const { state, descriptors, navigation } = props as BottomTabBarProps
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const _isPhone = width < 768
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'

  const surfaceBg = isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.96)'
  const borderTop = isDark ? '#1F2937' : '#F1F5F9'
  const activeColor = '#2563EB'
  const inactiveColor = isDark ? '#64748B' : '#94A3B8'
  const focusedPill = isDark ? 'rgba(30,64,175,0.25)' : 'rgba(239,246,255,0.6)'
  const badgeBorder = isDark ? '#0F172A' : '#FFFFFF'

  return (
    <View
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: 80 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: borderTop,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: isDark ? 0.4 : 0.05,
        shadowRadius: 20,
        elevation: 16,
        backgroundColor: surfaceBg,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {state.routes.map((route: { key: string; name: string }, index: number) => {
          const focused = state.index === index
          const { options } = descriptors[route.key]
          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options.title ?? route.name)

          const Icon = (options.tabBarIcon ?? (() => null)) as (props: { focused: boolean; color: string; size: number }) => React.ReactNode
          const badge = (options as any).tabBarBadge as string | number | undefined

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name as never)
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' }}
              android_ripple={{ borderless: false, color: 'rgba(0,100,224,0.08)' }}
            >
              {focused && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 6, bottom: 6, left: 4, right: 4,
                    backgroundColor: focusedPill,
                    borderRadius: 18,
                  }}
                />
              )}
              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <View style={{ position: 'relative' }}>
                  {Icon({
                    focused,
                    color: focused ? activeColor : inactiveColor,
                    size: focused ? 26 : 24,
                  })}
                  {badge !== undefined && badge !== 0 && (
                    <View
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        height: 16, minWidth: 16, paddingHorizontal: 4,
                        backgroundColor: '#EF4444', borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: 2, borderColor: badgeBorder,
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                        {typeof badge === 'number' && badge > 9 ? '9+' : String(badge)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                    color: focused ? activeColor : inactiveColor,
                    transform: [{ translateY: focused ? -2 : 0 }],
                  }}
                >
                  {label}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
