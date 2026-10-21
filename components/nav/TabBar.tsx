/**
 * Bottom tab bar — mobile port of the webapp's components/layout/BottomNav:
 * 80px white bar with top border, five equal cells, active cell tinted
 * blue-50, active icon/label blue-600 (label lifted 2px), inactive
 * slate-400, uppercase 10px labels and a red "9+" badge on the icon.
 *
 * Labels shrink to fit one line so the web wording ("Live-Betrieb",
 * "Einstellungen") fits on narrow phones. Theme-aware like the rest of
 * the chrome.
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useTheme } from '@/lib/theme'

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> }
  descriptors: Record<string, { options: any }>
  navigation: {
    emit: (e: { type: string; target: string; canPreventDefault?: boolean }) => { defaultPrevented?: boolean }
    navigate: (name: never) => void
  }
}

export function TabBar(props: any) {
  const { state, descriptors, navigation } = props as TabBarProps
  const insets = useSafeAreaInsets()
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'

  const surfaceBg = isDark ? 'rgba(15,23,42,0.96)' : 'rgba(255,255,255,0.96)'
  const borderTop = isDark ? '#1F2937' : '#F1F5F9'
  const activeColor = '#2563EB'
  const inactiveColor = isDark ? '#64748B' : '#94A3B8'
  const activeCellBg = isDark ? 'rgba(30,64,175,0.22)' : 'rgba(239,246,255,0.5)'
  const badgeRing = isDark ? '#0F172A' : '#FFFFFF'

  return (
    <View
      style={{
        position: 'absolute',
        left: 0, right: 0, bottom: 0,
        height: 80 + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: 1,
        borderTopColor: borderTop,
        backgroundColor: surfaceBg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: isDark ? 0.4 : 0.05,
        shadowRadius: 20,
        elevation: 16,
      }}
    >
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const { options } = descriptors[route.key]
          const label: string =
            typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name)
          const renderIcon = (options.tabBarIcon ?? (() => null)) as (p: { focused: boolean; color: string; size: number }) => React.ReactNode
          const rawBadge = options.tabBarBadge as number | string | undefined
          const badgeCount = typeof rawBadge === 'number' ? rawBadge : rawBadge ? Number(rawBadge) || 0 : 0

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name as never)
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              android_ripple={{ borderless: false, color: 'rgba(0,100,224,0.08)' }}
            >
              {focused ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: activeCellBg }} />
              ) : null}
              <View style={{ alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%', paddingHorizontal: 2 }}>
                <View>
                  {renderIcon({ focused, color: focused ? activeColor : inactiveColor, size: focused ? 26 : 24 })}
                  {badgeCount > 0 ? (
                    <View
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 16, height: 16, borderRadius: 999,
                        backgroundColor: '#EF4444', borderWidth: 2, borderColor: badgeRing,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#FFFFFF', fontSize: 8, fontWeight: '900' }}>
                        {badgeCount > 9 ? '9+' : String(badgeCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                  style={{
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    textAlign: 'center',
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
