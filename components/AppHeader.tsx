/**
 * Top app bar shown on every authenticated screen — mobile port of the
 * webapp's DashboardHeader (mobile layout): hamburger left, LokShift logo
 * centred, notification bell with red count badge (opens the
 * NotificationPanel sheet) and the avatar (opens the user menu with
 * Einstellungen / Abmelden) on the right.
 *
 * Theme-aware: background, border and icon colours swap to the dark
 * palette when the user (or system) selects dark mode.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Menu, Bell } from 'lucide-react-native'

import { useDrawer } from '@/lib/drawer-context'
import { useUser } from '@/lib/user-context'
import { useNotifications } from '@/lib/notifications-context'
import { useTheme } from '@/lib/theme'
import { useTranslation } from '@/lib/i18n'
import { NotificationPanel } from '@/components/NotificationPanel'
import { HeaderUserMenu } from '@/components/nav/HeaderUserMenu'

interface AppHeaderProps {
  title?: string
  hideMenu?: boolean
}

export function AppHeader({ title, hideMenu }: AppHeaderProps) {
  const insets = useSafeAreaInsets()
  const { open: openDrawer } = useDrawer()
  const { profile, session } = useUser()
  const { unreadCount } = useNotifications()
  const { scheme } = useTheme()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const isDark = scheme === 'dark'
  const [panelOpen, setPanelOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : (session?.user?.email ?? profile?.email ?? 'U').slice(0, 2).toUpperCase()

  const bg = isDark ? '#0B1220' : '#FFFFFF'
  const borderColor = isDark ? '#1F2937' : '#F1F5F9'
  const titleColor = isDark ? '#F8FAFC' : '#0F172A'
  const menuIcon = '#94A3B8' // web: text-slate-400 in both themes
  const bellIcon = panelOpen ? '#0064E0' : isDark ? '#CBD5E1' : '#4B5563'
  const bellPressedBg = isDark ? '#1E293B' : '#F3F4F6'

  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: bg,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
      }}
    >
      <View
        style={{
          height: 60, paddingHorizontal: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <View style={{ width: 88, alignItems: 'flex-start' }}>
          {!hideMenu ? (
            <Pressable
              onPress={openDrawer}
              hitSlop={8}
              accessibilityLabel={L('Menü', 'Menu')}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}
            >
              <Menu size={24} color={menuIcon} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {title ? (
            <Text style={{ fontSize: 15, fontWeight: '900', color: titleColor, letterSpacing: -0.2 }} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <Image
              source={require('../assets/logo-3.png')}
              resizeMode="contain"
              style={{ height: 24, width: 110 }}
            />
          )}
        </View>

        <View style={{ width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <Pressable
            onPress={() => setPanelOpen(true)}
            hitSlop={6}
            accessibilityLabel={L('Benachrichtigungen', 'Notifications')}
            style={({ pressed }) => ({
              width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 16,
              backgroundColor: pressed || panelOpen ? bellPressedBg : 'transparent',
            })}
          >
            <Bell size={20} color={bellIcon} />
            {unreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute', top: -2, right: -2,
                  minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 999,
                  backgroundColor: '#EF4444', borderWidth: 2, borderColor: bg,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '900' }}>
                  {unreadCount > 9 ? '9+' : String(unreadCount)}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={6}
            accessibilityLabel={L('Benutzermenü', 'User menu')}
            style={{
              width: 40, height: 40, borderRadius: 12,
              backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF',
            }}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: 40, height: 40 }} />
            ) : (
              <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 12 }}>{initials}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <NotificationPanel visible={panelOpen} onClose={() => setPanelOpen(false)} />
      <HeaderUserMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </View>
  )
}
