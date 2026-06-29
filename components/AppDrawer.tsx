/**
 * Left-side slide-in drawer — full nav with sections mirroring the webapp
 * sidebar. Sections are grouped by workflow so admins/dispatchers can jump
 * to any feature in one tap.
 *
 * Sections & items:
 *
 * OVERVIEW
 *   Home, Live (admin/disp), Calendar, Chat
 *
 * PLANNING  (admin/dispatcher only)
 *   Weekly Dashboard ← NEW, Plans, Shift Templates
 *
 * TIMES
 *   Times, Time Account, Per Diem, Holiday Bonus, Requests, Reports (admin/disp)
 *
 * MANAGEMENT  (admin/dispatcher only)
 *   Customers, Locations, Work Models (admin only)
 *
 * MEMBERS  (admin only)
 *   Members, Qualifications
 *
 * COMPANY  (admin only)
 *   Company Profile
 *
 * ACCOUNT
 *   Settings
 */

import React from 'react'
import {
  Animated, Image, Modal, Pressable, ScrollView, Text, View,
  type GestureResponderEvent,
} from 'react-native'
import { useEffect, useRef } from 'react'
import { useRouter, useSegments } from 'expo-router'
import {
  LayoutDashboard, Calendar, Clock, BarChart3, Wallet, Star, Users,
  FileText, MessageSquare, ShieldAlert, Settings, Activity, X,
  Building, LayoutTemplate, Timer, LayoutGrid, Palmtree as PalmtreeIcon,
  ClipboardList, MapPin, Briefcase, ChevronRight,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDrawer } from '@/lib/drawer-context'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/permissions'

interface NavItem {
  id: string
  href: string
  labelDe: string
  labelEn: string
  icon: any
  /** Highlight badge — shown as a small colored dot when true */
  badge?: boolean
}

interface NavSection {
  id: string
  labelDe: string
  labelEn: string
  /** Roles that can see this entire section. Omit = visible to all. */
  roles?: string[]
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    id: 'overview',
    labelDe: 'Übersicht',
    labelEn: 'Overview',
    items: [
      { id: 'home',     href: '/(tabs)/home',     labelDe: 'Dashboard',       labelEn: 'Dashboard',       icon: LayoutDashboard },
      { id: 'live',     href: '/(tabs)/live',     labelDe: 'Live',            labelEn: 'Live',            icon: Activity },
      { id: 'calendar', href: '/(tabs)/calendar', labelDe: 'Kalender',        labelEn: 'Calendar',        icon: Calendar },
      { id: 'chat',     href: '/(tabs)/chat',     labelDe: 'Chat',            labelEn: 'Chat',            icon: MessageSquare },
    ],
  },
  {
    id: 'planning',
    labelDe: 'Planung',
    labelEn: 'Planning',
    roles: ['admin', 'dispatcher'],
    items: [
      { id: 'weekly-dashboard', href: '/dashboard',        labelDe: 'Wochenübersicht',  labelEn: 'Weekly Dashboard', icon: LayoutGrid },
      { id: 'plans',            href: '/plans',             labelDe: 'Schichtpläne',    labelEn: 'Plans',            icon: FileText },
      { id: 'templates',        href: '/shift-templates',  labelDe: 'Schichtvorlagen', labelEn: 'Templates',        icon: LayoutTemplate },
    ],
  },
  {
    id: 'times',
    labelDe: 'Zeiten',
    labelEn: 'Times',
    items: [
      { id: 'times',     href: '/times',      labelDe: 'Zeiterfassung',   labelEn: 'Times',         icon: Clock },
      { id: 'account',   href: '/account',    labelDe: 'Zeitkonto',       labelEn: 'Time Account',  icon: BarChart3 },
      { id: 'per-diem',  href: '/per-diem',   labelDe: 'Spesen',          labelEn: 'Per Diem',      icon: Wallet },
      { id: 'bonuses',   href: '/bonuses',    labelDe: 'Urlaubsgeld',     labelEn: 'Holiday Bonus', icon: Star },
      { id: 'absences',  href: '/absences',   labelDe: 'Anträge',         labelEn: 'Requests',      icon: PalmtreeIcon },
      { id: 'reports',   href: '/reports',    labelDe: 'Berichte',        labelEn: 'Reports',       icon: ClipboardList },
    ],
  },
  {
    id: 'management',
    labelDe: 'Verwaltung',
    labelEn: 'Management',
    roles: ['admin', 'dispatcher'],
    items: [
      { id: 'customers',  href: '/customers',              labelDe: 'Kunden',            labelEn: 'Customers',  icon: Users },
      { id: 'locations',  href: '/operational-locations',  labelDe: 'Betriebsstellen',   labelEn: 'Locations',  icon: MapPin },
      { id: 'work-models',href: '/work-models',            labelDe: 'Arbeitszeitmodelle',labelEn: 'Work Models',icon: Timer },
    ],
  },
  {
    id: 'members',
    labelDe: 'Mitarbeiter',
    labelEn: 'Members',
    roles: ['admin'],
    items: [
      { id: 'users',          href: '/users',          labelDe: 'Mitarbeiterliste',  labelEn: 'Members',        icon: ShieldAlert },
      { id: 'qualifications', href: '/qualifications', labelDe: 'Qualifikationen',   labelEn: 'Qualifications', icon: Briefcase },
    ],
  },
  {
    id: 'company',
    labelDe: 'Unternehmen',
    labelEn: 'Company',
    roles: ['admin'],
    items: [
      { id: 'company', href: '/company', labelDe: 'Unternehmensprofil', labelEn: 'Company Profile', icon: Building },
    ],
  },
  {
    id: 'account',
    labelDe: 'Konto',
    labelEn: 'Account',
    items: [
      { id: 'settings', href: '/(tabs)/settings', labelDe: 'Einstellungen', labelEn: 'Settings', icon: Settings },
    ],
  },
]

