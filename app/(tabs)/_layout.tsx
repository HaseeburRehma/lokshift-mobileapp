/**
 * Tab bar layout — 5 tabs (Home / Live / Chat / Calendar / Settings),
 * plus the persistent AppHeader at the top and the AppDrawer overlay
 * available from any tab.
 */

import React from 'react'
import { View } from 'react-native'
import { Tabs } from 'expo-router'
import { Home, Activity, Send, Calendar, Settings } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { BottomNavTabBar } from '@/components/BottomNavTabBar'
import { AppHeader } from '@/components/AppHeader'

export default function TabsLayout() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <View style={{ flex: 1 }}>
        <Tabs
          tabBar={(props: any) => <BottomNavTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tabs.Screen
            name="home"
            options={{
              tabBarLabel: L('Start', 'Home'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Home size={size} color={color} strokeWidth={2.4} />,
            }}
          />
          <Tabs.Screen
            name="live"
            options={{
              tabBarLabel: L('Live', 'Live'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Activity size={size} color={color} strokeWidth={2.4} />,
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              tabBarLabel: L('Chat', 'Chat'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Send size={size} color={color} strokeWidth={2.4} />,
            }}
          />
          <Tabs.Screen
            name="calendar"
            options={{
              tabBarLabel: L('Kalender', 'Calendar'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Calendar size={size} color={color} strokeWidth={2.4} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              tabBarLabel: L('Mehr', 'Settings'),
              tabBarIcon: ({ color, size }: { color: string; size: number }) => <Settings size={size} color={color} strokeWidth={2.4} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  )
}
