/**
 * First-login onboarding — 3-slide walkthrough then a permissions screen.
 * Mirrors the webapp's app/(auth)/onboarding/page.tsx + WalkthroughCarousel
 * + PermissionsScreen.
 *
 * Only employees that haven't set profiles.onboarding_completed=true land
 * here — the AuthGuard handles the routing.
 */

import React, { useState } from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Bell, MapPin, CheckCircle2 } from 'lucide-react-native'
import * as Notifications from 'expo-notifications'

import { Screen } from '@/components/Screen'
import { Button } from '@/components/Button'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { toast } from '@/components/Toast'

const SLIDE_ASSETS = [
  require('../assets/walkthrough1.png'),
  require('../assets/walkthrough2.png'),
  require('../assets/walkthrough3.png'),
]

export default function OnboardingScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { session, refreshProfile } = useUser()
  const router = useRouter()

  // 0..2 = walkthrough, 3 = permissions
  const [step, setStep] = useState(0)
  const [notifGranted, setNotifGranted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const SLIDES = [
    { title: t('onboarding.slide1.title'), body: t('onboarding.slide1.body') },
    { title: t('onboarding.slide2.title'), body: t('onboarding.slide2.body') },
    { title: t('onboarding.slide3.title'), body: t('onboarding.slide3.body') },
  ]

  const next = () => {
    if (step < SLIDES.length - 1) setStep(step + 1)
    else setStep(SLIDES.length) // → permissions
  }
  const back = () => { if (step > 0) setStep(step - 1) }
  const skip = () => setStep(SLIDES.length) // jump straight to permissions

  const requestNotifications = async () => {
    try {
      // expo-notifications v0.32 changed the response shape from
      // { status, granted, … } to a richer object — `granted` is the
      // canonical boolean field on both versions, so we use that.
      const existing: any = await Notifications.getPermissionsAsync()
      let granted = !!existing?.granted
      if (!granted) {
        const requested: any = await Notifications.requestPermissionsAsync()
        granted = !!requested?.granted
      }
      setNotifGranted(granted)
    } catch (err) {
      console.warn('[Onboarding] notifications permission failed:', err)
    }
  }

  const finish = async () => {
    if (!session?.user?.id) return
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

  // Walkthrough phase
  if (step < SLIDES.length) {
    const slide = SLIDES[step]
    const asset = SLIDE_ASSETS[step]
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        {/* Header: back chevron + progress dots */}
        <View className="flex-row items-center justify-between px-6 pt-4">
          <View className="w-10">
            {step > 0 && (
              <Pressable onPress={back} className="p-2 -ml-2">
                <ChevronLeft size={22} color="#0064E0" />
              </Pressable>
            )}
          </View>
          <View className="flex-row items-center gap-2">
            {SLIDES.map((_, i) => (
              <View
                key={i}
                className="h-1.5 rounded-full"
                style={{
                  width: i === step ? 48 : 16,
                  backgroundColor: i === step ? '#0064E0' : '#E5E7EB',
                }}
              />
            ))}
          </View>
          <View className="w-10" />
        </View>

        {/* Illustration */}
        <View className="flex-1 items-center justify-center px-8">
          <Image
            source={asset}
            resizeMode="contain"
            style={{ width: '100%', aspectRatio: 1 }}
          />
        </View>

        {/* Text */}
        <View className="px-10 pb-8 items-center">
          <Text className="text-[24px] font-black text-gray-900 dark:text-white text-center tracking-tight leading-tight mb-2">
            {slide.title}
          </Text>
          <Text className="text-[14px] text-gray-400 dark:text-slate-500 text-center font-medium px-2 leading-relaxed">
            {slide.body}
          </Text>
        </View>

        {/* Actions */}
        <View className="px-6 pb-8 space-y-3">
          <Button
            label={step === SLIDES.length - 1 ? t('onboarding.start') : t('onboarding.next')}
            onPress={next}
            size="lg"
          />
          {step < SLIDES.length - 1 && (
            <Pressable onPress={skip} className="h-12 items-center justify-center">
              <Text className="text-brand text-[14px] font-bold">{t('onboarding.skip')}</Text>
            </Pressable>
          )}
        </View>
      </Screen>
    )
  }

  // Permissions phase
  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <View className="flex-row items-center px-6 pt-4">
        <Pressable onPress={() => setStep(SLIDES.length - 1)} className="p-2 -ml-2">
          <ChevronLeft size={22} color="#0064E0" />
        </Pressable>
      </View>

      <View className="flex-1 px-8 pt-4">
        <Text className="text-[26px] font-black text-gray-900 dark:text-white tracking-tight">
          {t('onboarding.permissions.title')}
        </Text>
        <Text className="text-[14px] text-gray-500 dark:text-slate-400 mt-2 mb-8">
          {t('onboarding.permissions.body')}
        </Text>

        <PermissionRow
          icon={<Bell size={22} color="#0064E0" />}
          title={t('onboarding.permissions.notifications')}
          body={t('onboarding.permissions.notifications_body')}
          granted={notifGranted}
          onPress={requestNotifications}
        />

        {/* Location row — informational only; actually requesting the
            permission requires expo-location which isn't installed in
            v1. We surface it here so the user knows the app will ask
            again later when needed. */}
        <PermissionRow
          icon={<MapPin size={22} color="#0064E0" />}
          title={t('onboarding.permissions.location')}
          body={t('onboarding.permissions.location_body')}
          granted={false}
          onPress={() => toast.info(L('Wird beim Ein-/Ausstempeln angefordert.', "Asked when clocking in/out."))}
          subtle
        />
      </View>

      <View className="px-6 pb-8">
        <Button
          label={submitting ? t('common.loading') : t('onboarding.finish')}
          onPress={finish}
          loading={submitting}
          size="lg"
        />
      </View>
    </Screen>
  )
}

function PermissionRow({
  icon, title, body, granted, onPress, subtle,
}: {
  icon: React.ReactNode
  title: string
  body: string
  granted: boolean
  onPress: () => void
  subtle?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl p-4 flex-row items-center mb-3 active:bg-gray-50 dark:bg-slate-950"
    >
      <View className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand/20 items-center justify-center mr-3">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-[14px] font-black text-gray-900 dark:text-white">{title}</Text>
        <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{body}</Text>
      </View>
      {granted ? (
        <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center">
          <CheckCircle2 size={20} color="#10B981" />
        </View>
      ) : (
        <View className="px-3 py-1.5 rounded-full bg-brand/10 dark:bg-brand/20">
          <Text className="text-brand text-[11px] font-bold">
            {subtle ? 'Later' : 'Allow'}
          </Text>
        </View>
      )}
    </Pressable>
  )
}