export function AppDrawer() {
  const { isOpen, close } = useDrawer()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, signOut } = useUser()
  const router = useRouter()
  const segments = useSegments()
  const insets = useSafeAreaInsets()

  const slide = useRef(new Animated.Value(-320)).current
  useEffect(() => {
    Animated.timing(slide, {
      toValue: isOpen ? 0 : -320,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [isOpen, slide])

  if (!profile) return null

  const isActive = (href: string) => {
    const path = '/' + segments.filter(Boolean).join('/').replace(/^\(tabs\)\//, '')
    const target = href.replace(/^\/\(tabs\)\//, '/')
    if (target === '/home') return path === '/home' || path === '/'
    return path === target || path.startsWith(target + '/')
  }

  const navigate = (href: string) => {
    close()
    router.push(href as any)
  }

  const roleLabel = role ? ROLE_LABELS[role][locale].toUpperCase() : ''
  const roleColor = role ? ROLE_COLORS[role] : '#9CA3AF'
  const initials = (profile.full_name ?? profile.email ?? 'U')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const visibleSections = SECTIONS.filter(
    (s) => !s.roles || s.roles.includes(role ?? ''),
  )

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
          width: 300, maxWidth: '85%',
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: slide }],
          shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20,
          elevation: 16,
        }}
      >
        {/* Logo + close */}
        <View
          style={{
            paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 22, letterSpacing: -0.5 }}>
              LokShift
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 2, marginTop: 2 }}>
              {L('Einsatzzentrale', 'Operations Center')}
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={10} style={{ padding: 8 }}>
            <X size={22} color="#64748B" />
          </Pressable>
        </View>

        {/* User card */}
        <View style={{ paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {profile.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={{ width: 42, height: 42, borderRadius: 999, marginRight: 12 }}
              />
            ) : (
              <View style={{
                width: 42, height: 42, borderRadius: 999,
                backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 12,
              }}>
                <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 15 }}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 13 }} numberOfLines={1}>
                {profile.full_name ?? profile.email ?? '—'}
              </Text>
              <Text style={{ color: '#64748B', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                {profile.email ?? ''}
              </Text>
              <View style={{
                marginTop: 5, alignSelf: 'flex-start',
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

        {/* Nav sections */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {visibleSections.map((section) => (
            <View key={section.id} style={{ marginTop: 6 }}>
              {/* Section header */}
              <Text style={{
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 4,
                fontSize: 9,
                fontWeight: '900',
                color: '#CBD5E1',
                letterSpacing: 1.6,
                textTransform: 'uppercase',
              }}>
                {L(section.labelDe, section.labelEn)}
              </Text>

              {/* Section items */}
              <View style={{ paddingHorizontal: 10 }}>
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  const Icon = item.icon
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => navigate(item.href)}
                      style={({ pressed }: { pressed: boolean }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        height: 44,
                        marginBottom: 2,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        backgroundColor: active
                          ? '#EFF6FF'
                          : pressed
                          ? '#F8FAFC'
                          : 'transparent',
                      })}
                    >
                      <View style={{
                        width: 32, height: 32, borderRadius: 8,
                        backgroundColor: active ? '#DBEAFE' : '#F1F5F9',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={16} color={active ? '#2563EB' : '#64748B'} strokeWidth={active ? 2.5 : 2} />
                      </View>
                      <Text style={{
                        flex: 1,
                        fontSize: 13,
                        fontWeight: active ? '800' : '600',
                        color: active ? '#1D4ED8' : '#334155',
                        letterSpacing: -0.1,
                      }}>
                        {L(item.labelDe, item.labelEn)}
                      </Text>
                      {active ? (
                        <View style={{
                          width: 6, height: 6, borderRadius: 999,
                          backgroundColor: '#2563EB',
                        }} />
                      ) : (
                        <ChevronRight size={14} color="#CBD5E1" />
                      )}
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Footer — sign out */}
        <View style={{
          paddingHorizontal: 16, paddingVertical: 14,
          borderTopWidth: 1, borderTopColor: '#F1F5F9',
        }}>
          <Pressable
            onPress={async () => { close(); await signOut() }}
            style={({ pressed }: { pressed: boolean }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 11, borderRadius: 10,
              backgroundColor: pressed ? '#FEF2F2' : 'transparent',
              borderWidth: 1, borderColor: '#FECACA',
            })}
          >
            <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 13 }}>
              {L('Abmelden', 'Sign out')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _noop(_e: GestureResponderEvent) {}
