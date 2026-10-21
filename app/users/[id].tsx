/**
 * Member detail / management — admin-only. Mobile counterpart of the
 * web UserManagementPanel row actions (role select, activate /
 * deactivate, password reset) plus the mobile-only extras:
 *   - change profile picture
 *   - adjust target hours and assigned working-time model
 *
 * Editing the full_name / email is intentionally limited — those are
 * the user's own profile fields. Admins use the web app to invite or
 * fully overwrite accounts.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, ScrollView, Alert, Switch, Image, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  User as UserIcon,
  Shield,
  Clock,
  LayoutTemplate,
  Camera,
  Power,
} from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { uploadAvatar } from '@/lib/avatars/storage'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers, ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useWorkModels } from '@/hooks/useWorkModels'
import type { Profile, UserRole } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

const ROLES: UserRole[] = ['admin', 'dispatcher', 'employee']

// Web getRoleBadge / getRoleIcon colours.
const ROLE_BADGE: Record<UserRole, { bg: string; text: string; border: string; icon: string }> = {
  admin: { bg: '#F3E8FF', text: '#6B21A8', border: '#E9D5FF', icon: '#9333EA' },
  dispatcher: { bg: '#E0E7FF', text: '#3730A3', border: '#C7D2FE', icon: '#475569' },
  employee: { bg: '#F1F5F9', text: '#1E293B', border: '#E2E8F0', icon: '#475569' },
}

export default function UserDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/users')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role: myRole, session } = useUser()
  const {
    profiles,
    loading,
    updateRole,
    toggleActive,
    updateProfile,
    resetPassword,
  } = useProfiles()
  const { models } = useWorkModels()

  const member: Profile | undefined = profiles.find((p) => p.id === id)

  const [targetHours, setTargetHours] = useState('')
  const [workModelId, setWorkModelId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [savingHours, setSavingHours] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const onChangeAvatar = async () => {
    if (!member) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        L('Berechtigung fehlt', 'Permission missing'),
        L(
          'Bitte erlauben Sie den Zugriff auf Ihre Mediathek in den Systemeinstellungen.',
          'Please grant photo library access in system settings.',
        ),
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      aspect: [1, 1],
      allowsEditing: true,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    setUploadingAvatar(true)
    try {
      // Upload under the TARGET member's user-id folder so storage RLS
      // is happy (the bucket allows admin role to write anywhere).
      const { publicUrl } = await uploadAvatar({
        userId: member.id,
        uri: asset.uri,
        contentType: asset.mimeType ?? 'image/jpeg',
      })
      await updateProfile(member.id, { avatar_url: publicUrl } as any)
      // Best-effort write to the profiles row in case updateProfile only
      // patches in-memory state.
      try {
        await getSupabase()
          .from('profiles')
          .update({ avatar_url: publicUrl } as any)
          .eq('id', member.id)
      } catch {}
      toast.success(L('Profilbild aktualisiert', 'Profile picture updated'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  useEffect(() => {
    if (member) {
      setTargetHours(String(member.target_hours ?? ''))
      setWorkModelId(member.working_time_model_id ?? '')
    }
  }, [member])

  useEffect(() => {
    if (!loading && !member) router.replace('/users')
  }, [loading, member, router])

  if (!canManageUsers(myRole)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Administratoren können Benutzer verwalten.',
            'Only administrators can manage users.',
          )}
        </Text>
      </Screen>
    )
  }

  if (!member) {
    return (
      <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0064E0" />
        </View>
      </Screen>
    )
  }

  const isSelf = member.id === session?.user?.id
  const roleLabel = ROLE_LABELS[member.role]?.[locale] ?? member.role
  const roleColor = ROLE_COLORS[member.role] ?? '#64748B'
  const badge = ROLE_BADGE[member.role] ?? ROLE_BADGE.employee

  const doUpdateRole = async (next: UserRole) => {
    setBusy(true)
    try {
      await updateRole(member.id, next)
      toast.success(L('Rolle erfolgreich aktualisiert', 'Role updated successfully'))
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Aktualisieren der Rolle', 'Failed to update user role'))
    } finally {
      setBusy(false)
    }
  }

  const onChangeRole = async (next: UserRole) => {
    if (next === member.role) return
    if (isSelf) {
      Alert.alert(
        L('Eigene Rolle ändern?', 'Change your own role?'),
        L(
          'Sie können sich ggf. selbst aus der Verwaltung aussperren.',
          'You may lock yourself out of admin features.',
        ),
        [
          { text: t('times.cancel'), style: 'cancel' },
          { text: t('common.ok'), onPress: () => void doUpdateRole(next) },
        ],
      )
      return
    }
    await doUpdateRole(next)
  }

  const onToggleActive = async () => {
    if (isSelf) {
      toast.error(
        L(
          'Eigenes Konto kann nicht deaktiviert werden.',
          'You cannot deactivate your own account.',
        ),
      )
      return
    }
    setBusy(true)
    try {
      await toggleActive(member.id, member.is_active)
      toast.success(
        member.is_active
          ? L('Benutzer deaktiviert', 'User deactivated')
          : L('Benutzer aktiviert', 'User activated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onResetPassword = () => {
    if (!member.email) {
      toast.error(L('Keine E-Mail hinterlegt', 'User has no email on file'))
      return
    }
    Alert.alert(
      L('Passwort-Reset senden', 'Send password reset'),
      L(
        `Passwort-Reset an ${member.email} senden?`,
        `Send a password reset email to ${member.email}?`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: async () => {
            setBusy(true)
            try {
              await resetPassword(member.email!)
              toast.success(L('Passwort-Reset-E-Mail gesendet', 'Reset email sent'))
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  const onSaveHours = async () => {
    const num = parseFloat(targetHours.replace(',', '.'))
    if (!Number.isFinite(num) || num < 0) {
      toast.error(L('Ungültiger Wert.', 'Invalid value.'))
      return
    }
    setSavingHours(true)
    try {
      await updateProfile(member.id, {
        target_hours: num,
        working_time_model_id: workModelId || null,
      })
      toast.success(L('Gespeichert', 'Saved'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSavingHours(false)
    }
  }

  const segShadow = {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  }

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}>
        {/* Breadcrumb — web: Übersicht › Benutzerverwaltung */}
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="flex-row items-center self-start mb-3"
          accessibilityRole="button"
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={12} color="#94A3B8" />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {L('Benutzerverwaltung', 'User management')}
          </Text>
          <ChevronRight size={12} color="#CBD5E1" style={{ marginHorizontal: 4 }} />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-900">
            {L('Benutzer', 'User')}
          </Text>
        </Pressable>

        <PageHeader
          title={member.full_name || L('Anonymer Benutzer', 'Anonymous User')}
          subtitle={member.email || L('Keine E-Mail hinterlegt', 'No email associated')}
        />

        <View style={{ gap: 12 }}>
          {/* Identity card — avatar + current role + status */}
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="flex-row items-center">
              <Pressable onPress={onChangeAvatar} disabled={uploadingAvatar} style={{ marginRight: 14 }}>
                <View style={{ position: 'relative' }}>
                  {member.avatar_url ? (
                    <Image
                      source={{ uri: member.avatar_url }}
                      style={{ width: 64, height: 64, borderRadius: 20 }}
                    />
                  ) : (
                    <View
                      className="w-16 h-16 rounded-2xl items-center justify-center"
                      style={{ backgroundColor: `${roleColor}1A` }}
                    >
                      <UserIcon size={28} color={roleColor} />
                    </View>
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      backgroundColor: '#0064E0',
                      borderWidth: 2,
                      borderColor: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Camera size={11} color="#fff" />
                    )}
                  </View>
                </View>
              </Pressable>
              <View className="flex-1 flex-row flex-wrap">
                <View style={{ width: '50%' }}>
                  <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    {L('Aktuelle Rolle', 'Current Role')}
                  </Text>
                  <View
                    className="self-start flex-row items-center rounded-md border px-2 py-0.5"
                    style={{ backgroundColor: badge.bg, borderColor: badge.border }}
                  >
                    {member.role === 'admin' ? (
                      <Shield size={13} color={badge.icon} />
                    ) : (
                      <UserIcon size={13} color={badge.icon} />
                    )}
                    <Text className="text-[12px] font-semibold ml-1.5" style={{ color: badge.text }}>
                      {roleLabel}
                    </Text>
                  </View>
                </View>
                <View style={{ width: '50%' }}>
                  <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                    {L('Status', 'Status')}
                  </Text>
                  <View
                    className={`self-start rounded-md border px-2 py-0.5 ${
                      member.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-black uppercase tracking-wider ${
                        member.is_active ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {member.is_active ? L('Aktiv', 'Active') : L('Deaktiviert', 'Inactive')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </Card>

          {/* Role picker — web "Rolle ändern" select */}
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="flex-row items-center mb-1">
              <Shield size={18} color="#1E293B" />
              <Text className="text-[16px] font-bold text-slate-900 ml-2">
                {L('Rolle ändern', 'Change Role')}
              </Text>
            </View>
            <Text className="text-[12px] text-slate-500 mb-3">
              {L('Rolle auswählen', 'Select role')}
            </Text>
            <View className="flex-row p-1 bg-slate-100 rounded-xl">
              {ROLES.map((r) => {
                const selected = member.role === r
                return (
                  <Pressable
                    key={r}
                    onPress={() => onChangeRole(r)}
                    disabled={busy}
                    className={`flex-1 items-center justify-center py-2.5 rounded-lg ${selected ? 'bg-white' : ''}`}
                    style={selected ? segShadow : undefined}
                  >
                    <Text
                      className="text-[11px] font-black uppercase tracking-wider"
                      style={{ color: selected ? '#0064E0' : '#64748B' }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {ROLE_LABELS[r][locale]}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </Card>

          {/* Active switch — web Power / PowerOff */}
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center flex-1 pr-3">
                <View
                  className={`w-9 h-9 rounded-lg items-center justify-center mr-3 ${
                    member.is_active ? 'bg-emerald-50' : 'bg-orange-50'
                  }`}
                >
                  <Power size={16} color={member.is_active ? '#059669' : '#EA580C'} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-bold text-slate-900">
                    {member.is_active ? L('Konto aktiv', 'Account active') : L('Aktivieren', 'Activate')}
                  </Text>
                  <Text className="text-[12px] text-slate-500 mt-0.5">
                    {L(
                      'Deaktivierte Konten können sich nicht anmelden.',
                      'Deactivated accounts cannot sign in.',
                    )}
                  </Text>
                </View>
              </View>
              <Switch
                value={member.is_active}
                onValueChange={onToggleActive}
                disabled={busy || isSelf}
                trackColor={{ true: '#0064E0', false: '#CBD5E1' }}
              />
            </View>
          </Card>

          {/* Target hours + work model */}
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="flex-row items-center mb-4">
              <Clock size={18} color="#1E293B" />
              <Text className="text-[16px] font-bold text-slate-900 ml-2">
                {L('Arbeitszeit', 'Working time')}
              </Text>
            </View>
            <FormField
              label={L('Sollstunden (pro Monat)', 'Target hours (per month)')}
              value={targetHours}
              onChangeText={setTargetHours}
              keyboardType="decimal-pad"
              placeholder="160"
            />

            <View className="mt-4">
              <View className="flex-row items-center mb-2">
                <LayoutTemplate size={14} color="#94A3B8" />
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1.5">
                  {L('Arbeitszeitmodell', 'Working time model')}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                <Pressable
                  onPress={() => setWorkModelId('')}
                  className={`px-4 py-2 rounded-xl border ${
                    workModelId === '' ? 'bg-brand border-brand' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <Text
                    className={`text-[12px] font-bold ${
                      workModelId === '' ? 'text-white' : 'text-slate-600'
                    }`}
                  >
                    {L('Keines', 'None')}
                  </Text>
                </Pressable>
                {models.map((m) => {
                  const selected = workModelId === m.id
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setWorkModelId(m.id)}
                      className={`px-4 py-2 rounded-xl border ${
                        selected ? 'bg-brand border-brand' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-bold ${selected ? 'text-white' : 'text-slate-600'}`}
                      >
                        {`${m.name ?? '—'} · ${m.target_hours_per_week ?? 0}h/W`}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>

            <Button
              label={savingHours ? t('common.loading') : L('Speichern', 'Save')}
              onPress={onSaveHours}
              loading={savingHours}
              style={{ marginTop: 16 }}
            />
          </Card>

          {/* Password reset — web KeyRound action */}
          <Card style={{ borderColor: '#E2E8F0' }}>
            <View className="flex-row items-center mb-2">
              <KeyRound size={18} color="#2563EB" />
              <Text className="text-[16px] font-bold text-slate-900 ml-2">
                {L('Passwort-Reset senden', 'Send password reset')}
              </Text>
            </View>
            <Text className="text-[12px] text-slate-500 mb-3">
              {L(
                'Sendet eine E-Mail mit einem Reset-Link an die hinterlegte Adresse.',
                'Sends an email with a reset link to the address on file.',
              )}
            </Text>
            <Button
              label={L('Passwort-Reset senden', 'Send password reset')}
              variant="secondary"
              leftIcon={<KeyRound size={16} color="#2563EB" />}
              onPress={onResetPassword}
              loading={busy}
            />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  )
}
