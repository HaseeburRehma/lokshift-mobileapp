/**
 * Left-side slide-in drawer that mirrors the webapp's
 * `components/dashboard/sidebar.tsx` nav exactly.
 *
 * Items:
 *   Dashboard → /(tabs)/home
 *   Live      → /(tabs)/live           (admin/dispatcher only)
 *   Calendar  → /(tabs)/calendar
 *   Plans     → /plans                 — w/ badge
 *   Times     → /times                 — w/ badge
 *   Time Acc. → /account
 *   Per Diem  → /per-diem
 *   Holiday B.→ /bonuses
 *   Customers → /customers             (admin/dispatcher only)
 *   Reports   → /account               (admin/dispatcher) — reports v2
 *   Chat      → /(tabs)/chat           — w/ badge
 *   Users     → /(tabs)/settings       (admin only)
 *   Settings  → /(tabs)/settings
 *
 * Active item: bg-[#F0F7FF] (blue-50) + text-blue-600 with a small dot
 * indicator, matching the webapp.
 */

import React from 'react'
import {
  Animated, Image, Modal, Pressable, ScrollView, Text, View, type GestureResponderEvent,
} from 'react-native'
import { useEffect, useRef } from 'react'
import { useRouter, useSegments } from 'expo-router'
import {
  LayoutDashboard, Calendar, Clock, BarChart3, Wallet, Star, Users,
  FileText, MessageSquare, ShieldAlert, Settings, Activity, X,
  Building, LayoutTemplate, Palmtree as PalmtreeIcon, Timer,
  // Note: FileText is already imported above; reused for both Plans and Reports.
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDrawer } from '@/lib/drawer-context'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/permissions'

interface NavItem {
  id: string
  href: string
  label: string
  icon: any
  roles?: string[]
}

