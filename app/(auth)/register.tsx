/**
 * Register screen — REPURPOSED for Apple guideline 3.1.1 compliance.
 *
 * In v1.0.2 Apple flagged in-app account registration as an "external
 * mechanism for purchases" because organizations pay a SaaS subscription
 * outside the App Store. The fix is to remove account creation from the
 * mobile app entirely — the app is now sign-in only. New employees are
 * provisioned by their employer via the LokShift web platform.
 *
 * The route is kept alive so deep links don't 404, but the screen shows
 * only a "contact your employer" message with links back to login and
 * to the web platform (no purchase / subscription mechanism inside).
 */

import React from 'react'
import { View, Text, Pressable, Linking } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Info, ExternalLink } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useSafeBack } from '@/lib/use-safe-back'

export default function RegisterInfoScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const goBack = useSafeBack('/(auth)/login')
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: '#0064E0', paddingTop: insets.top + 8 }}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 }}>
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </View>
        </Pressable>
        <View style={{ width: 44 }} />
      </View>

      {/* Body */}
      <View style={{ flex: 1, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center', paddingBottom: 32 }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <Info size={40} color="#FFFFFF" />
        </View>

        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 24,
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: 12,
            letterSpacing: -0.5,
          }}
        >
          {L('Konten werden vom Arbeitgeber vergeben', 'Accounts are provisioned by employers')}
        </Text>

        <Text
          style={{
            color: 'rgba(255,255,255,0.9)',
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 32,
            maxWidth: 340,
          }}
        >
          {L(
            'LokShift ist eine mobile Anwendung für Mitarbeiter von Bahnbetrieben. Der Zugang erfolgt über eine Einladung durch Ihre Organisation.',
            'LokShift is a mobile app for rail-operations crews. Access is granted via an invitation from your organisation.',
          )}
        </Text>

        <View style={{ width: '100%', maxWidth: 340, gap: 12 }}>
          <Pressable onPress={() => router.replace('/(auth)/login')}>
            <View
              style={{
                height: 52,
                borderRadius: 12,
                backgroundColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#0064E0', fontSize: 16, fontWeight: '700' }}>
                {L('Zur Anmeldung', 'Back to sign in')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => Linking.openURL('https://lokshift.de').catch(() => {})}
          >
            <View
              style={{
                height: 52,
                borderRadius: 12,
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginRight: 8 }}>
                {L('Mehr auf lokshift.de erfahren', 'Learn more at lokshift.de')}
              </Text>
              <ExternalLink size={16} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  )
}
