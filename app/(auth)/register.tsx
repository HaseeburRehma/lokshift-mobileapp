/**
 * Register — pixel-parity port of the webapp's RegisterForm.tsx.
 *
 *   Top bar: back button (blue rounded-full chip), "Cancel" right link
 *   Body:    centered logo-3 (192x40), then one of three steps
 *
 *     Step 1: "Sign up to continue" + email input + terms + blue Register
 *     Step 2: "We've emailed you a code" + email echo + OTP boxes + Verify + Resend
 *     Step 3: "Email confirmed" + checkmark + email disabled + full name + password
 *             with live strength meter (red/yellow/blue/emerald) + terms + Continue
 */

import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, CheckCircle2, Eye, EyeOff } from 'lucide-react-native'
// Local shape — see lib/user-context.tsx for why we don't import from supabase-js.
type Session = { user: { id: string; email?: string | null } }

import { OtpInput } from '@/components/OtpInput'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

export default function RegisterScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const goBack = useSafeBack('/(auth)/login')
  const supabase = getSupabase()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [verifiedSession, setVerifiedSession] = useState<Session | null>(null)

  const passwordStrength = useMemo(() => (
    password.length === 0 ? 0
      : password.length < 6 ? 1
      : password.length < 10 ? 2
      : password.length < 14 ? 3
      : 4
  ), [password])
  const strengthColor =
    passwordStrength <= 1 ? '#F87171'
    : passwordStrength <= 2 ? '#FACC15'
    : passwordStrength <= 3 ? '#60A5FA'
    : '#10B981'
  const strengthLabel =
    passwordStrength <= 1 ? L('Zu kurz', 'Too short')
    : passwordStrength <= 2 ? L('Mittel', 'Fair')
    : passwordStrength <= 3 ? L('Gut', 'Good')
    : L('Stark', 'Strong')

  const sendOtp = async () => {
    if (!email) return
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email, options: { shouldCreateUser: true },
      })
      if (error) throw error
      setStep(2)
      toast.success(L('Code gesendet! Bitte E-Mail prüfen.', 'Code sent! Check your email.'))
    } catch (err: any) {
      toast.error(err?.message || L('Code konnte nicht gesendet werden', 'Error sending code'))
    } finally { setLoading(false) }
  }

  const verifyOtp = async () => {
    if (otp.length < 6) return
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' })
      let session: Session | null = data.session ?? null
      if (!session) {
        const { data: data2, error: error2 } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' })
        if (error2) throw error2 ?? error
        session = data2.session ?? null
      }
      if (!session) throw new Error(L('Code ist ungültig oder abgelaufen.', 'Code is invalid or expired.'))
      setVerifiedSession(session)
      setStep(3)
      toast.success(L('E-Mail bestätigt!', 'Email confirmed!'))
    } catch (err: any) {
      toast.error(err?.message || L('Ungültiger Code.', 'Invalid code.'))
    } finally { setLoading(false) }
  }

  const completeSetup = async () => {
    if (!fullName || password.length < 6 || !verifiedSession) return
    setLoading(true)
    try {
      const { error: pwError } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName },
      })
      if (pwError) throw pwError
      try {
        await supabase
          .from('profiles')
          .update({ full_name: fullName, updated_at: new Date().toISOString() } as any)
          .eq('id', verifiedSession.user.id)
      } catch (e) {
        console.warn('[Register] profile update failed (non-fatal):', e)
      }
      toast.success(L('Willkommen bei Lokshift!', 'Welcome to Lokshift!'))
    } catch (err: any) {
      toast.error(err?.message || L('Einrichtung fehlgeschlagen.', 'Setup failed.'))
    } finally { setLoading(false) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: 16 }}>
      {/* Top bar — back chip + cancel */}
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 16, height: 48 }}>
        <Pressable
          onPress={() => (step > 1 ? setStep((step - 1) as 1 | 2 | 3) : goBack())}
          style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(239,246,255,0.6)', alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={22} color="#0064E0" />
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ color: '#0064E0', fontSize: 15, fontWeight: '600' }}>
            {L('Abbrechen', 'Cancel')}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 32, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {/* Centered logo (logo-3 — blue logo for white background) */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Image
            source={require('../../assets/logo-3.png')}
            resizeMode="contain"
            style={{ width: 192, height: 40 }}
          />
        </View>

        {/* ── Step 1 ─────────────────────────────────────── */}
        {step === 1 && (
          <View style={{ gap: 32 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', letterSpacing: -0.5 }}>
              {L('Registrieren, um fortzufahren', 'Sign up to continue')}
            </Text>

            <View style={{ gap: 24 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={L('E-Mail eingeben', 'Enter your email')}
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                style={{ width: '100%', height: 58, paddingHorizontal: 20, fontSize: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, color: '#111827' }}
              />
              <TermsLine />
              <Pressable
                onPress={sendOtp}
                disabled={loading || !email}
                style={{ width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', opacity: (loading || !email) ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                  {loading ? L('Senden…', 'Sending…') : L('Registrieren', 'Sign up')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step 2 ─────────────────────────────────────── */}
        {step === 2 && (
          <View style={{ gap: 32 }}>
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', letterSpacing: -0.5 }}>
                {L('Wir haben Ihnen einen Code gesendet', "We've emailed you a code")}
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
                {L('Geben Sie den 6-stelligen Code ein, den wir gesendet haben an:', 'Enter the 6-digit code we sent to:')}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', textAlign: 'center' }}>{email}</Text>
            </View>

            <View style={{ paddingTop: 16, gap: 40 }}>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              <Pressable
                onPress={verifyOtp}
                disabled={loading || otp.length < 6}
                style={{ width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', opacity: (loading || otp.length < 6) ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                  {loading ? L('Wird geprüft…', 'Verifying…') : L('Code bestätigen', 'Verify code')}
                </Text>
              </Pressable>
              <Pressable onPress={sendOtp} disabled={loading} style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ color: '#0064E0', fontSize: 14, fontWeight: '600' }}>
                  {L('Keinen Code erhalten? Erneut senden', "Didn't receive a code? Resend")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step 3 ─────────────────────────────────────── */}
        {step === 3 && (
          <View style={{ gap: 32 }}>
            <View style={{ gap: 8, alignItems: 'center' }}>
              <View className="flex-row items-center justify-center" style={{ gap: 8 }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', letterSpacing: -0.5 }}>
                  {L('E-Mail bestätigt', 'Email address confirmed')}
                </Text>
                <View style={{ width: 22, height: 22, backgroundColor: '#10B981', borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
                  <CheckCircle2 size={20} color="#FFFFFF" />
                </View>
              </View>
              <Text style={{ fontSize: 14, color: '#6B7280', fontWeight: '500' }}>
                {L('Konto fertig einrichten', 'Finish setting up your account')}
              </Text>
            </View>

            <View style={{ gap: 24 }}>
              <LabelledInput label={L('E-Mail', 'Email')} value={email} editable={false} disabledBg />

              <LabelledInput
                label={L('Vollständiger Name', 'Full name')}
                value={fullName}
                onChangeText={setFullName}
                placeholder={L('Ihren vollständigen Namen eingeben', 'Enter your full name')}
                autoCapitalize="words"
              />

              {/* Password with strength meter */}
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginLeft: 4 }}>
                  {L('Passwort', 'Password')}
                </Text>
                <View style={{ position: 'relative', justifyContent: 'center' }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={L('Sicheres Passwort erstellen', 'Create a secure password')}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={{ width: '100%', height: 54, paddingLeft: 20, paddingRight: 44, fontSize: 15, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 12, color: '#111827' }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    style={{ position: 'absolute', right: 12, padding: 4 }}
                  >
                    {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                  </Pressable>
                </View>
                {/* Strength bars */}
                <View className="flex-row" style={{ gap: 6, paddingHorizontal: 2, paddingTop: 4 }}>
                  {[1, 2, 3, 4].map((lvl) => (
                    <View
                      key={lvl}
                      style={{ height: 6, flex: 1, borderRadius: 999, backgroundColor: passwordStrength >= lvl ? strengthColor : '#F3F4F6' }}
                    />
                  ))}
                </View>
                {password.length > 0 && (
                  <Text style={{ fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4, color: strengthColor }}>
                    {strengthLabel}
                  </Text>
                )}
              </View>

              <TermsLine />

              <Pressable
                onPress={completeSetup}
                disabled={loading || !fullName || password.length < 6}
                style={{ width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', opacity: (loading || !fullName || password.length < 6) ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                  {loading ? L('Speichern…', 'Saving…') : L('Weiter', 'Continue')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )

  function TermsLine() {
    return (
      <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, paddingHorizontal: 8 }}>
        {locale === 'de' ? (
          <>
            Mit der Registrierung akzeptiere ich die LokShift{' '}
            <Text style={{ color: '#0064E0', fontWeight: '500' }}>Nutzungsbedingungen</Text>
            {' '}und erkenne die{' '}
            <Text style={{ color: '#0064E0', fontWeight: '500' }}>Datenschutzerklärung</Text> an.
          </>
        ) : (
          <>
            By signing up, I accept the LokShift{' '}
            <Text style={{ color: '#0064E0', fontWeight: '500' }}>Terms of Service</Text>
            {' '}and acknowledge the{' '}
            <Text style={{ color: '#0064E0', fontWeight: '500' }}>Privacy Policy</Text>.
          </>
        )}
      </Text>
    )
  }
}

function LabelledInput({
  label, value, onChangeText, placeholder, autoCapitalize, editable, disabledBg,
}: {
  label: string
  value: string
  onChangeText?: (v: string) => void
  placeholder?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
  editable?: boolean
  disabledBg?: boolean
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827', marginLeft: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        autoCapitalize={autoCapitalize}
        editable={editable !== false}
        style={{
          width: '100%', height: 54, paddingHorizontal: 20, fontSize: 15,
          backgroundColor: disabledBg ? '#F9FAFB' : '#FFFFFF',
          borderWidth: disabledBg ? 1 : 2,
          borderColor: disabledBg ? '#F3F4F6' : '#E5E7EB',
          borderRadius: 12,
          color: disabledBg ? '#9CA3AF' : '#111827',
        }}
      />
    </View>
  )
}
