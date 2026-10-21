/**
 * Sicherheit — mirrors the webapp's app/dashboard/settings/security/page.tsx
 * (red ShieldCheck tile, "Zugriffskontrolle und Authentifizierungsrichtlinien.")
 * adapted for every role on the phone:
 *
 *   - Authentifizierung (admin): public.security_settings policy — 2FA
 *     required, password length/complexity, session timeout. Same upsert
 *     as the web ("Einstellungen speichern").
 *   - Eigenes Passwort ändern (all roles): supabase.auth.updateUser. The
 *     optional current password is re-verified first (mobile behaviour);
 *     the minimum length follows the org policy like the web.
 *   - App-only: biometric lock, active session + global sign-out, 2FA
 *     enrolment hand-off to the web app.
 *   - Rollen & Berechtigungen (admin): read-only capability matrix.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert, Linking, ActivityIndicator } from 'react-native'
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Smartphone,
  ExternalLink,
  Fingerprint,
  CheckCircle2,
  Save,
} from 'lucide-react-native'

import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { getWebappUrl } from '@/lib/webapp-url'
import {
  authenticate as biometricAuthenticate,
  describeBiometric,
  getBiometricSupport,
  isBiometricEnabled,
  setBiometricEnabled,
  type BiometricSupport,
} from '@/lib/biometric'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  SettingsRow,
  ToggleRow,
  FieldLabel,
  SettingsInput,
  AmberNote,
  SC,
} from '@/components/settings/SettingsUI'

type Sec = {
  require_2fa: boolean
  password_min_length: number
  password_require_upper: boolean
  password_require_digit: boolean
  password_require_special: boolean
  session_timeout_minutes: number
}

const defaultSec: Sec = {
  require_2fa: false,
  password_min_length: 10,
  password_require_upper: true,
  password_require_digit: true,
  password_require_special: false,
  session_timeout_minutes: 480,
}

const ROLES = [
  { key: 'admin', label: { de: 'Verwalter', en: 'Administrator' } },
  { key: 'dispatcher', label: { de: 'Disponent', en: 'Dispatcher' } },
  { key: 'employee', label: { de: 'Mitarbeiter', en: 'Employee' } },
] as const

type Capability = {
  key: string
  label: { de: string; en: string }
  admin: boolean
  dispatcher: boolean
  employee: boolean
}

const CAPABILITIES: Capability[] = [
  { key: 'view_plans', label: { de: 'Einsatzpläne ansehen', en: 'View plans' }, admin: true, dispatcher: true, employee: true },
  { key: 'edit_plans', label: { de: 'Einsatzpläne bearbeiten', en: 'Edit plans' }, admin: true, dispatcher: true, employee: false },
  { key: 'manage_users', label: { de: 'Benutzer verwalten', en: 'Manage users' }, admin: true, dispatcher: false, employee: false },
  { key: 'manage_org', label: { de: 'Organisation verwalten', en: 'Manage organization' }, admin: true, dispatcher: false, employee: false },
  { key: 'view_reports', label: { de: 'Berichte einsehen', en: 'View reports' }, admin: true, dispatcher: true, employee: false },
  { key: 'export_times', label: { de: 'Eigene Zeiten exportieren', en: 'Export own time entries' }, admin: true, dispatcher: true, employee: true },
  { key: 'delete_times', label: { de: 'Zeiten löschen', en: 'Delete time entries' }, admin: true, dispatcher: true, employee: false },
  { key: 'manage_settings', label: { de: 'Einstellungen verwalten', en: 'Manage settings' }, admin: true, dispatcher: false, employee: false },
]

/** Fallback minimum when no org policy row is readable. */
const BASE_MIN_LENGTH = 8

