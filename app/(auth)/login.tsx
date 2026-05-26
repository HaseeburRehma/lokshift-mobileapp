/**
 * Login — pixel-parity port of the webapp's login/page.tsx.
 *
 *   Welcome state (showForm=false):
 *     - blue background (#0064E0) edge-to-edge
 *     - subtle blurred white halos in the corners
 *     - logo top-left, language toggle top-right
 *     - centered splash illustration + welcome heading
 *     - Login (white) / Register (outlined) buttons stacked w/ gap-4
 *     - Privacy notice + "Problems signing in?" at the bottom
 *
 *   Form state:
 *     - same blue background
 *     - "Continue signing in" + subtitle, left-aligned
 *     - white email/password inputs sit directly on the blue background
 *       (NO surrounding card — matches the webapp)
 *     - Remember me + Forgot password row
 *     - Sign in button (white bg, brand text), "← Back" link
 *
 * Splash plays once per install (sessionStorage flag in webapp,
 * AsyncStorage here).
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Image, Pressable, AppState, ScrollView, TextInput } from 'react-native'
import { Link, useRouter } from 'expo-router'
import { Globe, Eye, EyeOff } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import { SplashScreen } from '@/components/SplashScreen'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { getSupabase } from '@/lib/supabase/client'

const REMEMBER_KEY = 'lokshift.remember'
const SEEN_SPLASH_KEY = 'lokshift.seenSplash'

let listenerInstalled = false
function installRememberListener() {
  if (listenerInstalled) return
  listenerInstalled = true
  AppState.addEventListener('change', async (state) => {
    if (state !== 'background') return
    const remember = await AsyncStorage.getItem(REMEMBER_KEY)
    if (remember === 'false') {
      await getSupabase().auth.signOut()
    }
  })
}

export default function LoginScreen() {
  const { t, locale, setLocale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()

  const [showSplash, setShowSplash] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(SEEN_SPLASH_KEY).then((v) => {
      if (v === 'true') setShowSplash(false)
    })
  }, [])

  const onSplashComplete = () => {
    AsyncStorage.setItem(SEEN_SPLASH_KEY, 'true').catch(() => {})
    setShowSplash(false)
  }

  const toggleLanguage = () => setLocale(locale === 'de' ? 'en' : 'de')

  const onSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    try {
      await AsyncStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false')
      installRememberListener()
      const { error } = await getSupabase().auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: any) {
      toast.error(err?.message || t('auth.invalid'))
    } finally {
      setLoading(false)
    }
  }

  if (showSplash) {
    return <SplashScreen onComplete={onSplashComplete} />
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0064E0' }}>
      {/* Background halos — match webapp's blurred decor circles */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50%', height: '40%', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999 }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50%', height: '40%', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999 }} />

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: 56, paddingBottom: 32, paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header: logo + language toggle (matches webapp lines 79-102) */}
        <View className="flex-row items-center justify-between">
          <Image
            source={require('../../assets/logo-1.png')}
            resizeMode="contain"
            style={{ width: 128, height: 32 }}
          />
          <Pressable onPress={toggleLanguage} className="p-2" accessibilityLabel="Language">
            <Globe size={24} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>

        {!showForm ? (
          <View style={{ flex: 1 }} className="items-center pt-8">
            {/* Centered hero */}
            <View className="flex-1 items-center justify-center" style={{ gap: 48 }}>
              <Image
                source={require('../../assets/splash.png')}
                resizeMode="contain"
                style={{ width: 256, height: 256 }}
              />
              <Text className="text-white font-bold text-center px-4" style={{ fontSize: 24, lineHeight: 30 }}>
                {t('auth.welcome')}
              </Text>
            </View>

            {/* LoginButtons block — gap-4 stacked, matches webapp */}
            <View style={{ width: '100%', maxWidth: 384, gap: 16 }}>
              <Pressable
                onPress={() => setShowForm(true)}
                style={{ height: 56, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#0064E0', fontSize: 18, fontWeight: '600' }}>
                  {t('auth.login')}
                </Text>
              </Pressable>
              <Link href="/(auth)/register" asChild>
                <Pressable
                  style={{ height: 56, borderRadius: 12, backgroundColor: 'transparent', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '600' }}>
                    {t('auth.register')}
                  </Text>
                </Pressable>
              </Link>
              <View style={{ alignItems: 'center', marginTop: 16 }}>
                <Link href="/(auth)/forgot-password" asChild>
                  <Pressable>
                    <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 14, fontWeight: '500' }}>
                      {t('auth.forgot_password')}
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </View>

            {/* Privacy notice */}
            <View style={{ marginTop: 32, alignItems: 'center', paddingBottom: 32 }}>
              <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 10, textAlign: 'center', maxWidth: 280, lineHeight: 14 }}>
                {L(
                  'Mit der Registrierung stimmen Sie unserem Datenschutzhinweis & unserer Datenschutzerklärung zu',
                  'By signing up, you agree to the Privacy Notice & Privacy Policy',
                )}
              </Text>
            </View>
          </View>
        ) : (
          /* ── Form state ────────────────────────────────────────────── */
          <View style={{ flex: 1, paddingTop: 48, width: '100%', maxWidth: 384, alignSelf: 'center' }}>
            <View style={{ marginBottom: 32 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 32, marginBottom: 8 }}>
                {L('Anmeldung fortsetzen', 'Continue signing in')}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 14 }}>
                {L(
                  'Bitte geben Sie Ihre Zugangsdaten ein, um sich anzumelden.',
                  'Please enter your details to sign in into your account',
                )}
              </Text>
            </View>

            <View style={{ gap: 20 }}>
              {/* Email */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>
                  {L('E-Mail', 'Email')}
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder={L('E-Mail eingeben', 'Enter your email')}
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  style={{ height: 56, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, color: '#111827', fontSize: 16 }}
                />
              </View>

              {/* Password */}
              <View style={{ gap: 6 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>
                  {L('Passwort', 'Password')}
                </Text>
                <View style={{ position: 'relative', justifyContent: 'center' }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder={L('Passwort eingeben', 'Enter your password')}
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="password"
                    style={{ height: 56, backgroundColor: '#FFFFFF', borderRadius: 12, paddingLeft: 16, paddingRight: 48, color: '#111827', fontSize: 16 }}
                  />
                  <Pressable
                    onPress={() => setShowPassword((v) => !v)}
                    style={{ position: 'absolute', right: 12, padding: 4 }}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                  </Pressable>
                </View>
              </View>

              {/* Remember me + Forgot password */}
              <View className="flex-row items-center justify-between" style={{ marginTop: 4 }}>
                <Pressable onPress={() => setRemember((r) => !r)} className="flex-row items-center" hitSlop={6}>
                  <View
                    style={{
                      height: 18, width: 18, borderRadius: 4, borderWidth: 2,
                      backgroundColor: remember ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
                      borderColor: remember ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
                      marginRight: 8, alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {remember && <Text style={{ color: '#0064E0', fontSize: 11, fontWeight: '900' }}>✓</Text>}
                  </View>
                  <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 13 }}>
                    {L('Angemeldet bleiben', 'Remember me')}
                  </Text>
                </Pressable>

                <Link href="/(auth)/forgot-password" asChild>
                  <Pressable>
                    <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 13 }}>
                      {L('Passwort vergessen?', 'Forgot password?')}
                    </Text>
                  </Pressable>
                </Link>
              </View>

              {/* Sign in button */}
              <Pressable
                onPress={onSubmit}
                disabled={loading || !email || !password}
                style={{
                  height: 56, marginTop: 24, borderRadius: 12, backgroundColor: '#FFFFFF',
                  alignItems: 'center', justifyContent: 'center',
                  opacity: (loading || !email || !password) ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#0064E0', fontWeight: '700', fontSize: 16 }}>
                  {loading
                    ? L('Anmeldung läuft…', 'Signing in…')
                    : L('Anmelden', 'Sign in')}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setShowForm(false)}
              style={{ marginTop: 32, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 14, fontWeight: '500' }}>
                {L('← Zurück', '← Back')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
