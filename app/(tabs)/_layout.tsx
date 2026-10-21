/**
 * Tab bar layout — same five tabs, order, labels and badges as the
 * webapp's BottomNav (Start / Live-Betrieb / Team-Chat / Kalender /
 * Einstellungen; red badges on chat and calendar), plus the persistent
 * AppHeader at the top. The AppDrawer overlay is mounted in the root
 * layout and opened from the header.
 */

import React from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Home, Activity, Send, Calendar, Settings } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { TabBar } from '@/components/nav/TabBar'
import { AppHeader } from '@/components/AppHeader'
import { useDrawerBadges } from '@/hooks/useDrawerBadges'

export default function TabsLayout() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const badges = useDrawerBadges()

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props: any) => <TabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarLabel: L('Start', 'Home'),
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Home size={size} color={color} strokeWidth={focused ? 2.5 : 2} />,
            }}
          />
          <Tabs.Screen
            name="live"
            options={{
              tabBarLabel: L('Live-Betrieb', 'Live Operations'),
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Activity size={size} color={color} strokeWidth={focused ? 2.5 : 2} />,
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              tabBarLabel: L('Team-Chat', 'Team Chat'),
              tabBarBadge: badges.chat > 0 ? badges.chat : undefined,
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Send size={size} color={color} strokeWidth={focused ? 2.5 : 2} />,
            }}
          />
          <Tabs.Screen
            name="calendar"
            options={{
              tabBarLabel: L('Kalender', 'Calendar'),
              tabBarBadge: badges.events > 0 ? badges.events : undefined,
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Calendar size={size} color={color} strokeWidth={focused ? 2.5 : 2} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              tabBarLabel: L('Einstellungen', 'Settings'),
              tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => <Settings size={size} color={color} strokeWidth={focused ? 2.5 : 2} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  )
}