export default function SecuritySettingsScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, signOut, isAdmin } = useUser()
  const orgId = profile?.organization_id ?? null

  // Org policy (security_settings) — readable by every org member.
  const [sec, setSec] = useState<Sec>(defaultSec)
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const [policyLoading, setPolicyLoading] = useState(true)
  const [savingPolicy, setSavingPolicy] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)

  // Biometric state
  const [bioSupport, setBioSupport] = useState<BiometricSupport | null>(null)
  const [bioEnabled, setBioEnabledState] = useState(false)

  useEffect(() => {
    getBiometricSupport().then(setBioSupport).catch(() => {})
    isBiometricEnabled().then(setBioEnabledState).catch(() => {})
  }, [])

  useEffect(() => {
    if (!orgId) {
      setPolicyLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getSupabase()
          .from('security_settings')
          .select('*')
          .eq('organization_id', orgId)
          .maybeSingle()
        if (cancelled || !data) return
        const d = data as any
        setSec({
          require_2fa: !!d.require_2fa,
          password_min_length: Number(d.password_min_length) || defaultSec.password_min_length,
          password_require_upper: !!d.password_require_upper,
          password_require_digit: !!d.password_require_digit,
          password_require_special: !!d.password_require_special,
          session_timeout_minutes: Number(d.session_timeout_minutes) || defaultSec.session_timeout_minutes,
        })
        setPolicyLoaded(true)
      } catch {
        // No policy row / offline — fall back to the base rules.
      } finally {
        if (!cancelled) setPolicyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const minLength = policyLoaded ? Math.max(BASE_MIN_LENGTH, sec.password_min_length) : BASE_MIN_LENGTH

  const toggleBiometric = async (next: boolean) => {
    if (next) {
      // Require a one-time biometric auth to enable — guards against
      // someone enabling it on a friend's unattended phone.
      const ok = await biometricAuthenticate(L('Biometrische Sperre aktivieren', 'Enable biometric lock'), {
        cancelLabel: t('times.cancel'),
      })
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
  const webappUrl = getWebappUrl()

  const setNum = (k: 'password_min_length' | 'session_timeout_minutes', raw: string) => {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10)
    setSec((p) => ({ ...p, [k]: Number.isFinite(n) ? Math.max(0, n) : 0 }))
  }
  const toggle = (k: 'require_2fa' | 'password_require_upper' | 'password_require_digit' | 'password_require_special') =>
    setSec((p) => ({ ...p, [k]: !p[k] }))

  const savePolicy = async () => {
    if (!orgId) return
    setSavingPolicy(true)
    try {
      const { error } = await getSupabase()
        .from('security_settings')
        .upsert(
          { organization_id: orgId, ...sec, updated_at: new Date().toISOString() } as any,
          { onConflict: 'organization_id' },
        )
      if (error) throw error
      setPolicyLoaded(true)
      toast.success(L('Sicherheits-Einstellungen gespeichert', 'Security settings saved'))
    } catch (err: any) {
      toast.error(err?.message || L('Speichern fehlgeschlagen', 'Save failed'))
    } finally {
      setSavingPolicy(false)
    }
  }

  const changePassword = async () => {
    if (newPw !== confirmPw) {
      toast.error(L('Passwörter stimmen nicht überein', 'Passwords do not match'))
      return
    }
    if (newPw.length < minLength) {
      toast.error(L(`Mindestens ${minLength} Zeichen erforderlich`, `At least ${minLength} characters required`))
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
      // doesn't expose a verifyCurrentPassword helper.
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
      toast.success(L('Passwort aktualisiert', 'Password updated'))
    } catch (err: any) {
      toast.error(err?.message || L('Aktualisierung fehlgeschlagen', 'Update failed'))
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
              // AppSupabase's narrowed auth type omits signOut options;
              // the underlying gotrue client supports scope: 'global'.
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
        L('Die Einrichtung erfolgt aktuell in der Web-App.', 'Set this up in the web app for now.'),
      )
    }
  }

  const createdAt = (session as any)?.user?.created_at
  const sessionStarted = createdAt ? new Date(createdAt) : null
  const sessionLabel =
    sessionStarted && !Number.isNaN(sessionStarted.getTime())
      ? sessionStarted.toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')
      : null

  const pwDisabled = busy || !newPw || !confirmPw

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={ShieldCheck}
        tileColor={SC.red500}
        title={L('Sicherheit', 'Security')}
        subtitle={L('Zugriffskontrolle und Authentifizierungsrichtlinien.', 'Access control and authentication policies.')}
      />

      {/* Auth policy — admin only (web page is admin-only) */}
      {isAdmin ? (
        <SectionCard title={L('Authentifizierung', 'Authentication')}>
          {policyLoading ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={SC.blue600} />
            </View>
          ) : (
            <>
              <ToggleRow
                label={L('Zwei-Faktor-Authentifizierung erzwingen', 'Require two-factor authentication')}
                value={sec.require_2fa}
                onValueChange={() => toggle('require_2fa')}
              />
              <SettingsRow label={L('Mindestlänge Passwort', 'Minimum password length')}>
                <SettingsInput
                  value={String(sec.password_min_length)}
                  onChangeText={(v) => setNum('password_min_length', v)}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{ width: 72, textAlign: 'center' }}
                />
              </SettingsRow>
              <ToggleRow
                label={L('Großbuchstaben erforderlich', 'Require uppercase letters')}
                value={sec.password_require_upper}
                onValueChange={() => toggle('password_require_upper')}
              />
              <ToggleRow
                label={L('Ziffern erforderlich', 'Require digits')}
                value={sec.password_require_digit}
                onValueChange={() => toggle('password_require_digit')}
              />
              <ToggleRow
                label={L('Sonderzeichen erforderlich', 'Require special characters')}
                value={sec.password_require_special}
                onValueChange={() => toggle('password_require_special')}
              />
              <SettingsRow label={L('Sitzungs-Timeout (Minuten)', 'Session timeout (minutes)')} last>
                <SettingsInput
                  value={String(sec.session_timeout_minutes)}
                  onChangeText={(v) => setNum('session_timeout_minutes', v)}
                  keyboardType="number-pad"
                  maxLength={5}
                  style={{ width: 88, textAlign: 'center' }}
                />
              </SettingsRow>
              <View style={{ padding: 20, paddingTop: 4 }}>
                <Button
                  label={L('Einstellungen speichern', 'Save settings')}
                  onPress={savePolicy}
                  loading={savingPolicy}
                  leftIcon={<Save size={16} color="#FFFFFF" />}
                />
              </View>
            </>
          )}
        </SectionCard>
      ) : null}

      {/* Password change */}
      <SectionCard title={L('Eigenes Passwort ändern', 'Change your password')} icon={KeyRound} padded>
        <View style={{ gap: 14, marginTop: 4 }}>
          <View>
            <FieldLabel>{L('Aktuelles Passwort', 'Current password')}</FieldLabel>
            <SettingsInput
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password"
              placeholder={L('Optional', 'Optional')}
            />
          </View>
          <View>
            <FieldLabel>{L('Neues Passwort', 'New password')}</FieldLabel>
            <SettingsInput
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password-new"
              placeholder={L(`Mindestens ${minLength} Zeichen`, `At least ${minLength} characters`)}
            />
          </View>
          <View>
            <FieldLabel>{L('Bestätigen', 'Confirm')}</FieldLabel>
            <SettingsInput
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoComplete="password-new"
            />
          </View>
          <Pressable
            onPress={() => setShowPw((s) => !s)}
            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
          >
            {showPw ? <EyeOff size={15} color={SC.slate500} /> : <Eye size={15} color={SC.slate500} />}
            <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '600', color: SC.slate500 }}>
              {showPw ? L('Passwörter verbergen', 'Hide passwords') : L('Passwörter anzeigen', 'Show passwords')}
            </Text>
          </Pressable>
          <Button
            label={L('Passwort ändern', 'Change password')}
            onPress={changePassword}
            loading={busy}
            disabled={pwDisabled}
            leftIcon={<Lock size={16} color="#FFFFFF" />}
          />
        </View>
      </SectionCard>

      {/* Biometric lock (app-only) */}
      <SectionCard>
        <ToggleRow
          icon={Fingerprint}
          label={bioReady ? L(`${bioLabel}-Sperre`, `${bioLabel} lock`) : L('Biometrische Sperre', 'Biometric lock')}
          desc={
            bioReady
              ? L('App nach 30 Sek. im Hintergrund automatisch sperren.', 'Auto-lock the app after 30 s in the background.')
              : L(
                  'Auf diesem Gerät nicht verfügbar. Bitte zuerst in den Systemeinstellungen einrichten.',
                  'Not available on this device. Configure it in system settings first.',
                )
          }
          value={bioEnabled}
          onValueChange={toggleBiometric}
          disabled={!bioReady}
          last
        />
      </SectionCard>

      {/* Active session (app-only) */}
      <SectionCard title={L('Aktive Sitzung', 'Active session')} icon={Smartphone} padded>
        <Text style={{ fontSize: 14, fontWeight: '600', color: SC.slate800, marginTop: 4 }}>
          {L('Dieses Gerät', 'This device')}
        </Text>
        {sessionLabel ? (
          <Text style={{ fontSize: 12, color: SC.slate500, marginTop: 2 }}>
            {`${L('Angemeldet seit', 'Signed in since')} ${sessionLabel}`}
          </Text>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <Button
            label={L('Von allen Geräten abmelden', 'Sign out everywhere')}
            variant="secondary"
            leftIcon={<LogOut size={16} color={SC.red600} />}
            onPress={signOutEverywhere}
          />
        </View>
      </SectionCard>

      {/* 2FA enrolment hand-off (app-only) */}
      <SectionCard
        title={L('Zwei-Faktor-Authentifizierung', 'Two-factor authentication')}
        icon={ShieldCheck}
        description={L(
          'Aktuell in der Web-App einrichtbar. Sobald aktiviert, fragt LokShift mobile beim nächsten Login automatisch nach dem Code.',
          'Currently set up in the web app. Once enabled, LokShift mobile will ask for the code on the next sign-in automatically.',
        )}
        padded
      >
        <Pressable
          onPress={open2FA}
          accessibilityRole="link"
          style={{
            marginTop: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: SC.slate200,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: SC.slate700 }}>
            {L('In Web-App einrichten', 'Configure in web app')}
          </Text>
          <ExternalLink size={16} color={SC.blue600} />
        </Pressable>
      </SectionCard>

      {/* Roles matrix (read-only, admin) */}
      {isAdmin ? (
        <SectionCard
          title={L('Rollen & Berechtigungen', 'Roles & permissions')}
          description={L(
            'Standardberechtigungen je Rolle. Auf DB-Ebene per Row-Level Security erzwungen.',
            'Default permissions per role. Enforced at the database level via Row-Level Security.',
          )}
        >
          <View
            style={{
              flexDirection: 'row',
              paddingHorizontal: 20,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: SC.slate100,
            }}
          >
            <Text style={matrixHead(true)}>{L('Berechtigung', 'Capability')}</Text>
            {ROLES.map((r) => (
              <Text key={r.key} style={matrixHead(false)} numberOfLines={1}>
                {L(r.label.de, r.label.en)}
              </Text>
            ))}
          </View>
          {CAPABILITIES.map((cap, i) => (
            <View
              key={cap.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 11,
                borderBottomWidth: i === CAPABILITIES.length - 1 ? 0 : 1,
                borderBottomColor: SC.slate50,
              }}
            >
              <Text style={{ flex: 1.6, fontSize: 13, fontWeight: '500', color: SC.slate700, paddingRight: 6 }}>
                {L(cap.label.de, cap.label.en)}
              </Text>
              {ROLES.map((r) => (
                <View key={r.key} style={{ flex: 1, alignItems: 'center' }}>
                  {cap[r.key] ? (
                    <CheckCircle2 size={16} color={SC.emerald500} />
                  ) : (
                    <View style={{ width: 14, height: 1, backgroundColor: SC.slate200 }} />
                  )}
                </View>
              ))}
            </View>
          ))}
          <AmberNote>
            {L(
              'Custom-Rollen können in einer kommenden Version hinzugefügt werden.',
              'Custom roles can be added in a future release.',
            )}
          </AmberNote>
        </SectionCard>
      ) : null}
    </SettingsShell>
  )
}

function matrixHead(first: boolean) {
  return {
    flex: first ? 1.6 : 1,
    fontSize: 9,
    fontWeight: '900' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    color: SC.slate400,
    textAlign: first ? ('left' as const) : ('center' as const),
  }
}
