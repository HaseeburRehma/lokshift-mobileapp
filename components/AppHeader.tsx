/**
 * Top app bar shown on every authenticated screen. Theme-aware: the
 * background, border and icon colors swap to the dark palette when the
 * user (or system) selects dark mode.
 */

import React from 'react'
import { View, Text, Pressable, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Menu, Bell } from 'lucide-react-native'

import { useDrawer } from '@/lib/drawer-context'
import { useUser } from '@/lib/user-context'
import { useNotifications } from '@/lib/notifications-context'
import { useTheme } from '@/lib/theme'

interface AppHeaderProps {
  title?: string
  hideMenu?: boolean
}

export function AppHeader({ title, hideMenu }: AppHeaderProps) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { open: openDrawer } = useDrawer()
  const { profile } = useUser()
  const { unreadCount } = useNotifications()
  const { scheme } = useTheme()
  const isDark = scheme === 'dark'

  const initials = (profile?.full_name ?? profile?.email ?? 'U')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const bg = isDark ? '#0B1220' : '#FFFFFF'
  const borderColor = isDark ? '#1F2937' : '#F1F5F9'
  const titleColor = isDark ? '#F8FAFC' : '#0F172A'
  const menuIcon = isDark ? '#E2E8F0' : '#0F172A'
  const bellIcon = isDark ? '#94A3B8' : '#475569'
  const avatarBg = isDark ? '#1E293B' : '#EEF2FF'

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
          height: 56, paddingHorizontal: 12,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <View style={{ width: 44, alignItems: 'flex-start' }}>
          {!hideMenu && (
            <Pressable
              onPress={openDrawer}
              hitSlop={8}
              accessibilityLabel="Menu"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }}
            >
              <Menu size={24} color={menuIcon} />
            </Pressable>
          )}
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
              style={{ height: 22, width: 120 }}
            />
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            accessibilityLabel="Notifications"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, position: 'relative' }}
          >
            <Bell size={22} color={bellIcon} />
            {unreadCount > 0 && (
              <View
                style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 9, height: 9, borderRadius: 999,
                  backgroundColor: '#EF4444', borderWidth: 2, borderColor: bg,
                }}
              />
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/profile')}
            hitSlop={6}
            accessibilityLabel="Profile"
            style={{
              width: 34, height: 34, borderRadius: 999,
              backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center',
              marginLeft: 4,
              overflow: 'hidden',
            }}
          >
            {profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 34, height: 34, borderRadius: 999 }}
              />
            ) : (
              <Text
                style={{ color: '#0064E0', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 }}
              >
                {initials}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}
