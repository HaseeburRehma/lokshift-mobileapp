/**
 * Forgot password — pixel-parity port of the webapp's ForgotPasswordFlow.
 *
 * Visual structure (white background):
 *   Top bar: back chevron (blue), Cancel link (blue) right
 *   Centered logo-3 (160x40)
 *
 *   Step 1: "Let's verify it's you" title + "Select the option to verify…"
 *     - email input (54px, gray border)
 *     - big "Email" button row (gray border, mail icon, chevron right)
 *   Step 2: "Enter your OTP" + validity hint
 *     - OTP boxes
 *     - blue Continue button
 *     - "Resend" link
 *   Step 3: "Enter new password" + match hint
 *     - new password (eye toggle)
 *     - confirm password
 *     - Continue button
 *   Step 4: success modal — overlay with checkmark + Continue to login
 *
 * Uses the webapp's POST /api/auth/send-recovery so the user gets a
 * single email with both a magic link AND a 6-digit OTP.
 */

import React, { useState } from 'react'
import { View, Text, Image, Pressable, ScrollView, TextInput, Modal } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronRight, Mail, Eye, EyeOff, CheckCircle2 } from 'lucide-react-native'
import Constants from 'expo-constants'

import { OtpInput } from '@/components/OtpInput'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

export default function ForgotPasswordScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const goBack = useSafeBack('/(auth)/login')

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const webappUrl =
    Constants.expoConfig?.extra?.webappUrl ??
    process.env.EXPO_PUBLIC_WEBAPP_URL ??
    ''

  const sendResetEmail = async () => {
    if (!email) {
      toast.info(L('Bitte zuerst E-Mail eingeben.', 'Please enter your email first.'))
      return
    }
    setLoading(true)
    try {
      if (!webappUrl) {
        const { error } = await getSupabase().auth.resetPasswordForEmail(email)
        if (error) throw error
      } else {
        const res = await fetch(`${webappUrl}/api/auth/send-recovery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, locale }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to send recovery email')
        }
      }
      toast.success(L('Code gesendet', 'Code sent'))
      if (step === 1) setStep(2)
    } catch (err: any) {
      toast.error(err?.message || L('Fehler beim Senden', 'Could not send code'))
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async () => {
    if (otp.length < 6) return
    setLoading(true)
    try {
      const { error } = await getSupabase().auth.verifyOtp({
        email, token: otp, type: 'recovery',
      })
      if (error) throw error
      setStep(3)
      toast.success(L('Code bestätigt!', 'OTP verified!'))
    } catch (err: any) {
      toast.error(err?.message || L('Ungültiger Code', 'Invalid code'))
    } finally {
      setLoading(false)
    }
  }

  const updatePassword = async () => {
    if (newPassword.length < 8) {
      toast.error(L('Mindestens 8 Zeichen.', 'At least 8 characters.'))
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error(L('Passwörter stimmen nicht überein', 'Passwords must match'))
      return
    }
    setLoading(true)
    try {
      const supabase = getSupabase()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error

      // Clear must_change_password if it was set.
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() } as any)
          .eq('id', user.id)
      }

      setStep(4)
    } catch (err: any) {
      toast.error(err?.message || L('Aktualisierung fehlgeschlagen', 'Error updating password'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between" style={{ paddingHorizontal: 8, paddingTop: 16, paddingBottom: 24 }}>
        <Pressable
          onPress={() => (step > 1 && step < 4 ? setStep((step - 1) as 1 | 2 | 3) : goBack())}
          style={{ padding: 8, borderRadius: 999 }}
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={24} color="#0064E0" />
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(auth)/login')}
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ color: '#0064E0', fontSize: 15, fontWeight: '500' }}>
            {L('Abbrechen', 'Cancel')}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' }} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={{ marginBottom: 40, marginTop: 16 }}>
          <Image
            source={require('../../assets/logo-3.png')}
            resizeMode="contain"
            style={{ width: 160, height: 40 }}
          />
        </View>

        {/* ── Step 1 ─────────────────────────────────────── */}
        {step === 1 && (
          <View style={{ width: '100%', gap: 32 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827' }}>
                {L('Identität bestätigen', "Let's Verify it's You")}
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
                {L('Wählen Sie die Option, um sich zu verifizieren.', 'Select the option to verify yourself.')}
              </Text>
            </View>

            <View style={{ gap: 16, alignItems: 'center', paddingBottom: 32 }}>
              <View style={{ width: '100%', gap: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 4 }}>
                  {L('E-Mail eingeben', 'Enter your email')}
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="email@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={{ width: '100%', height: 56, paddingHorizontal: 16, fontSize: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, color: '#111827' }}
                />
              </View>

              <Pressable
                onPress={sendResetEmail}
                disabled={!email || loading}
                style={{ width: '100%', height: 64, borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: (!email || loading) ? 0.5 : 1 }}
              >
                <View className="flex-row items-center" style={{ gap: 12 }}>
                  <View style={{ padding: 8, backgroundColor: '#F9FAFB', borderRadius: 8 }}>
                    <Mail size={20} color="#9CA3AF" />
                  </View>
                  <Text style={{ color: '#374151', fontWeight: '600', fontSize: 15 }}>{L('E-Mail', 'Email')}</Text>
                </View>
                <ChevronRight size={20} color="#D1D5DB" />
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step 2 ─────────────────────────────────────── */}
        {step === 2 && (
          <View style={{ width: '100%', gap: 24 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827' }}>
                {L('OTP eingeben', 'Enter Your OTP')}
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>
                {L('Es ist 1 Minute lang gültig. Bitte überprüfen Sie Ihren Spam-Ordner.', 'It will be valid for 1 minute. Please check your spam folder.')}
              </Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', maxWidth: 280 }}>
                {L('Tipp: Sie können stattdessen auch den Link in der E-Mail antippen.', 'Tip: you can also just tap the link in the email.')}
              </Text>
            </View>

            <View style={{ gap: 24 }}>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} />
              <Pressable
                onPress={verifyOtp}
                disabled={loading || otp.length < 6}
                style={{ width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', opacity: (loading || otp.length < 6) ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>
                  {loading ? L('Wird geprüft…', 'Verifying…') : L('Weiter', 'Continue')}
                </Text>
              </Pressable>
              <Pressable onPress={sendResetEmail} disabled={loading} style={{ alignSelf: 'center', padding: 4 }}>
                <Text style={{ color: '#0064E0', fontSize: 14, fontWeight: '500' }}>
                  {L('Code erneut senden', 'Resend code')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Step 3 ─────────────────────────────────────── */}
        {step === 3 && (
          <View style={{ width: '100%', gap: 24 }}>
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827' }}>
                {L('Neues Passwort eingeben', 'Enter New Password')}
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 }}>
                {L('Passwort und Bestätigung müssen übereinstimmen.', 'Password and confirm password must match.')}
              </Text>
            </View>

            <View style={{ gap: 24 }}>
              {/* New password */}
              <PwField
                label={L('Neues Passwort', 'New password')}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="********"
                show={showNewPw}
                onToggleShow={() => setShowNewPw((v) => !v)}
              />
              {/* Confirm */}
              <PwField
                label={L('Passwort bestätigen', 'Confirm new password')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="********"
                show={showConfirmPw}
                onToggleShow={() => setShowConfirmPw((v) => !v)}
              />

              <Pressable
                onPress={updatePassword}
                disabled={loading || !newPassword || newPassword !== confirmPassword}
                style={{
                  width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0',
                  alignItems: 'center', justifyContent: 'center',
                  opacity: (loading || !newPassword || newPassword !== confirmPassword) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>
                  {loading ? L('Aktualisierung…', 'Updating…') : L('Weiter', 'Continue')}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── Step 4 — success modal ────────────────────── */}
      <Modal visible={step === 4} transparent animationType="fade" onRequestClose={() => router.replace('/(auth)/login')}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 360, backgroundColor: '#FFFFFF', borderRadius: 24, padding: 40, alignItems: 'center' }}>
            <View style={{ backgroundColor: '#ECFDF5', padding: 16, borderRadius: 999, marginBottom: 24 }}>
              <CheckCircle2 size={48} color="#10B981" />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8, textAlign: 'center' }}>
              {L('Passwort erfolgreich geändert', 'Password successfully changed')}
            </Text>
            <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
              {L('Ihr Passwort wurde erfolgreich geändert. Sie können sich jetzt mit Ihrem neuen Passwort anmelden.',
                 'Your password has been changed successfully. Now you can login with your new password.')}
            </Text>
            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={{ width: '100%', height: 56, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>
                {L('Weiter', 'Continue')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function PwField({ label, value, onChangeText, placeholder, show, onToggleShow }: {
  label: string
  value: string
  onChangeText: (v: string) => void
  placeholder: string
  show: boolean
  onToggleShow: () => void
}) {
  return (
    <View style={{ gap: 8, width: '100%' }}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151' }}>{label}</Text>
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          secureTextEntry={!show}
          autoCapitalize="none"
          style={{ width: '100%', height: 48, paddingLeft: 16, paddingRight: 44, fontSize: 15, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#E5E7EB', borderRadius: 8, color: '#111827' }}
        />
        <Pressable onPress={onToggleShow} style={{ position: 'absolute', right: 12, padding: 4 }}>
          {show ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
        </Pressable>
      </View>
    </View>
  )
}
