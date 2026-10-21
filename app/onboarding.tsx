/**
 * First-login onboarding — mirrors the webapp's app/(auth)/onboarding/page.tsx
 * with WalkthroughCarousel + PermissionsScreen:
 *
 *   Walkthrough (3 slides): back chevron · progress pills (w-12 active /
 *   w-4 gray-100) · square illustration (zoom-in) · 26px extrabold title +
 *   15px gray-400 body · "Weiter >" (brand) + "Überspringen" (outlined).
 *
 *   Permissions: back chevron · 4 progress pills · walkthrough4 illustration ·
 *   "Benachrichtigungen erlauben" (requests the OS permission, then finishes)
 *   + "Nicht jetzt" (finishes).
 *
 * Only employees that haven't set profiles.onboarding_completed=true land
 * here — the AuthGuard handles the routing.
 */

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Image, Pressable, Animated, Easing } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import * as Notifications from 'expo-notifications'

import { Screen } from '@/components/Screen'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { toast } from '@/components/Toast'

const BRAND = '#0064E0'

const SLIDE_ASSETS = [
  require('../assets/walkthrough1.png'),
  require('../assets/walkthrough2.png'),
  require('../assets/walkthrough3.png'),
]
const PERMISSION_ASSET = require('../assets/walkthrough4.png')

export default function OnboardingScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session, refreshProfile } = useUser()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // 0..2 = walkthrough, 3 = permissions
  const [step, setStep] = useState(0)
  const [requesting, setRequesting] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Web: illustration "animate-in zoom-in-95 duration-500" on every slide.
  const imgIn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    imgIn.setValue(0)
    Animated.timing(imgIn, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [step, imgIn])

  const SLIDES = [
    { title: t('onboarding.slide1.title'), body: t('onboarding.slide1.body') },
    { title: t('onboarding.slide2.title'), body: t('onboarding.slide2.body') },
    { title: t('onboarding.slide3.title'), body: t('onboarding.slide3.body') },
  ]
  const onPermissions = step >= SLIDES.length

  const next = () => {
    if (step < SLIDES.length - 1) setStep(step + 1)
    else setStep(SLIDES.length) // → permissions
  }
  const back = () => {
    if (step > 0) setStep(step - 1)
  }
  // Web: "Skip" completes the carousel and opens the permissions screen.
  const skip = () => setStep(SLIDES.length)

  const finish = async () => {
    if (!session?.user?.id || submitting) return
    setSubmitting(true)
    try {
      await getSupabase()
        .from('profiles')
        .update({ onboarding_completed: true, updated_at: new Date().toISOString() } as any)
        .eq('id', session.user.id)
      await refreshProfile()
      toast.success(L('Bereit!', 'All set!'))
      router.replace('/(tabs)/home')
    } catch (err: any) {
      toast.error(err?.message || L('Fehler', 'Error'))
    } finally {
      setSubmitting(false)
    }
  }

  const allowNotifications = async () => {
    if (requesting || submitting) return
    setRequesting(true)
    try {
      // expo-notifications v0.32 changed the response shape — `granted`
      // is the canonical boolean field on both versions.
      const existing: any = await Notifications.getPermissionsAsync()
      if (!existing?.granted && existing?.canAskAgain !== false) {
        await Notifications.requestPermissionsAsync()
      }
    } catch (err) {
      console.warn('[Onboarding] notifications permission failed:', err)
    } finally {
      setRequesting(false)
      // Web: finishes onboarding regardless of the user's choice.
      finish()
    }
  }

  const slide = onPermissions ? null : SLIDES[step]
  const asset = onPermissions ? PERMISSION_ASSET : SLIDE_ASSETS[step]
  const title = onPermissions
    ? L('Bleiben Sie informiert mit Push-Benachrichtigungen', 'Stay Informed with Push Notification')
    : slide?.title ?? ''
  const body = onPermissions ? t('onboarding.permissions.notifications_body') : slide?.body ?? ''

  const primaryLabel = onPermissions
    ? requesting
      ? L('Wird angefragt…', 'Requesting...')
      : submitting
        ? t('common.loading')
        : L('Benachrichtigungen erlauben', 'Allow Notifications')
    : step === SLIDES.length - 1
      ? `${t('onboarding.start')} >`
      : `${t('onboarding.next')} >`
  const secondaryLabel = onPermissions ? L('Nicht jetzt', 'Not Now') : t('onboarding.skip')
  const busy = requesting || submitting

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <View style={{ flex: 1, width: '100%', maxWidth: 448, alignSelf: 'center' }}>
        {/* Header & progress */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16 }}>
          <View style={{ width: 40 }}>
            {step > 0 ? (
              <Pressable
                onPress={onPermissions ? () => setStep(SLIDES.length - 1) : back}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={L('Zurück', 'Back')}
                style={{ padding: 8, marginLeft: -8, borderRadius: 999 }}
              >
                <ChevronLeft size={24} color={BRAND} />
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {(onPermissions ? [0, 1, 2, 3] : SLIDES.map((_, i) => i)).map((i) => {
              const active = onPermissions ? i === 3 : i === step
              return (
                <View
                  key={i}
                  style={{
                    height: 6,
                    borderRadius: 999,
                    width: onPermissions || active ? 48 : 16,
                    backgroundColor: active ? BRAND : '#F3F4F6',
                  }}
                />
              )
            })}
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Illustration */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Animated.View
            style={{
              width: '100%',
              aspectRatio: 1,
              maxHeight: '100%',
              opacity: imgIn,
              transform: [{ scale: imgIn.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            }}
          >
            <Image source={asset} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          </Animated.View>
        </View>

        {/* Text content */}
        <View style={{ paddingHorizontal: 40, paddingBottom: 32, alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 26,
              lineHeight: 32,
              fontWeight: '800',
              color: '#111827',
              textAlign: 'center',
              letterSpacing: -0.4,
              marginBottom: 12,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 24,
              fontWeight: '500',
              color: '#9CA3AF',
              textAlign: 'center',
              paddingHorizontal: 8,
            }}
          >
            {body}
          </Text>
        </View>

        {/* Actions */}
        <View style={{ paddingHorizontal: 32, paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 12 }}>
          <Pressable
            onPress={onPermissions ? allowNotifications : next}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 12,
              backgroundColor: pressed ? '#0050B3' : BRAND,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.5 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
              shadowColor: '#3B82F6',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 3,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{primaryLabel}</Text>
          </Pressable>
          <Pressable
            onPress={onPermissions ? finish : skip}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => ({
              height: 56,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: '#EBF2FF',
              backgroundColor: pressed ? '#EFF6FF' : '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.5 : 1,
            })}
          >
            <Text style={{ color: BRAND, fontSize: 16, fontWeight: '700' }}>{secondaryLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  )
}
