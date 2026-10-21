/**
 * Left-side slide-in drawer — mobile port of the webapp sidebar
 * (components/dashboard/sidebar.tsx, Kundenfeedback Punkt 14: employees
 * see planning, shift start/end and their own hours first; dispatch sees
 * current operations, weekly planning, approvals and deadlines first).
 *
 * Same entries, order, labels and role filtering as the web:
 *   Übersicht · Meine Woche (employees) · Live-Betrieb · Wochenplanung ·
 *   Einsatzpläne · Zeiterfassung · Freigaben · Monatsnachweis ·
 *   Personal & Fristen · Kalender · Zeitkonto · Spesen · Sonderzahlungen ·
 *   Kunden · Team-Chat · Anleitung · Benutzerverwaltung · Einstellungen
 * followed by "Weitere Bereiche" — app screens the web reaches via its
 * settings pages (absences, templates, Betriebsstellen, work models,
 * company profile, own documents).
 *
 * Badges: red counters, blue for chat (web), green for live shifts.
 * Only the most specific matching entry is highlighted.
 */

import React, { useEffect, useRef } from 'react'
import { Animated, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter, useSegments } from 'expo-router'
import {
  LayoutDashboard, Calendar, Clock, BarChart3, Wallet, Star, Users,
  FileText, MessageSquare, ShieldAlert, Settings, Activity, X,
  Building, LayoutTemplate, Timer, Palmtree as PalmtreeIcon,
  MapPin, CalendarRange, ShieldCheck, FileSpreadsheet, IdCard, BookOpen, LogOut,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useDrawer } from '@/lib/drawer-context'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { useDrawerBadges, type DrawerBadges } from '@/hooks/useDrawerBadges'
import { useNavPlanBadges, type NavPlanBadges } from '@/components/nav/useNavPlanBadges'

type BadgeKey = keyof DrawerBadges | keyof NavPlanBadges

interface NavItem {
  id: string
  href: string
  labelDe: string
  labelEn: string
  icon: any
  /** Which badge count to render, if any (per role when an object). */
  badgeKey?: BadgeKey | { manager?: BadgeKey; employee?: BadgeKey }
  /** Roles that see this item. Omit = visible to everyone. */
  roles?: string[]
  /** Optional label for admin/dispatch (same screen, wider scope). */
  managerLabelDe?: string
  managerLabelEn?: string
}

const MANAGERS = ['admin', 'dispatcher']
const EMPLOYEES = ['technician', 'employee', 'manager', 'viewer']

/** Web sidebar navItems — same order, labels and roles. */
const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', href: '/(tabs)/home', labelDe: 'Übersicht', labelEn: 'Dashboard', icon: LayoutDashboard },
  { id: 'my-week', href: '/plans/my-week', labelDe: 'Meine Woche', labelEn: 'My week', icon: CalendarRange, roles: EMPLOYEES, badgeKey: 'plans' },
  { id: 'live', href: '/(tabs)/live', labelDe: 'Live-Betrieb', labelEn: 'Live Operations', icon: Activity, roles: MANAGERS, badgeKey: 'live' },
  { id: 'week', href: '/dashboard', labelDe: 'Wochenplanung', labelEn: 'Weekly planning', icon: CalendarRange, roles: MANAGERS, badgeKey: 'plans' },
  { id: 'plans', href: '/plans', labelDe: 'Einsatzpläne', labelEn: 'Shift plans', icon: FileText },
  { id: 'times', href: '/times', labelDe: 'Zeiterfassung', labelEn: 'Time Tracking', icon: Clock, badgeKey: { employee: 'unsubmitted' } },
  { id: 'approvals', href: '/times/verify', labelDe: 'Freigaben', labelEn: 'Approvals', icon: ShieldCheck, roles: MANAGERS, badgeKey: 'times' },
  {
    id: 'monthly', href: '/reports', labelDe: 'Monatsnachweis', labelEn: 'Monthly statement', icon: FileSpreadsheet,
    managerLabelDe: 'Monatsnachweis & Berichte', managerLabelEn: 'Statements & reports',
  },
  { id: 'personnel', href: '/qualifications', labelDe: 'Personal & Fristen', labelEn: 'Staff & deadlines', icon: IdCard, roles: MANAGERS },
  { id: 'calendar', href: '/(tabs)/calendar', labelDe: 'Kalender', labelEn: 'Calendar', icon: Calendar, badgeKey: 'events' },
  { id: 'time-account', href: '/account', labelDe: 'Zeitkonto', labelEn: 'Time Account', icon: BarChart3 },
  { id: 'per-diem', href: '/per-diem', labelDe: 'Spesen', labelEn: 'Per Diem', icon: Wallet, badgeKey: 'perDiem' },
  { id: 'holiday-bonus', href: '/bonuses', labelDe: 'Sonderzahlungen', labelEn: 'Special payments', icon: Star },
  { id: 'customers', href: '/customers', labelDe: 'Kunden', labelEn: 'Customers', icon: Users, roles: MANAGERS },
  { id: 'chat', href: '/(tabs)/chat', labelDe: 'Team-Chat', labelEn: 'Team Chat', icon: MessageSquare, badgeKey: 'chat' },
  { id: 'help', href: '/help', labelDe: 'Anleitung', labelEn: 'Guide', icon: BookOpen },
  { id: 'users', href: '/users', labelDe: 'Benutzerverwaltung', labelEn: 'User Management', icon: ShieldAlert, roles: ['admin'], badgeKey: 'pendingUsers' },
  { id: 'settings', href: '/(tabs)/settings', labelDe: 'Einstellungen', labelEn: 'Settings', icon: Settings },
]

