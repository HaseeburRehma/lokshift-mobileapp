/**
 * Settings tab — mirrors the MOBILE view of the webapp's
 * app/dashboard/settings/page.tsx (`block md:hidden`):
 *
 *   - centered 96px avatar (white ring, soft shadow) + name + email
 *   - PERSÖNLICHE DATEN: Stammdaten, Abwesenheiten, Arbeitszeiten,
 *     Meine Nachweise
 *   - EINSTELLUNGEN: Benachrichtigungen (switch → profiles.notifications_enabled,
 *     same write as the web NotificationToggle), Sprache wählen (chip),
 *     Passwort ändern
 *   - INFORMATIONEN: Feedback & Hilfe, Datenschutz, Impressum
 *   - DARSTELLUNG: Design (chip)
 *   - ABMELDEN (red outline)
 *
 * App-only additions kept for functionality / store compliance:
 *   Benachrichtigungs-Einstellungen, Sicherheit, Daten-Export (Einstellungen),
 *   Nutzungsbedingungen (Informationen), VERWALTUNG (admin/dispatcher),
 *   Konto löschen (Apple 5.1.1(v)) and the app version.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, Image, Switch, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import {
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Trash2,
  Globe,
  Lock,
  Database,
  Bell,
  BellRing,
  Building,
  Building2,
  Users as UsersIcon,
  LayoutTemplate,
  Timer,
  CalendarCheck,
  Sun,
  GraduationCap,
  User as UserIcon,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Info,
  Clock,
  FileText,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTheme } from '@/lib/theme'
import { getSupabase } from '@/lib/supabase/client'
import { canManageUsers, canCreatePlans, canApproveTimes } from '@/lib/rbac/permissions'

// Web mobile palette
const BLUE_600 = '#2563EB'
const SLATE_50 = '#F8FAFC'
const SLATE_100 = '#F1F5F9'
const SLATE_400 = '#94A3B8'
const SLATE_800 = '#1E293B'
const SLATE_900 = '#0F172A'
const PAGE_BG = '#FAFBFF'

interface RowItem {
  key: string
  label: string
  icon: any
  href?: string
  /** Replaces the chevron with a custom control (switch, chip …). */
  right?: React.ReactNode
}

