/**
 * Security settings — password change + session management + 2FA scaffold.
 *
 *   - Password change uses supabase.auth.updateUser({ password }).
 *     Same flow as /change-password but accessible from the settings
 *     hub without the forced redirect.
 *   - "Sign out of all devices" calls supabase.auth.signOut({ scope:
 *     'global' }) which revokes every refresh token across web + mobile.
 *   - 2FA: scaffolded toggle that points the user at the web app, where
 *     Supabase Auth MFA is enabled. The mobile SDK has the surface for
 *     MFA challenges but we keep enrolment on the web for now.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  Linking,
  Switch,
} from 'react-native'
import { useRouter } from 'expo-router'
import Constants from 'expo-constants'
import {
  ChevronLeft,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Fingerprint,
  MapPin,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import {
  authenticate as biometricAuthenticate,
  describeBiometric,
  getBiometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
  type BiometricSupport,
} from '@/lib/biometric'
import {
  getBackgroundLocationEnabled,
  setBackgroundLocationEnabled,
  startTracking as startBgLocation,
  stopTracking as stopBgLocation,
} from '@/lib/location/background'
import { useSafeBack } from '@/lib/use-safe-back'

export default function SecuritySettingsScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, signOut } = useUser()

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  // Biometric state
  const [bioSupport, setBioSupport] = useState<BiometricSupport | null>(null)
  const [bioEnabled, setBioEnabledState] = useState(false)
  useEffect(() => {
    getBiometricSupport().then(setBioSupport)
    isBiometricEnabled().then(setBioEnabledState)
  }, [])

  const toggleBiometric = async (next: boolean) => {
    if (next) {
      // Require a one-time biometric auth to enable — guards against
      // someone enabling it on a friend's unattended phone.
      const ok = await biometricAuthenticate(
        L('Biometrische Sperre aktivieren', 'Enable biometric lock'),
        { cancelLabel: t('times.cancel') },
      )
      if (!ok) {
        toast.error(L('Authentifizierung abgebrochen.', 'Authentication cancelled.'))
        return
      }
    }
    setBioEnabledState(next)
    await setBiometricEnabled(next)
    toast.success(
      next
        ? L('Biometrische Sperre aktiviert', 'Biometric lock enabled')
        : L('Biometrische Sperre deaktiviert', 'Biometric lock disabled'),
    )
  }

  const bioReady = !!bioSupport?.hasHardware && !!bioSupport?.enrolled
  const bioLabel = bioSupport ? describeBiometric(bioSupport, locale) : ''

  // Background location toggle
  const [bgLocEnabled, setBgLocEnabledState] = useState(false)
  useEffect(() => {
    getBackgroundLocationEnabled().then(setBgLocEnabledState)
  }, [])

  const toggleBackgroundLocation = async (next: boolean) => {
    if (next) {
      const ok = await startBgLocation(session?.user?.id ?? '')
      if (!ok) {
        toast.error(
          L(
            'Hintergrund-Standort konnte nicht aktiviert werden.',
            'Could not enable background location.',
          ),
        )
        return
      }
    } else {
      await stopBgLocation()
    }
    setBgLocEnabledState(next)
    await setBackgroundLocationEnabled(next)
    toast.success(
      next
        ? L('Hintergrund-Standort aktiviert', 'Background location enabled')
        : L('Hintergrund-Standort deaktiviert', 'Background location disabled'),
    )
  }

  const webappUrl =
    (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_WEBAPP_URL ??
    process.env.EXPO_PUBLIC_WEBAPP_URL ??
    null

  const changePassword = async () => {
    if (!newPw || newPw.length < 8) {
      toast.error(L('Mindestens 8 Zeichen.', 'At least 8 characters.'))
      return
    }
    if (newPw !== confirmPw) {
      toast.error(L('Passwörter stimmen nicht überein.', 'Passwords do not match.'))
      return
    }
    if (!profile?.email) {
      toast.error(L('Keine E-Mail hinterlegt.', 'No email on file.'))
      return
    }
    setBusy(true)
    try {
      const supabase = getSupabase()
      // Re-verify the current password by signing in fresh; Supabase
      // doesn't expose a verifyCurrentPassword helper, so this is the
      // accepted workaround and matches what the web does.
      if (currentPw) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: profile.email,
          password: currentPw,
        })
        if (signInErr) {
          toast.error(L('Aktuelles Passwort ist falsch.', 'Current password is wrong.'))
          setBusy(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) throw error
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      toast.success(L('Passwort geändert', 'Password changed'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const signOutEverywhere = () => {
    Alert.alert(
      L('Von allen Geräten abmelden?', 'Sign out everywhere?'),
      L(
        'Sie werden auf allen Geräten und im Browser abgemeldet. Sie müssen sich überall neu anmelden.',
        'You will be signed out on every device and in the browser. You will have to sign in again everywhere.',
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Abmelden', 'Sign out'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Custom narrow AppSupabase type doesn't expose the
              // (optional) signOut options on .auth, but the underlying
              // gotrue client does. Cast through to call it with global
              // scope so refresh tokens are revoked across all devices.
              await (getSupabase().auth as any).signOut({ scope: 'global' })
              await signOut()
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            }
          },
        },
      ],
    )
  }

  const open2FA = () => {
    if (webappUrl) {
      Linking.openURL(`${webappUrl}/dashboard/settings/security`).catch(() => {})
    } else {
      Alert.alert(
        L('Zwei-Faktor-Authentifizierung', 'Two-factor authentication'),
        L(
          'Die Einrichtung erfolgt aktuell in der Web-App.',
          'Set this up in the web app for now.',
        ),
      )
    }
  }

  const sessionStarted = session
    ? new Date(((session as any).user?.created_at ?? Date.now()))
    : null

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Sicherheit', 'Security')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Lock size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Konto schützen', 'Protect your account')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Passwort, Sitzungen und Zwei-Faktor-Authentifizierung.',
                'Password, sessions, and two-factor.',
              )}
            </Text>
          </View>
        </View>

        {/* Change password */}
        <Card className="mb-3 space-y-4">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white">
            {L('Passwort ändern', 'Change password')}
          </Text>
          <PwField
            label={L('Aktuelles Passwort', 'Current password')}
            value={currentPw}
            onChangeText={setCurrentPw}
            show={showCurrent}
            onToggle={() => setShowCurrent((s) => !s)}
          />
          <PwField
            label={L('Neues Passwort', 'New password')}
            value={newPw}
            onChangeText={setNewPw}
            show={showNew}
            onToggle={() => setShowNew((s) => !s)}
          />
          <PwField
            label={L('Passwort bestätigen', 'Confirm new password')}
            value={confirmPw}
            onChangeText={setConfirmPw}
            show={showConfirm}
            onToggle={() => setShowConfirm((s) => !s)}
          />
          <Button
            label={busy ? t('common.loading') : L('Speichern', 'Save')}
            loading={busy}
            onPress={changePassword}
          />
        </Card>

        {/* Biometric lock */}
        <Card className="mb-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-row items-start flex-1 pr-3">
              <Fingerprint size={18} color="#0064E0" style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                  {bioReady
                    ? L(`${bioLabel}-Sperre`, `${bioLabel} lock`)
                    : L('Biometrische Sperre', 'Biometric lock')}
                </Text>
                <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">
                  {bioReady
                    ? L(
                        'App nach 30 Sek. im Hintergrund automatisch sperren.',
                        'Auto-lock the app after 30 s in the background.',
                      )
                    : L(
                        'Auf diesem Gerät nicht verfügbar. Bitte zuerst in den Systemeinstellungen einrichten.',
                        'Not available on this device. Configure it in system settings first.',
                      )}
                </Text>
              </View>
            </View>
            <Switch
              value={bioEnabled}
              onValueChange={toggleBiometric}
              disabled={!bioReady}
              trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
            />
          </View>
        </Card>

        {/* Background location */}
        <Card className="mb-3">
          <View className="flex-row items-start justify-between">
            <View className="flex-row items-start flex-1 pr-3">
              <MapPin size={18} color="#0064E0" style={{ marginTop: 2 }} />
              <View className="flex-1 ml-2">
                <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                  {L('Standort während Schicht', 'Location during shift')}
                </Text>
                <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">
                  {L(
                    'Aktualisiert Ihren Standort alle 5 Min., solange Sie eingestempelt sind. Die Disposition sieht Sie auf der Live-Karte.',
                    'Updates your location every 5 min while you are clocked in. Dispatch sees you on the live map.',
                  )}
                </Text>
              </View>
            </View>
            <Switch
              value={bgLocEnabled}
              onValueChange={toggleBackgroundLocation}
              trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
            />
          </View>
        </Card>

        {/* Active session */}
        <Card className="mb-3">
          <View className="flex-row items-center mb-3">
            <Smartphone size={18} color="#0064E0" />
            <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
              {L('Aktive Sitzung', 'Active session')}
            </Text>
          </View>
          <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
            {L('Dieses Gerät', 'This device')}
          </Text>
          {sessionStarted && (
            <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
              {L('Angemeldet seit', 'Signed in since')}{' '}
              {sessionStarted.toLocaleString()}
            </Text>
          )}
          <View className="mt-4">
            <Button
              label={L('Von allen Geräten abmelden', 'Sign out everywhere')}
              variant="secondary"
              leftIcon={<LogOut size={18} color="#DC2626" />}
              onPress={signOutEverywhere}
            />
          </View>
        </Card>

        {/* 2FA */}
        <Card>
          <View className="flex-row items-center mb-2">
            <ShieldCheck size={18} color="#0064E0" />
            <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
              {L('Zwei-Faktor-Authentifizierung', 'Two-factor authentication')}
            </Text>
          </View>
          <Text className="text-[12px] text-gray-500 dark:text-slate-400 mb-4">
            {L(
              'Aktuell in der Web-App einrichtbar. Sobald aktiviert, fragt Lokshift mobile beim nächsten Login automatisch nach dem Code.',
              'Currently set up in the web app. Once enabled, Lokshift mobile will ask for the code on the next sign-in automatically.',
            )}
          </Text>
          <Pressable
            onPress={open2FA}
            className="flex-row items-center justify-between px-4 py-3 rounded-2xl border-2 border-gray-200 dark:border-slate-700"
          >
            <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
              {L('In Web-App einrichten', 'Configure in web app')}
            </Text>
            <ExternalLink size={16} color="#0064E0" />
          </Pressable>
        </Card>
      </ScrollView>
    </Screen>
  )
}

function PwField({
  label,
  value,
  onChangeText,
  show,
  onToggle,
}: {
  label: string
  value: string
  onChangeText: (v: string) => void
  show: boolean
  onToggle: () => void
}) {
  return (
    <View>
      <FormField
        label={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!show}
        autoCapitalize="none"
      />
      <Pressable onPress={onToggle} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
        {show ? <EyeOff size={16} color="#9CA3AF" /> : <Eye size={16} color="#9CA3AF" />}
      </Pressable>
    </View>
  )
}
