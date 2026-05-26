/**
 * Settings tab — visual parity with the webapp's /dashboard/settings
 * mobile layout.
 *
 * Structure:
 *   - Centered avatar + name + email
 *   - PERSÖNLICHE DATEN: Stammdaten, Abwesenheiten, Arbeitszeiten, Qualifikationen
 *   - VERWALTUNG: managerial-only entries (Mitarbeiter, Kunden,
 *     Betriebsstellen, Vorlagen, Arbeitszeitmodelle, Berichte, Feiertage,
 *     Unternehmensprofil) — only rendered for admin/dispatcher
 *   - EINSTELLUNGEN: Benachrichtigungen (toggle), Sprache, Passwort, Sicherheit,
 *     Daten-Export
 *   - INFORMATIONEN: Feedback & Hilfe, Datenschutz, Impressum
 *   - DARSTELLUNG: Design (theme chip)
 *   - ABMELDEN button
 *   - Footer: app version
 */

import React, { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, Image, Switch, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import {
  ChevronRight,
  LogOut,
  Globe,
  Lock,
  Database,
  Bell,
  Building,
  Users as UsersIcon,
  LayoutTemplate,
  Timer,
  FileText,
  CalendarCheck,
  Palette,
  Palmtree as PalmtreeIcon,
  GraduationCap,
  User as UserIcon,
  Map as MapIcon,
  HelpCircle,
  Shield as ShieldIcon,
  Info,
  Clock,
  TrendingUp,
  Wallet,
  Gift,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTheme } from '@/lib/theme'
import { useNotifications } from '@/lib/notifications-context'
import { ROLE_LABELS, ROLE_COLORS, canManageUsers, canCreatePlans } from '@/lib/rbac/permissions'

interface RowItem {
  key: string
  label: string
  icon: any
  href?: string
  /** When set, the right side renders a chip with this value. */
  value?: string
  /** When set, render a Switch on the right with this value. */
  toggle?: boolean
  onToggle?: (v: boolean) => void
  /** When true, the label and chevron paint red (destructive). */
  destructive?: boolean
  /** When set, the row opens an external URL via Linking instead of router.push. */
  external?: string
}

export default function SettingsScreen() {
  const { t, locale, setLocale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, signOut } = useUser()
  const { pref: themePref } = useTheme()
  const { unreadCount } = useNotifications()
  const router = useRouter()

  if (!profile) return null

  const roleLabel = role ? ROLE_LABELS[role][locale] : ''
  const roleColor = role ? ROLE_COLORS[role] : '#9CA3AF'
  const initials = (profile.full_name ?? profile.email ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const isAdminOrDispatcher = canCreatePlans(role)
  const isAdmin = canManageUsers(role)
  const webappUrl =
    (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_WEBAPP_URL ??
    process.env.EXPO_PUBLIC_WEBAPP_URL ??
    null

  const personal: RowItem[] = useMemo(
    () => [
      { key: 'profile', label: L('Stammdaten', 'Personal data'), icon: UserIcon, href: '/profile' },
      { key: 'absences', label: L('Abwesenheiten', 'Absences'), icon: PalmtreeIcon, href: '/absences' },
      { key: 'account', label: L('Arbeitszeiten', 'Working time'), icon: Clock, href: '/account' },
      { key: 'qualifications', label: L('Qualifikationen', 'Qualifications'), icon: GraduationCap, href: '/qualifications' },
    ],
    [locale],
  )

  const personalSecondary: RowItem[] = useMemo(() => {
    const out: RowItem[] = [
      { key: 'times', label: L('Zeiteinträge', 'Time entries'), icon: Clock, href: '/times' },
      { key: 'plans', label: L('Pläne', 'Plans'), icon: CalendarCheck, href: '/plans' },
      { key: 'per-diem', label: L('Spesen', 'Per Diem'), icon: Wallet, href: '/per-diem' },
      { key: 'bonuses', label: L('Boni', 'Bonuses'), icon: Gift, href: '/bonuses' },
      { key: 'reports', label: L('Berichte', 'Reports'), icon: FileText, href: '/reports' },
    ]
    return out
  }, [locale])

  const management: RowItem[] = useMemo(() => {
    if (!isAdminOrDispatcher) return []
    const out: RowItem[] = [
      { key: 'customers', label: L('Kunden', 'Customers'), icon: Building, href: '/customers' },
      { key: 'betriebsstellen', label: L('Betriebsstellen', 'Locations'), icon: MapIcon, href: '/operational-locations' },
      { key: 'templates', label: L('Schichtvorlagen', 'Shift templates'), icon: LayoutTemplate, href: '/shift-templates' },
    ]
    if (isAdmin) {
      out.push(
        { key: 'users', label: L('Mitarbeiter', 'Members'), icon: UsersIcon, href: '/users' },
        { key: 'work-models', label: L('Arbeitszeitmodelle', 'Work time models'), icon: Timer, href: '/work-models' },
        { key: 'company', label: L('Unternehmensprofil', 'Company profile'), icon: Building, href: '/company' },
        { key: 'holidays', label: L('Feiertage', 'Holidays'), icon: CalendarCheck, href: '/settings/holidays' },
        { key: 'notif-prefs', label: L('Benachrichtigungs-Vorgaben', 'Notification policy'), icon: Bell, href: '/settings/notifications' },
      )
    }
    return out
  }, [isAdminOrDispatcher, isAdmin, locale])

  const settings: RowItem[] = useMemo(
    () => [
      {
        key: 'notifications',
        label: L('Mitteilungen', 'Notifications'),
        icon: Bell,
        href: '/notifications',
        value: unreadCount > 0 ? String(unreadCount) : undefined,
      },
      {
        key: 'language',
        label: L('Sprache wählen', 'Choose language'),
        icon: Globe,
        // Plain inline chip → tap toggles between DE / EN to mirror the
        // web's compact selector. A dedicated /settings/localization
        // page is still available for timezone / date format.
        value: locale === 'de' ? 'DEUTSCH' : 'ENGLISH',
        href: '/settings/localization',
      },
      {
        key: 'password',
        label: L('Passwort ändern', 'Change password'),
        icon: Lock,
        href: '/change-password',
      },
      {
        key: 'security',
        label: L('Sicherheit', 'Security'),
        icon: ShieldIcon,
        href: '/settings/security',
      },
      {
        key: 'export',
        label: L('Daten-Export', 'Data export'),
        icon: Database,
        href: '/settings/export',
      },
    ],
    [locale, unreadCount],
  )

  const information: RowItem[] = useMemo(() => {
    if (!webappUrl) {
      // Without a configured web base URL these links go nowhere; hide
      // the section instead of showing dead rows.
      return []
    }
    return [
      { key: 'help', label: L('Feedback & Hilfe', 'Feedback & help'), icon: HelpCircle, external: `${webappUrl}/help` },
      { key: 'privacy', label: L('Datenschutz', 'Privacy policy'), icon: ShieldIcon, external: `${webappUrl}/privacy` },
      { key: 'imprint', label: L('Impressum', 'Imprint'), icon: Info, external: `${webappUrl}/impressum` },
    ]
  }, [webappUrl, locale])

  const themeValue =
    themePref === 'system'
      ? L('SYSTEM', 'SYSTEM')
      : themePref === 'dark'
      ? L('DUNKEL', 'DARK')
      : L('HELL', 'LIGHT')

  const display: RowItem[] = useMemo(
    () => [
      {
        key: 'design',
        label: L('Design', 'Theme'),
        icon: Palette,
        value: themeValue,
        href: '/settings/appearance',
      },
    ],
    [themeValue],
  )

  const openRow = (r: RowItem) => {
    if (r.external) {
      Linking.openURL(r.external).catch(() => {})
      return
    }
    if (r.href) router.push(r.href as any)
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 140 }}>
        {/* Identity — centered avatar + name + email */}
        <Pressable onPress={() => router.push('/profile')} style={{ alignItems: 'center', marginBottom: 28 }}>
          {profile.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: 96, height: 96, borderRadius: 999, marginBottom: 12 }}
            />
          ) : (
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 999,
                backgroundColor: '#EEF2FF',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 30 }}>{initials}</Text>
            </View>
          )}
          <Text className="text-[18px] font-black text-gray-900 dark:text-white">
            {profile.full_name ?? profile.email ?? '—'}
          </Text>
          {profile.email && (
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-1">{profile.email}</Text>
          )}
          {roleLabel ? (
            <View
              className="mt-2 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${roleColor}1A` }}
            >
              <Text
                className="text-[9px] font-black uppercase tracking-widest"
                style={{ color: roleColor }}
              >
                {roleLabel}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <Section title={L('Persönliche Daten', 'Personal data')} items={personal} onRow={openRow} />

        {/* Secondary personal items (collapsed under "Mein Konto") */}
        <Section title={L('Mein Konto', 'My account')} items={personalSecondary} onRow={openRow} />

        {management.length > 0 && (
          <Section title={L('Verwaltung', 'Management')} items={management} onRow={openRow} />
        )}

        <Section title={L('Einstellungen', 'Settings')} items={settings} onRow={openRow} />

        {information.length > 0 && (
          <Section title={L('Informationen', 'Information')} items={information} onRow={openRow} />
        )}

        <Section title={L('Darstellung', 'Display')} items={display} onRow={openRow} />

        {/* Sign out — red, full-width, mirrors the web button */}
        <Pressable
          onPress={signOut}
          style={({ pressed }: { pressed: boolean }) => ({
            marginTop: 8,
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: '#FCA5A5',
            paddingVertical: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <LogOut size={18} color="#DC2626" />
          <Text style={{ color: '#DC2626', fontWeight: '900', fontSize: 13, letterSpacing: 1.2 }}>
            {L('ABMELDEN', 'SIGN OUT')}
          </Text>
        </Pressable>

        <Text className="text-[10px] text-gray-300 dark:text-slate-700 text-center mt-6 font-mono">
          v0.1.0
        </Text>
      </ScrollView>
    </Screen>
  )
}

function Section({
  title,
  items,
  onRow,
}: {
  title: string
  items: RowItem[]
  onRow: (r: RowItem) => void
}) {
  if (items.length === 0) return null
  return (
    <View style={{ marginBottom: 24 }}>
      <Text className="text-[10px] font-black uppercase tracking-[2px] text-gray-400 dark:text-slate-500 mb-2 ml-1">
        {title}
      </Text>
      <Card style={{ padding: 0 } as any}>
        {items.map((r, i) => {
          const Icon = r.icon
          const isLast = i === items.length - 1
          return (
            <Pressable
              key={r.key}
              onPress={() => onRow(r)}
              style={({ pressed }: { pressed: boolean }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: isLast ? 0 : 1,
                borderBottomColor: '#F1F5F9',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon size={18} color="#0064E0" />
              <Text
                className="text-[14px] font-bold text-gray-900 dark:text-white ml-3 flex-1"
                numberOfLines={1}
              >
                {r.label}
              </Text>
              {r.toggle !== undefined && r.onToggle ? (
                <Switch
                  value={r.toggle}
                  onValueChange={r.onToggle}
                  trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
                />
              ) : r.value ? (
                <View
                  className="px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#EFF6FF', marginRight: 6 }}
                >
                  <Text className="text-[10px] font-black tracking-widest text-brand">
                    {r.value}
                  </Text>
                </View>
              ) : null}
              {r.toggle === undefined && (
                <ChevronRight size={16} color="#CBD5E1" />
              )}
            </Pressable>
          )
        })}
      </Card>
    </View>
  )
}