export function AppDrawer() {
  const { isOpen, close } = useDrawer()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, signOut } = useUser()
  const router = useRouter()
  const segments = useSegments()
  const insets = useSafeAreaInsets()

  // Slide-in animation. The drawer is rendered as a full-screen Modal so
  // it sits above the tab bar and gets dimmed-out scrim handling for free.
  const slide = useRef(new Animated.Value(-320)).current
  useEffect(() => {
    Animated.timing(slide, {
      toValue: isOpen ? 0 : -320,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [isOpen, slide])

  if (!profile) return null

  const items: NavItem[] = [
    { id: 'dashboard',  href: '/(tabs)/home',     label: L('Übersicht',       'Dashboard'),     icon: LayoutDashboard },
    { id: 'live',       href: '/(tabs)/live',     label: L('Live',            'Live'),          icon: Activity, roles: ['admin', 'dispatcher'] },
    { id: 'calendar',   href: '/(tabs)/calendar', label: L('Kalender',        'Calendar'),      icon: Calendar },
    { id: 'plans',      href: '/plans',           label: L('Pläne',           'Plans'),         icon: FileText },
    { id: 'times',      href: '/times',           label: L('Zeiten',          'Times'),         icon: Clock },
    { id: 'account',    href: '/account',         label: L('Zeitkonto',       'Time Account'),  icon: BarChart3 },
    { id: 'per-diem',   href: '/per-diem',        label: L('Spesen',          'Per Diem'),      icon: Wallet },
    { id: 'bonuses',    href: '/bonuses',         label: L('Urlaubsgeld',     'Holiday Bonus'), icon: Star },
    { id: 'absences',   href: '/absences',        label: L('Anträge',         'Requests'),      icon: PalmtreeIcon },
    { id: 'reports',    href: '/reports',         label: L('Berichte',        'Reports'),       icon: FileText },
    { id: 'customers',  href: '/customers',       label: L('Kunden',          'Customers'),     icon: Users, roles: ['admin', 'dispatcher'] },
    { id: 'betriebsstellen', href: '/operational-locations', label: L('Betriebsstellen', 'Locations'), icon: Building, roles: ['admin', 'dispatcher'] },
    { id: 'templates',  href: '/shift-templates', label: L('Schichtvorlagen', 'Templates'),     icon: LayoutTemplate, roles: ['admin', 'dispatcher'] },
    { id: 'chat',       href: '/(tabs)/chat',     label: L('Chat',            'Chat'),          icon: MessageSquare },
    { id: 'company',    href: '/company',         label: L('Unternehmensprofil', 'Company profile'), icon: Building, roles: ['admin'] },
    { id: 'members',    href: '/users',           label: L('Mitarbeiter',     'Members'),       icon: ShieldAlert, roles: ['admin'] },
    { id: 'work-models', href: '/work-models',    label: L('Arbeitszeitmodelle', 'Work models'), icon: Timer, roles: ['admin'] },
    { id: 'settings',   href: '/(tabs)/settings', label: L('Einstellungen',   'Settings'),      icon: Settings },
  ]

  const visible = items.filter((i) => !i.roles || i.roles.includes(role ?? ''))

  const isActive = (href: string) => {
    const path = '/' + segments.filter(Boolean).join('/').replace(/^\(tabs\)\//, '')
    const target = href.replace(/^\/\(tabs\)\//, '/')
    if (target === '/home') return path === '/home' || path === '/'
    return path === target || path.startsWith(target)
  }

  const navigate = (href: string) => {
    close()
    router.push(href as any)
  }

  const roleLabel = role ? ROLE_LABELS[role][locale].toUpperCase() : ''
  const roleColor = role ? ROLE_COLORS[role] : '#9CA3AF'
  const initials = (profile.full_name ?? profile.email ?? 'U')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      {/* Scrim */}
      <Pressable
        onPress={close}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' }}
      />

      {/* Drawer panel */}
      <Animated.View
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: 320, maxWidth: '85%',
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: slide }],
          shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20,
          elevation: 16,
        }}
      >
        {/* Logo + close */}
        <View
          style={{
            paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 22, letterSpacing: -0.5 }}>Lokshift</Text>
            <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginTop: 2 }}>
              {L('Einsatzzentrale', 'Operations Center')}
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={10} style={{ padding: 8 }}>
            <X size={22} color="#64748B" />
          </Pressable>
        </View>

        {/* User card */}
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 44, height: 44, borderRadius: 999, marginRight: 12 }}
              />
            ) : (
              <View style={{
                width: 44, height: 44, borderRadius: 999,
                backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}>
                <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 15 }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 14 }} numberOfLines={1}>
                {profile.full_name ?? profile.email ?? '—'}
              </Text>
              <View style={{
                marginTop: 4, alignSelf: 'flex-start',
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
                backgroundColor: `${roleColor}1A`,
              }}>
                <Text style={{ color: roleColor, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }}>
                  {roleLabel}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Nav items */}
        <ScrollView contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }} showsVerticalScrollIndicator={false}>
          {visible.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <Pressable
                key={item.id}
                onPress={() => navigate(item.href)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  height: 48, marginBottom: 6, borderRadius: 12,
                  paddingHorizontal: 16,
                  backgroundColor: active ? '#F0F7FF' : 'transparent',
                  borderWidth: 1, borderColor: 'transparent',
                }}
              >
                <Icon size={20} color={active ? '#2563EB' : '#94A3B8'} strokeWidth={active ? 2.4 : 2} />
                <Text style={{
                  flex: 1, fontSize: 13, fontWeight: '700',
                  color: active ? '#2563EB' : '#94A3B8',
                  letterSpacing: -0.1,
                }}>
                  {item.label}
                </Text>
                {active && (
                  <View style={{
                    width: 8, height: 8, borderRadius: 999,
                    backgroundColor: '#2563EB',
                    shadowColor: '#2563EB', shadowOpacity: 0.5, shadowRadius: 4,
                  }} />
                )}
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Footer — role pill + sign out */}
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#F1F5F9', backgroundColor: 'rgba(248,250,252,0.5)' }}>
          <Pressable
            onPress={async () => { await signOut(); close() }}
            style={({ pressed }: { pressed: boolean }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 12, borderRadius: 12,
              backgroundColor: pressed ? '#FEF2F2' : 'transparent',
              borderWidth: 1, borderColor: '#FEE2E2',
            })}
          >
            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>
              {L('Abmelden', 'Sign out')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  )
}

// Convenience: a hidden Pressable that swallows the gesture event for
// callers that don't need it. Used internally — not exported.
function _noop(_e: GestureResponderEvent) {}
