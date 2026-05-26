/**
 * Member detail / management — admin-only. Lets the admin:
 *   - change role (chip picker, three values)
 *   - toggle active/inactive
 *   - send a password-reset email
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
  KeyRound,
  User,
  ShieldCheck,
  Clock,
  LayoutTemplate,
  Camera,
} from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { uploadAvatar } from '@/lib/avatars/storage'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers, ROLE_LABELS, ROLE_COLORS } from '@/lib/rbac/permissions'
import { useProfiles } from '@/hooks/useProfiles'
import { useWorkModels } from '@/hooks/useWorkModels'
import type { Profile, UserRole } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'

const ROLES: UserRole[] = ['admin', 'dispatcher', 'employee']

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
        <Text className="text-gray-400 dark:text-slate-500 text-center">
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
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const isSelf = member.id === session?.user?.id
  const roleLabel = ROLE_LABELS[member.role][locale]
  const roleColor = ROLE_COLORS[member.role]

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
          {
            text: t('common.ok'),
            onPress: async () => {
              setBusy(true)
              try {
                await updateRole(member.id, next)
                toast.success(L('Rolle geändert', 'Role updated'))
              } catch (err: any) {
                toast.error(err?.message ?? t('common.error'))
              } finally {
                setBusy(false)
              }
            },
          },
        ],
      )
      return
    }
    setBusy(true)
    try {
      await updateRole(member.id, next)
      toast.success(L('Rolle geändert', 'Role updated'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
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
          ? L('Konto deaktiviert', 'Account deactivated')
          : L('Konto aktiviert', 'Account activated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onResetPassword = () => {
    if (!member.email) {
      toast.error(L('Diese:r Mitarbeiter:in hat keine E-Mail.', 'No email on file.'))
      return
    }
    Alert.alert(
      L('Passwort zurücksetzen', 'Reset password'),
      L(
        `Eine Reset-E-Mail an ${member.email} senden?`,
        `Send a reset email to ${member.email}?`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('common.ok'),
          onPress: async () => {
            setBusy(true)
            try {
              await resetPassword(member.email!)
              toast.success(L('Reset-E-Mail gesendet', 'Reset email sent'))
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

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        <View className="flex-row items-center mb-4">
          <Pressable onPress={onChangeAvatar} disabled={uploadingAvatar} style={{ marginRight: 12 }}>
            <View style={{ position: 'relative' }}>
              {member.avatar_url ? (
                <Image
                  source={{ uri: member.avatar_url }}
                  style={{ width: 64, height: 64, borderRadius: 22 }}
                />
              ) : (
                <View
                  className="w-16 h-16 rounded-3xl items-center justify-center"
                  style={{ backgroundColor: `${roleColor}1A` }}
                >
                  <User size={28} color={roleColor} />
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
          <View className="flex-1">
            <Text className="text-[20px] font-black text-gray-900 dark:text-white">
              {member.full_name ?? member.email ?? '—'}
            </Text>
            {member.email && member.full_name && (
              <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">{member.email}</Text>
            )}
            <View className="flex-row items-center mt-1.5">
              <View
                className="px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${roleColor}1A` }}
              >
                <Text
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: roleColor }}
                >
                  {roleLabel}
                </Text>
              </View>
              {!member.is_active && (
                <View className="ml-2 px-2 py-0.5 rounded-full bg-gray-200">
                  <Text className="text-[10px] font-black uppercase tracking-widest text-gray-600 dark:text-slate-400">
                    {L('Deaktiviert', 'Inactive')}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Role picker */}
        <Card className="mb-3">
          <View className="flex-row items-center mb-3">
            <ShieldCheck size={18} color="#0064E0" />
            <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
              {L('Rolle', 'Role')}
            </Text>
          </View>
          <View className="flex-row gap-2">
            {ROLES.map((r) => {
              const selected = member.role === r
              const c = ROLE_COLORS[r]
              return (
                <Pressable
                  key={r}
                  onPress={() => onChangeRole(r)}
                  disabled={busy}
                  className="flex-1 py-2.5 rounded-full border-2"
                  style={{
                    backgroundColor: selected ? c : '#fff',
                    borderColor: selected ? c : '#E5E7EB',
                  }}
                >
                  <Text
                    className="text-[12px] font-bold text-center"
                    style={{ color: selected ? '#fff' : '#4B5563' }}
                  >
                    {ROLE_LABELS[r][locale]}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Card>

        {/* Active switch */}
        <Card className="mb-3 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[14px] font-black text-gray-900 dark:text-white">
              {L('Konto aktiv', 'Account active')}
            </Text>
            <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Deaktivierte Konten können sich nicht anmelden.',
                'Deactivated accounts cannot sign in.',
              )}
            </Text>
          </View>
          <Switch
            value={member.is_active}
            onValueChange={onToggleActive}
            disabled={busy || isSelf}
            trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
          />
        </Card>

        {/* Target hours + work model */}
        <Card className="mb-3 space-y-4">
          <View className="flex-row items-center">
            <Clock size={18} color="#0064E0" />
            <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
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

          <View>
            <View className="flex-row items-center mb-1.5">
              <LayoutTemplate size={14} color="#6B7280" />
              <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400">
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
                className={`px-4 py-2 rounded-full border-2 ${
                  workModelId === '' ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[12px] font-bold ${
                    workModelId === '' ? 'text-white' : 'text-gray-600 dark:text-slate-400'
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
                    className={`px-4 py-2 rounded-full border-2 ${
                      selected ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                      }`}
                    >
                      {m.name} · {m.target_hours_per_week}h/W
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
          />
        </Card>

        {/* Password reset */}
        <Card>
          <View className="flex-row items-center mb-3">
            <KeyRound size={18} color="#0064E0" />
            <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
              {L('Passwort', 'Password')}
            </Text>
          </View>
          <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-3">
            {L(
              'Sendet eine E-Mail mit einem Reset-Link an die hinterlegte Adresse.',
              'Sends an email with a reset link to the address on file.',
            )}
          </Text>
          <Button
            label={L('Reset-E-Mail senden', 'Send reset email')}
            variant="secondary"
            onPress={onResetPassword}
            loading={busy}
          />
        </Card>
      </ScrollView>
    </Screen>
  )
}