export default function SettingsScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, signOut, deleteAccount } = useUser()
  const { pref: themePref } = useTheme()
  const router = useRouter()

  const [deleting, setDeleting] = useState(false)
  // Master notification switch — same column the web's NotificationToggle
  // writes (profiles.notifications_enabled). The dispatcher treats
  // `false` as "no email / no push".
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [notifBusy, setNotifBusy] = useState(false)
  const profileId = profile?.id ?? null

  useEffect(() => {
    if (!profileId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await getSupabase()
          .from('profiles')
          .select('notifications_enabled')
          .eq('id', profileId)
          .maybeSingle()
        if (cancelled || error || !data) return
        const v = (data as any).notifications_enabled
        if (typeof v === 'boolean') setNotifEnabled(v)
      } catch {
        // Column missing / offline — keep the optimistic default.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const toggleNotifications = async (checked: boolean) => {
    if (!profileId || notifBusy) return
    setNotifBusy(true)
    setNotifEnabled(checked)
    try {
      const { error } = await getSupabase()
        .from('profiles')
        .update({ notifications_enabled: checked } as any)
        .eq('id', profileId)
      if (error) throw error
      toast.success(
        checked
          ? L('Benachrichtigungen aktiviert', 'Notifications enabled')
          : L('Benachrichtigungen deaktiviert', 'Notifications disabled'),
      )
    } catch {
      setNotifEnabled(!checked)
      toast.error(L('Einstellungen konnten nicht gespeichert werden', 'Failed to update preferences'))
    } finally {
      setNotifBusy(false)
    }
  }

  const confirmDelete = () => {
    if (deleting) return
    Alert.alert(
      L('Konto löschen?', 'Delete account?'),
      L(
        'Diese Aktion ist endgültig. Ihr Konto und alle damit verbundenen Daten (Profil, Zeiterfassung, Chat-Nachrichten, Anträge) werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        'This action is permanent. Your account and all associated data (profile, time entries, chat messages, requests) will be permanently deleted. This cannot be undone.',
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Endgültig löschen', 'Delete permanently'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await deleteAccount()
              toast.success(L('Konto gelöscht', 'Account deleted'))
            } catch (err: any) {
              toast.error(err?.message || L('Löschen fehlgeschlagen', 'Deletion failed'))
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  // All hooks are above this line — safe to bail out now.
  if (!profile) return null

  const displayName = profile.full_name || L('Benutzer', 'User')
  const initial = (profile.full_name?.charAt(0) || profile.email?.charAt(0) || 'U').toUpperCase()
  const isAdminOrDispatcher = canCreatePlans(role)
  const isAdmin = canManageUsers(role)
  const appVersion = Constants.expoConfig?.version ?? ''

  const personal: RowItem[] = [
    { key: 'profile', label: L('Stammdaten', 'Personal data'), icon: UserIcon, href: '/profile' },
    { key: 'absences', label: L('Abwesenheiten', 'Absences'), icon: MapIcon, href: '/absences' },
    { key: 'account', label: L('Arbeitszeiten', 'Working hours'), icon: Clock, href: '/account' },
    {
      key: 'qualifications',
      label: canApproveTimes(role) ? L('Personal & Fristen', 'Staff & deadlines') : L('Meine Nachweise', 'My documents'),
      icon: GraduationCap,
      href: '/qualifications',
    },
  ]

  const settings: RowItem[] = [
    {
      key: 'notifications',
      label: L('Benachrichtigungen', 'Notifications'),
      icon: Bell,
      right: (
        <Switch
          value={notifEnabled}
          onValueChange={toggleNotifications}
          disabled={notifBusy}
          trackColor={{ true: BLUE_600, false: '#E2E8F0' }}
          ios_backgroundColor="#E2E8F0"
          thumbColor="#FFFFFF"
        />
      ),
    },
    {
      key: 'language',
      label: L('Sprache wählen', 'Choose language'),
      icon: Globe,
      href: '/settings/localization',
      right: <Chip label={locale === 'de' ? 'Deutsch' : 'English'} tone="blue" />,
    },
    { key: 'password', label: L('Passwort ändern', 'Change password'), icon: Lock, href: '/settings/security' },
    {
      key: 'notif-prefs',
      label: L('Benachrichtigungs-Einstellungen', 'Notification preferences'),
      icon: BellRing,
      href: '/settings/notifications',
    },
    { key: 'security', label: L('Sicherheit', 'Security'), icon: ShieldCheck, href: '/settings/security' },
    { key: 'export', label: L('Daten-Export', 'Data export'), icon: Database, href: '/settings/export' },
  ]

  const information: RowItem[] = [
    { key: 'help', label: L('Feedback & Hilfe', 'Feedback & help'), icon: MessageSquare, href: '/help' },
    { key: 'privacy', label: L('Datenschutz', 'Privacy policy'), icon: Lock, href: '/legal/datenschutz' },
    { key: 'imprint', label: L('Impressum', 'Imprint'), icon: Info, href: '/legal/impressum' },
    { key: 'terms', label: L('Nutzungsbedingungen', 'Terms of service'), icon: FileText, href: '/legal/agb' },
  ]

  const themeLabel =
    themePref === 'system' ? 'System' : themePref === 'dark' ? L('Dunkel', 'Dark') : L('Hell', 'Light')
  const display: RowItem[] = [
    {
      key: 'design',
      label: L('Design', 'Theme'),
      icon: Sun,
      href: '/settings/appearance',
      right: <Chip label={themeLabel} tone="slate" />,
    },
  ]

  const management: RowItem[] = []
  if (isAdminOrDispatcher) {
    management.push(
      { key: 'customers', label: L('Kunden', 'Customers'), icon: Building, href: '/customers' },
      { key: 'betriebsstellen', label: L('Betriebsstellen', 'Locations'), icon: MapPin, href: '/operational-locations' },
      { key: 'templates', label: L('Schichtvorlagen', 'Shift templates'), icon: LayoutTemplate, href: '/shift-templates' },
    )
    if (isAdmin) {
      management.push(
        { key: 'users', label: L('Mitarbeiter', 'Members'), icon: UsersIcon, href: '/users' },
        { key: 'work-models', label: L('Arbeitszeitmodelle', 'Work time models'), icon: Timer, href: '/work-models' },
        { key: 'company', label: L('Unternehmensprofil', 'Company profile'), icon: Building2, href: '/company' },
        { key: 'holidays', label: L('Feiertage', 'Holidays'), icon: CalendarCheck, href: '/settings/holidays' },
      )
    }
  }

  const openRow = (r: RowItem) => {
    if (r.href) router.push(r.href as any)
  }

  return (
    <Screen background={PAGE_BG} noTapToDismiss>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 24, paddingBottom: 140 }}
      >
        {/* Profile header */}
        <Pressable
          onPress={() => router.push('/profile' as any)}
          accessibilityRole="button"
          accessibilityLabel={L('Stammdaten öffnen', 'Open personal data')}
          style={{ alignItems: 'center', marginTop: 8, marginBottom: 32 }}
        >
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              marginBottom: 16,
              backgroundColor: '#FFFFFF',
              shadowColor: '#94A3B8',
              shadowOpacity: 0.25,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 6,
            }}
          >
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                borderWidth: 4,
                borderColor: '#FFFFFF',
                overflow: 'hidden',
                backgroundColor: SLATE_100,
              }}
            >
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' }}>
                  <Text style={{ fontSize: 30, fontWeight: '900', color: BLUE_600 }}>{initial}</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={{ fontSize: 20, fontWeight: '700', color: SLATE_900, letterSpacing: -0.3 }} numberOfLines={1}>
            {displayName}
          </Text>
          {profile.email ? (
            <Text style={{ fontSize: 14, fontWeight: '500', color: SLATE_400, marginTop: 2 }} numberOfLines={1}>
              {profile.email}
            </Text>
          ) : null}
        </Pressable>

        <Section title={L('Persönliche Daten', 'Personal data')} items={personal} onRow={openRow} />
        <Section title={L('Einstellungen', 'Settings')} items={settings} onRow={openRow} />
        <Section title={L('Informationen', 'Information')} items={information} onRow={openRow} />
        <Section title={L('Darstellung', 'Appearance')} items={display} onRow={openRow} />
        {management.length > 0 ? (
          <Section title={L('Verwaltung', 'Management')} items={management} onRow={openRow} />
        ) : null}

        {/* Abmelden — web: bg-[#FAFBFF] text-red-500 border-red-100 rounded-2xl */}
        <View style={{ paddingTop: 8 }}>
          <Pressable
            onPress={signOut}
            accessibilityRole="button"
            style={({ pressed }) => ({
              backgroundColor: PAGE_BG,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#FEE2E2',
              paddingVertical: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <LogOut size={16} color="#EF4444" strokeWidth={3} />
            <Text
              style={{
                marginLeft: 8,
                color: '#EF4444',
                fontWeight: '900',
                fontSize: 14,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              {L('Abmelden', 'Sign out')}
            </Text>
          </Pressable>
        </View>

        {/* Konto löschen — required by Apple guideline 5.1.1(v). Calls the
            delete_my_account RPC via user-context. */}
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          accessibilityRole="button"
          style={{
            marginTop: 12,
            borderRadius: 16,
            paddingVertical: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: deleting ? 0.6 : 1,
          }}
        >
          <Trash2 size={15} color="#DC2626" />
          <Text style={{ marginLeft: 8, color: '#DC2626', fontWeight: '800', fontSize: 13 }}>
            {deleting ? L('Wird gelöscht…', 'Deleting…') : L('Konto löschen', 'Delete account')}
          </Text>
        </Pressable>
        <Text style={{ fontSize: 11, color: SLATE_400, textAlign: 'center', paddingHorizontal: 12, lineHeight: 16 }}>
          {L(
            'Wird das Konto gelöscht, werden alle Ihre Daten unwiderruflich entfernt.',
            'Deleting the account permanently removes all your data.',
          )}
        </Text>

        {appVersion ? (
          <Text style={{ fontSize: 10, color: '#CBD5E1', textAlign: 'center', marginTop: 20 }}>
            {`LokShift v${appVersion}`}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

/** Web: value pill with the up/down chevron (`bg-blue-50/50 text-blue-600` / `bg-slate-50 text-slate-400`). */
function Chip({ label, tone }: { label: string; tone: 'blue' | 'slate' }) {
  const fg = tone === 'blue' ? BLUE_600 : SLATE_400
  const bg = tone === 'blue' ? 'rgba(239,246,255,0.8)' : SLATE_50
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: fg, textTransform: 'uppercase', letterSpacing: -0.2 }}>
        {label}
      </Text>
      <ChevronsUpDown size={11} color={fg} strokeWidth={3} style={{ marginLeft: 4 }} />
    </View>
  )
}

/** Web: `text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 opacity-60`
 *  header over a `bg-white rounded-3xl border-slate-100` list. */
function Section({ title, items, onRow }: { title: string; items: RowItem[]; onRow: (r: RowItem) => void }) {
  if (items.length === 0) return null
  return (
    <View style={{ marginBottom: 32 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: 2.2,
          color: SLATE_400,
          opacity: 0.6,
          paddingHorizontal: 8,
          marginBottom: 12,
        }}
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 24,
          borderWidth: 1,
          borderColor: SLATE_100,
          overflow: 'hidden',
        }}
      >
        {items.map((r, i) => {
          const Icon = r.icon
          const isLast = i === items.length - 1
          const rowStyle = {
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            minHeight: 56,
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: isLast ? 0 : 1,
            borderBottomColor: SLATE_50,
          }
          const content = (
            <>
              <Icon size={20} color={BLUE_600} />
              <Text
                style={{ flex: 1, minWidth: 0, marginLeft: 16, fontSize: 15, fontWeight: '500', color: SLATE_800 }}
                numberOfLines={1}
              >
                {r.label}
              </Text>
              <View style={{ marginLeft: 8 }}>
                {r.right ? r.right : <ChevronRight size={20} color={BLUE_600} />}
              </View>
            </>
          )
          // Rows with a switch and no destination are not tappable as a
          // whole (web MobileActionItem) — only the control reacts.
          if (!r.href) {
            return (
              <View key={r.key} style={rowStyle}>
                {content}
              </View>
            )
          }
          return (
            <Pressable
              key={r.key}
              onPress={() => onRow(r)}
              accessibilityRole="button"
              style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? SLATE_50 : '#FFFFFF' }]}
            >
              {content}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
