/**
 * Org members list — admin-only. Mirrors the webapp's
 * /dashboard/users page (UserManagementPanel): header, "Benutzerrollen &
 * Zugriff" section, one card per user with role badge + status and the
 * row actions (Rolle ändern / Aktivieren·Deaktivieren / Passwort-Reset).
 *
 * "Benutzer hinzufügen" lives on the web (admin service-role required),
 * so the button explains that and deep-links to the web app.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Linking,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  Users as UsersIcon,
  ExternalLink,
  UserPlus,
  Plus,
  Shield,
  User as UserIcon,
  KeyRound,
  Power,
  PowerOff,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers, ROLE_LABELS } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useSafeBack } from '@/lib/use-safe-back'
import { webappPath } from '@/lib/webapp-url'
import { toast } from '@/components/Toast'
import type { Profile, UserRole } from '@/lib/types'

// Web getRoleBadge / getRoleIcon colours (admin = purple, disponent =
// indigo, everything else = slate).
const ROLE_BADGE: Record<UserRole, { bg: string; text: string; border: string; icon: string }> = {
  admin: { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF', icon: '#9333EA' },
  dispatcher: { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE', icon: '#475569' },
  employee: { bg: '#F1F5F9', text: '#1E293B', border: '#E2E8F0', icon: '#475569' },
}

function initialsOf(p: Profile): string {
  return (p.full_name ?? p.email ?? 'U')
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

type ActiveFilter = 'active' | 'all'

export default function UsersScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, session } = useUser()
  const {
    profiles,
    pending,
    loading,
    error,
    fetchProfiles,
    claimUser,
    toggleActive,
    resetPassword,
  } = useProfiles()
  const [filter, setFilter] = useState<ActiveFilter>('active')
  const [refreshing, setRefreshing] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const onClaim = async (id: string, label: string) => {
    if (claiming) return
    setClaiming(id)
    try {
      await claimUser(id)
      toast.success(L(`${label} zur Organisation hinzugefügt`, `${label} added to organisation`))
    } catch (e: any) {
      toast.error(e?.message || L('Konnte nicht hinzugefügt werden', 'Could not add user'))
    } finally {
      setClaiming(null)
    }
  }
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchProfiles()
    } finally {
      setRefreshing(false)
    }
  }, [fetchProfiles])

  // Resolved via the shared helper so every screen / hook agrees on the
  // production URL (and the .env.example placeholder never leaks into
  // the UI as a clickable link).
  const webappUsersUrl = webappPath('/dashboard/users')

  const sorted = useMemo(() => {
    return [...profiles].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.full_name ?? '').localeCompare(b.full_name ?? '')
    })
  }, [profiles])

  const activeCount = profiles.filter((p) => p.is_active).length
  const inactiveCount = profiles.length - activeCount

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L('Nur Administratoren können Benutzer verwalten.', 'Only administrators can manage users.')}
        </Text>
      </Screen>
    )
  }

  const showAll = filter === 'all' || inactiveCount === 0
  const rendered = showAll ? sorted : sorted.filter((p) => p.is_active)

  const openWebapp = () => {
    Linking.openURL(webappUsersUrl).catch(() => {})
  }

  const onAddUser = () => {
    Alert.alert(
      L('Neuen Benutzer anlegen', 'Create New User'),
      L(
        'Das Anlegen neuer Konten erfolgt in der LokShift-Web-App (Service-Role-Berechtigung erforderlich).',
        'New accounts are created in the LokShift web app (service-role required).',
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        { text: L('In Web-App öffnen', 'Open in web app'), onPress: openWebapp },
      ],
    )
  }

  const runToggle = async (p: Profile) => {
    setUpdating(p.id)
    try {
      await toggleActive(p.id, p.is_active)
      toast.success(
        p.is_active
          ? L('Benutzer deaktiviert', 'User deactivated')
          : L('Benutzer aktiviert', 'User activated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler', 'Failed'))
    } finally {
      setUpdating(null)
    }
  }

  const onToggleActive = (p: Profile) => {
    if (p.id === session?.user?.id) {
      toast.error(
        L('Eigenes Konto kann nicht deaktiviert werden.', 'You cannot deactivate your own account.'),
      )
      return
    }
    if (!p.is_active) {
      void runToggle(p)
      return
    }
    Alert.alert(
      L('Deaktivieren', 'Deactivate'),
      L(
        `${p.full_name ?? p.email ?? 'Benutzer'} deaktivieren? Deaktivierte Konten können sich nicht anmelden.`,
        `Deactivate ${p.full_name ?? p.email ?? 'user'}? Deactivated accounts cannot sign in.`,
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        { text: L('Deaktivieren', 'Deactivate'), style: 'destructive', onPress: () => void runToggle(p) },
      ],
    )
  }

  const onResetPassword = (p: Profile) => {
    if (!p.email) {
      toast.error(L('Keine E-Mail hinterlegt', 'User has no email on file'))
      return
    }
    const email = p.email
    Alert.alert(
      L('Passwort-Reset senden', 'Send password reset'),
      L(`Passwort-Reset an ${email} senden?`, `Send a password reset email to ${email}?`),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Senden', 'Send'),
          onPress: async () => {
            setUpdating(p.id)
            try {
              await resetPassword(email)
              toast.success(L('Passwort-Reset-E-Mail gesendet', 'Reset email sent'))
            } catch (err: any) {
              toast.error(err?.message ?? L('Fehler', 'Failed'))
            } finally {
              setUpdating(null)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        {/* Breadcrumb (web: Übersicht › Benutzerverwaltung) */}
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="flex-row items-center self-start mb-3"
          accessibilityRole="button"
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={12} color="#94A3B8" />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {L('Übersicht', 'Overview')}
          </Text>
          <ChevronRight size={12} color="#CBD5E1" style={{ marginHorizontal: 4 }} />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-900">
            {L('Benutzerverwaltung', 'User management')}
          </Text>
        </Pressable>

        <PageHeader
          title={L('Plattform-Benutzer', 'Platform users')}
          subtitle={L(
            'Rollen und Berechtigungen für Ihre gesamte Belegschaft und Partner verwalten.',
            'Manage roles and permissions for your entire workforce and partners.',
          )}
        />

        <Button
          label={L('Benutzer hinzufügen', 'Add New User')}
          leftIcon={<Plus size={18} color="#fff" />}
          onPress={onAddUser}
          style={{ backgroundColor: '#9333EA', marginBottom: 20 }}
        />

        {error ? (
          <Card
            className="mb-4"
            style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}
          >
            <View className="flex-row items-start">
              <AlertTriangle size={18} color="#B45309" style={{ marginTop: 2, marginRight: 10 }} />
              <View className="flex-1">
                <Text className="text-[13px] font-black text-amber-900">
                  {error.kind === 'missing_org'
                    ? L(
                        'Ihr Konto ist keiner Organisation zugeordnet',
                        'Your account has no organization assigned',
                      )
                    : L('Mitarbeiter konnten nicht geladen werden', 'Failed to load members')}
                </Text>
                <Text className="text-[12px] mt-1 text-amber-800" numberOfLines={4}>
                  {error.kind === 'missing_org'
                    ? L(
                        'Bitten Sie einen Admin, organization_id für Ihr Profil in Supabase zu setzen, oder führen Sie den Registrierungs-Trigger erneut aus. Solange das Profil nicht verknüpft ist, sind keine Daten sichtbar.',
                        'Ask an admin to set organization_id on your profile in Supabase, or re-run the user-creation trigger. Until your profile is linked, no org data will load.',
                      )
                    : error.message}
                </Text>
                <Pressable onPress={openWebapp} hitSlop={8} className="flex-row items-center mt-2 self-start">
                  <Text className="text-[12px] font-black" style={{ color: '#0064E0' }}>
                    {L('Im Web-Admin öffnen', 'Open in web admin')}
                  </Text>
                  <ExternalLink size={14} color="#0064E0" style={{ marginLeft: 4 }} />
                </Pressable>
              </View>
            </View>
          </Card>
        ) : null}

        {/* Pending users — signed up via mobile but have no organization_id
            yet. Admin taps "Add" to claim them into the current org. */}
        {pending.length > 0 ? (
          <View className="mb-6">
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 ml-1">
              {L(`Ausstehend (${pending.length})`, `Pending (${pending.length})`)}
            </Text>
            <View style={{ gap: 12 }}>
              {pending.map((p) => {
                const label = p.full_name ?? p.email ?? '—'
                const busy = claiming === p.id
                return (
                  <Card key={p.id} style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A', padding: 16 }}>
                    <View className="flex-row items-center">
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          backgroundColor: '#FEF3C7',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 12,
                        }}
                      >
                        <Text style={{ color: '#B45309', fontWeight: '900' }}>{initialsOf(p)}</Text>
                      </View>
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text className="text-[14px] font-bold text-slate-900" numberOfLines={1}>
                          {label}
                        </Text>
                        {!!p.email && !!p.full_name ? (
                          <Text className="text-[12px] text-slate-500 mt-0.5" numberOfLines={1}>
                            {p.email}
                          </Text>
                        ) : null}
                        <View className="self-start mt-1.5 rounded-md border px-2 py-0.5 bg-amber-50 border-amber-200">
                          <Text className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                            {L('Keine Organisation', 'No organisation')}
                          </Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => onClaim(p.id, label)}
                        disabled={busy}
                        style={{
                          marginLeft: 8,
                          paddingHorizontal: 12,
                          height: 36,
                          borderRadius: 12,
                          backgroundColor: '#0064E0',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexDirection: 'row',
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <UserPlus size={14} color="#fff" />
                        <Text className="text-[11px] font-black text-white ml-1.5 uppercase tracking-widest">
                          {busy ? '…' : L('Hinzufügen', 'Add')}
                        </Text>
                      </Pressable>
                    </View>
                  </Card>
                )
              })}
            </View>
          </View>
        ) : null}

        {/* Section header — web CardHeader "Benutzerrollen & Zugriff" */}
        <View className="mb-4">
          <View className="flex-row items-center">
            <Shield size={18} color="#1E293B" />
            <Text className="text-[16px] font-bold text-slate-900 ml-2">
              {L('Benutzerrollen & Zugriff', 'User Roles & Access')}
            </Text>
          </View>
          <Text className="text-[13px] text-slate-500 mt-1">
            {L(
              'Verwalten Sie die Rollen für alle registrierten Benutzer auf der Plattform.',
              'Manage roles for all registered users on the platform.',
            )}
          </Text>
        </View>

        {inactiveCount > 0 ? (
          <View className="flex-row p-1 bg-slate-100 rounded-xl mb-4">
            {(['active', 'all'] as ActiveFilter[]).map((opt) => {
              const selected = filter === opt
              const label =
                opt === 'active'
                  ? `${L('Aktiv', 'Active')} (${activeCount})`
                  : `${L('Alle', 'All')} (${profiles.length})`
              return (
                <Pressable
                  key={opt}
                  onPress={() => setFilter(opt)}
                  className={`flex-1 items-center justify-center py-2.5 rounded-lg ${selected ? 'bg-white' : ''}`}
                  style={
                    selected
                      ? {
                          shadowColor: '#0F172A',
                          shadowOpacity: 0.06,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 1 },
                          elevation: 1,
                        }
                      : undefined
                  }
                >
                  <Text
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: selected ? '#0064E0' : '#64748B' }}
                  >
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {loading ? (
          <View className="items-center py-10">
            <ActivityIndicator color="#0064E0" />
          </View>
        ) : rendered.length === 0 ? (
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="items-center py-8">
              <View className="w-20 h-20 rounded-full bg-slate-50 border border-dashed border-slate-200 items-center justify-center">
                <UsersIcon size={28} color="#CBD5E1" />
              </View>
              <Text className="text-[11px] font-black uppercase tracking-widest text-slate-400 mt-4 text-center">
                {error?.kind === 'missing_org'
                  ? L('Konto noch nicht aktiviert', 'Account not yet provisioned')
                  : L(
                      'Keine Benutzer gefunden oder Sitzung abgelaufen.',
                      'No users found or session expired.',
                    )}
              </Text>
            </View>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {rendered.map((p) => {
              const badge = ROLE_BADGE[p.role] ?? ROLE_BADGE.employee
              const roleLabel = ROLE_LABELS[p.role]?.[locale] ?? p.role
              const busy = updating === p.id
              const isSelf = p.id === session?.user?.id
              return (
                <Card
                  key={p.id}
                  style={{ borderColor: '#E2E8F0', padding: 16, opacity: p.is_active ? 1 : 0.7 }}
                >
                  <Pressable onPress={() => router.push(`/users/${p.id}`)}>
                    <View className="flex-row items-center">
                      {p.avatar_url ? (
                        <Image
                          source={{ uri: p.avatar_url }}
                          style={{ width: 44, height: 44, borderRadius: 999, marginRight: 12 }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 999,
                            backgroundColor: '#EEF2FF',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                          }}
                        >
                          <Text style={{ color: '#0064E0', fontWeight: '900' }}>{initialsOf(p)}</Text>
                        </View>
                      )}
                      <View className="flex-1" style={{ minWidth: 0 }}>
                        <Text className="text-[15px] font-bold text-slate-900" numberOfLines={1}>
                          {p.full_name || L('Anonymer Benutzer', 'Anonymous User')}
                        </Text>
                        <Text className="text-[12px] text-slate-500 mt-0.5" numberOfLines={1}>
                          {p.email || L('Keine E-Mail hinterlegt', 'No email associated')}
                        </Text>
                      </View>
                      <View
                        className={`ml-2 rounded-md border px-2 py-0.5 ${
                          p.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
                        }`}
                      >
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider ${
                            p.is_active ? 'text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          {p.is_active ? L('Aktiv', 'Active') : L('Deaktiviert', 'Inactive')}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row flex-wrap mt-4">
                      <View style={{ width: '50%' }}>
                        <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                          {L('Aktuelle Rolle', 'Current Role')}
                        </Text>
                        <View
                          className="self-start flex-row items-center rounded-md border px-2 py-0.5"
                          style={{ backgroundColor: badge.bg, borderColor: badge.border }}
                        >
                          {p.role === 'admin' ? (
                            <Shield size={13} color={badge.icon} />
                          ) : (
                            <UserIcon size={13} color={badge.icon} />
                          )}
                          <Text className="text-[12px] font-semibold ml-1.5" style={{ color: badge.text }}>
                            {roleLabel}
                          </Text>
                        </View>
                      </View>
                      {isSelf ? (
                        <View style={{ width: '50%' }}>
                          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                            {L('Konto', 'Account')}
                          </Text>
                          <Text className="text-[13px] font-bold text-slate-900">{L('Sie', 'You')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>

                  {/* Row actions — web: role select + Power + KeyRound */}
                  <View className="flex-row items-center mt-4 pt-3 border-t border-slate-100" style={{ gap: 8 }}>
                    <Pressable
                      onPress={() => router.push(`/users/${p.id}`)}
                      className="flex-1 flex-row items-center justify-center h-9 rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <Text className="text-[13px] font-semibold text-slate-700">
                        {L('Rolle ändern', 'Change Role')}
                      </Text>
                      <ChevronRight size={14} color="#64748B" style={{ marginLeft: 4 }} />
                    </Pressable>
                    <Pressable
                      onPress={() => onToggleActive(p)}
                      disabled={busy || isSelf}
                      hitSlop={8}
                      accessibilityLabel={
                        p.is_active ? L('Deaktivieren', 'Deactivate') : L('Aktivieren', 'Activate')
                      }
                      className={`w-9 h-9 rounded-lg items-center justify-center ${
                        p.is_active ? 'bg-orange-50' : 'bg-emerald-50'
                      }`}
                      style={{ opacity: busy || isSelf ? 0.4 : 1 }}
                    >
                      {p.is_active ? (
                        <PowerOff size={16} color="#EA580C" />
                      ) : (
                        <Power size={16} color="#059669" />
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => onResetPassword(p)}
                      disabled={busy}
                      hitSlop={8}
                      accessibilityLabel={L('Passwort-Reset senden', 'Send password reset')}
                      className="w-9 h-9 rounded-lg items-center justify-center bg-blue-50"
                      style={{ opacity: busy ? 0.4 : 1 }}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color="#2563EB" />
                      ) : (
                        <KeyRound size={16} color="#2563EB" />
                      )}
                    </Pressable>
                  </View>
                </Card>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}
