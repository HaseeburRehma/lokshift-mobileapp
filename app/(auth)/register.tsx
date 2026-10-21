/**
 * Register screen — INFORMATIONAL ONLY (Apple guideline 3.1.1).
 *
 * In v1.0.2 Apple flagged in-app account registration as an "external
 * mechanism for purchases" because organizations pay a SaaS subscription
 * outside the App Store. The mobile app is sign-in only; new employees
 * are provisioned by their employer via the LokShift web platform.
 *
 * Visual shell mirrors the webapp's components/auth/RegisterForm.tsx
 * (white page, blue-50 back circle + "Abbrechen", centered logo-3,
 * 22px bold gray-900 heading, 56px brand button, gray-400 legal line) —
 * but with no form: just the explanation, a way back to sign-in and the
 * legal links.
 */

import React from 'react'
import { View, Text, Image, Pressable, ScrollView, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Building2, Mail, ExternalLink } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useSafeBack } from '@/lib/use-safe-back'
import { webappPath } from '@/lib/webapp-url'

const BRAND = '#0064E0'

export default function RegisterInfoScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const goBack = useSafeBack('/(auth)/login')
  const insets = useSafeAreaInsets()
  const toLogin = () => router.replace('/(auth)/login')

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top + 16 }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          height: 48,
        }}
      >
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={L('Zurück', 'Back')}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(239,246,255,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={24} color={BRAND} />
        </Pressable>
        <Pressable
          onPress={toLogin}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          style={{ paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ color: BRAND, fontSize: 15, fontWeight: '600' }}>{L('Abbrechen', 'Cancel')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, alignItems: 'center', paddingHorizontal: 32, paddingTop: 32, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 448, alignItems: 'center' }}>
          {/* Logo — web: relative w-48 h-10 */}
          <Image
            source={require('../../assets/logo-3.png')}
            resizeMode="contain"
            style={{ width: 192, height: 40, marginBottom: 48 }}
            accessibilityLabel="LokShift"
          />

          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: '#111827',
              letterSpacing: -0.3,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {L('Konten werden vom Arbeitgeber vergeben', 'Accounts are provisioned by employers')}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: '#6B7280', textAlign: 'center', marginBottom: 32 }}>
            {L(
              'LokShift ist eine mobile Anwendung für Mitarbeiter von Bahnbetrieben. Der Zugang erfolgt über eine Einladung durch Ihre Organisation.',
              'LokShift is a mobile app for rail-operations crews. Access is granted via an invitation from your organisation.',
            )}
          </Text>

          {/* How access works */}
          <View style={{ width: '100%', gap: 12, marginBottom: 32 }}>
            <InfoRow
              icon={<Building2 size={20} color={BRAND} />}
              title={L('Einladung durch Ihren Arbeitgeber', 'Invitation from your employer')}
              body={L(
                'Ihre Disposition legt Ihr Konto an. Sie erhalten die Zugangsdaten per E-Mail.',
                'Your dispatch team creates your account. You receive your login details by email.',
              )}
            />
            <InfoRow
              icon={<Mail size={20} color={BRAND} />}
              title={L('Mit der Einladung anmelden', 'Sign in with your invitation')}
              body={L(
                'Melden Sie sich mit E-Mail und Passwort an. Beim ersten Login legen Sie ein eigenes Passwort fest.',
                'Sign in with your email and password. On first login you set your own password.',
              )}
            />
          </View>

          <Pressable
            onPress={toLogin}
            accessibilityRole="button"
            style={({ pressed }) => ({
              width: '100%',
              height: 56,
              borderRadius: 12,
              backgroundColor: pressed ? '#0050B3' : BRAND,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.98 : 1 }],
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>{L('Zur Anmeldung', 'Back to sign in')}</Text>
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL('https://lokshift.de').catch(() => {})}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, marginTop: 4 }}
          >
            <Text style={{ color: BRAND, fontSize: 14, fontWeight: '600', marginRight: 6 }}>
              {L('Mehr auf lokshift.de erfahren', 'Learn more at lokshift.de')}
            </Text>
            <ExternalLink size={14} color={BRAND} />
          </Pressable>

          {/* Legal line — web TermsLine styling (12px gray-400, brand links) */}
          <Text style={{ fontSize: 12, lineHeight: 19, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 16, marginTop: 16 }}>
            {L('Es gelten die LokShift ', 'The LokShift ')}
            <Text style={{ color: BRAND, fontWeight: '500' }} onPress={() => Linking.openURL(webappPath('/agb')).catch(() => {})}>
              {L('Nutzungsbedingungen', 'Terms of Service')}
            </Text>
            {L(' und die ', ' and the ')}
            <Text style={{ color: BRAND, fontWeight: '500' }} onPress={() => Linking.openURL(webappPath('/datenschutz')).catch(() => {})}>
              {L('Datenschutzerklärung', 'Privacy Policy')}
            </Text>
            {L('.', ' apply.')}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function InfoRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
      }}
    >
      <View style={{ padding: 8, backgroundColor: '#F9FAFB', borderRadius: 8, marginRight: 12 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: '#374151' }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: '#6B7280', marginTop: 2 }}>{body}</Text>
      </View>
    </View>
  )
}
