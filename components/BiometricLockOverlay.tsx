/**
 * Full-screen lock overlay rendered when the BiometricLockProvider
 * reports `locked = true`. Auto-triggers the prompt on mount; offers a
 * manual "Entsperren" button if the user cancels and wants to retry.
 *
 * Includes a sign-out escape hatch so a user who can't unlock isn't
 * stranded — they can still log out and back in with their password.
 */

import React, { useEffect } from 'react'
import { View, Text, Pressable, Image, StatusBar } from 'react-native'
import { Lock, LogOut, Fingerprint } from 'lucide-react-native'

import { useBiometricLock } from '@/lib/biometric/lock-context'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'

export function BiometricLockOverlay() {
  const { locked, unlock } = useBiometricLock()
  const { signOut } = useUser()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  // Auto-prompt on mount so the user lands directly in the Face/Touch ID
  // dialog instead of having to tap a button.
  useEffect(() => {
    if (locked) {
      void unlock()
    }
    // We only want this effect to run when `locked` flips to true; the
    // unlock function identity is stable enough for this purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  if (!locked) return null

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#0064E0',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ alignItems: 'center', paddingHorizontal: 32 }}>
        <Image
          source={require('../assets/logo-3.png')}
          style={{ width: 160, height: 40, marginBottom: 24, tintColor: '#FFFFFF' }}
          resizeMode="contain"
        />
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Lock size={28} color="#FFFFFF" />
        </View>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 20,
            fontWeight: '900',
            marginBottom: 8,
            textAlign: 'center',
          }}
        >
          {L('Lokshift ist gesperrt', 'Lokshift is locked')}
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.85)',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 20,
            marginBottom: 40,
          }}
        >
          {L(
            'Entsperren Sie die App mit Face ID, Touch ID oder Ihrem Geräte-Code.',
            'Unlock with Face ID, Touch ID, or your device passcode.',
          )}
        </Text>

        <Pressable
          onPress={() => unlock()}
          style={{
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 28,
            paddingVertical: 14,
            borderRadius: 999,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Fingerprint size={20} color="#0064E0" />
          <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 15 }}>
            {L('Entsperren', 'Unlock')}
          </Text>
        </Pressable>

        <Pressable
          onPress={signOut}
          style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}
        >
          <LogOut size={16} color="rgba(255,255,255,0.75)" />
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' }}>
            {L('Abmelden', 'Sign out')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