/** App screens the web reaches through its settings pages. */
const MORE_ITEMS: NavItem[] = [
  { id: 'absences', href: '/absences', labelDe: 'Urlaub & Krankheit', labelEn: 'Leave & sickness', icon: PalmtreeIcon, badgeKey: 'requests' },
  { id: 'my-docs', href: '/qualifications', labelDe: 'Meine Nachweise', labelEn: 'My documents', icon: IdCard, roles: EMPLOYEES },
  { id: 'templates', href: '/shift-templates', labelDe: 'Schichtvorlagen', labelEn: 'Templates', icon: LayoutTemplate, roles: MANAGERS },
  { id: 'locations', href: '/operational-locations', labelDe: 'Betriebsstellen', labelEn: 'Locations', icon: MapPin, roles: MANAGERS },
  { id: 'work-models', href: '/work-models', labelDe: 'Arbeitszeitmodelle', labelEn: 'Work Models', icon: Timer, roles: MANAGERS },
  { id: 'company', href: '/company', labelDe: 'Unternehmensprofil', labelEn: 'Company Profile', icon: Building, roles: ['admin'] },
]

/** Web footer role pill. */
const ROLE_PILL: Record<string, { bg: string; fg: string; border: string; de: string; en: string }> = {
  admin: { bg: '#2563EB', fg: '#FFFFFF', border: '#1D4ED8', de: 'Verwalter', en: 'Administrator' },
  dispatcher: { bg: '#1E293B', fg: '#FFFFFF', border: '#0F172A', de: 'Disponent', en: 'Dispatcher' },
  employee: { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0', de: 'Mitarbeiter', en: 'Employee' },
}

export function AppDrawer() {
  const { isOpen, close } = useDrawer()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, signOut } = useUser()
  const router = useRouter()
  const segments = useSegments()
  const insets = useSafeAreaInsets()
  const drawerBadges = useDrawerBadges()
  const planBadges = useNavPlanBadges()

  const slide = useRef(new Animated.Value(-320)).current
  useEffect(() => {
    Animated.timing(slide, {
      toValue: isOpen ? 0 : -320,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [isOpen, slide])

  if (!profile) return null

  const isManager = MANAGERS.includes(role ?? '')
  const counts: Record<BadgeKey, number> = { ...drawerBadges, ...planBadges }
  const badgeFor = (item: NavItem): number => {
    if (!item.badgeKey) return 0
    if (typeof item.badgeKey === 'string') return counts[item.badgeKey] ?? 0
    const key = isManager ? item.badgeKey.manager : item.badgeKey.employee
    return key ? counts[key] ?? 0 : 0
  }

  const matches = (href: string) => {
    const path = '/' + segments.filter(Boolean).join('/').replace(/^\(tabs\)\//, '')
    const target = href.replace(/^\/\(tabs\)\//, '/')
    if (target === '/home') return path === '/home' || path === '/'
    return path === target || path.startsWith(target + '/')
  }

  const navigate = (href: string) => {
    close()
    router.push(href as any)
  }

  const visible = (items: NavItem[]) => items.filter((i) => !i.roles || i.roles.includes(role ?? ''))
  const mainItems = visible(NAV_ITEMS)
  const moreItems = visible(MORE_ITEMS)
  // Only the most specific match is highlighted ("/times/verify" must not
  // also light up "/times").
  const activeId = [...mainItems, ...moreItems]
    .filter((i) => matches(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.id

  const pill = ROLE_PILL[role ?? 'employee'] ?? ROLE_PILL.employee

  const renderItem = (item: NavItem) => {
    const active = item.id === activeId
    const Icon = item.icon
    const count = badgeFor(item)
    // Web: chat blue, everything else red; mobile adds a green live pill.
    const badgeBg = item.id === 'chat' ? '#2563EB' : item.badgeKey === 'live' ? '#10B981' : '#EF4444'
    return (
      <Pressable key={item.id} onPress={() => navigate(item.href)}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: 48,
            marginBottom: 4,
            borderRadius: 12,
            paddingHorizontal: 16,
            backgroundColor: active ? '#F0F7FF' : 'transparent',
          }}
        >
          <Icon size={20} color={active ? '#2563EB' : '#94A3B8'} strokeWidth={active ? 2.4 : 2} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              marginLeft: 16,
              fontSize: 13,
              fontWeight: '700',
              color: active ? '#2563EB' : '#94A3B8',
              letterSpacing: -0.2,
              minWidth: 0,
            }}
          >
            {isManager && item.managerLabelDe
              ? L(item.managerLabelDe, item.managerLabelEn ?? item.labelEn)
              : L(item.labelDe, item.labelEn)}
          </Text>
          {count > 0 ? (
            <View
              style={{
                minWidth: 20, height: 20, borderRadius: 999, paddingHorizontal: 6, marginLeft: 8,
                backgroundColor: badgeBg, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>
                {count > 99 ? '99+' : String(count)}
              </Text>
            </View>
          ) : active ? (
            <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#2563EB', marginLeft: 8 }} />
          ) : null}
        </View>
      </Pressable>
    )
  }

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
          width: 288, maxWidth: '85%',
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: slide }],
          shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.15, shadowRadius: 20,
          elevation: 16,
        }}
      >
        {/* Logo + close (web SheetHeader) */}
        <View
          style={{
            paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: 20,
            borderBottomWidth: 1, borderBottomColor: '#F8FAFC',
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <Image source={require('../assets/logo-3.png')} resizeMode="contain" style={{ height: 32, width: 130 }} />
          <Pressable onPress={close} hitSlop={10} accessibilityLabel={L('Schließen', 'Close')} style={{ padding: 6, borderRadius: 12 }}>
            <X size={20} color="#94A3B8" />
          </Pressable>
        </View>

        {/* Nav */}
        <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {mainItems.map(renderItem)}

          {moreItems.length > 0 ? (
            <>
              <Text style={{
                paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
                fontSize: 9, fontWeight: '900', color: '#CBD5E1', letterSpacing: 1.8, textTransform: 'uppercase',
              }}>
                {L('Weitere Bereiche', 'More')}
              </Text>
              {moreItems.map(renderItem)}
            </>
          ) : null}
        </ScrollView>

        {/* Footer — role pill (web) + sign out */}
        <View style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: '#F8FAFC', backgroundColor: 'rgba(248,250,252,0.3)' }}>
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: pill.border, backgroundColor: pill.bg, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: pill.fg, letterSpacing: 2, textTransform: 'uppercase' }}>
              {L(pill.de, pill.en)}
            </Text>
          </View>
          <Pressable
            onPress={async () => {
              close()
              await signOut()
            }}
            style={{ marginTop: 10 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }}>
              <LogOut size={14} color="#F87171" />
              <Text style={{ marginLeft: 8, fontSize: 11, fontWeight: '900', color: '#EF4444', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {L('Abmelden', 'Sign out')}
              </Text>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  )
}
