/**
 * Localization sub-page — language, timezone (read-only), date format.
 *
 * Language change persists via the existing i18n context; date format
 * via a small per-device preference store. Timezone is read from the
 * device's Intl resolved options for display; the app uses ISO
 * timestamps end-to-end so changing the device timezone is enough.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Globe, Clock, Calendar } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import {
  getDateFormat,
  setDateFormat,
  DATE_FORMAT_EXAMPLES,
  deviceTimezone,
  type DateFormat,
} from '@/lib/preferences'
import { useSafeBack } from '@/lib/use-safe-back'

export default function LocalizationScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { locale, setLocale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [dateFormat, setDateFormatState] = useState<DateFormat>('de')

  useEffect(() => {
    getDateFormat().then(setDateFormatState)
  }, [])

  const tz = deviceTimezone()

  const chooseDateFormat = async (v: DateFormat) => {
    setDateFormatState(v)
    await setDateFormat(v)
    toast.success(L('Format gespeichert', 'Format saved'))
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Lokalisierung', 'Localization')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Globe size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Sprache, Zeitzone, Datum', 'Language, timezone, date')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Wirkt sich nur auf dieses Gerät aus.',
                'Affects this device only.',
              )}
            </Text>
          </View>
        </View>

        {/* Language */}
        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-3">
            {L('Sprache', 'Language')}
          </Text>
          <View className="flex-row gap-2">
            {(['de', 'en'] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => {
                  setLocale(lang)
                  toast.success(L('Sprache geändert', 'Language changed'))
                }}
                className={`flex-1 py-3 rounded-xl items-center border-2 ${
                  locale === lang ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                }`}
              >
                <Text
                  className={`text-[14px] font-black ${
                    locale === lang ? 'text-white' : 'text-gray-700 dark:text-slate-300'
                  }`}
                >
                  {lang === 'de' ? 'Deutsch' : 'English'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* Timezone */}
        <Card className="mb-3">
          <View className="flex-row items-center mb-2">
            <Clock size={16} color="#0064E0" />
            <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-2">
              {L('Zeitzone', 'Timezone')}
            </Text>
          </View>
          <Text className="text-[15px] font-black text-gray-900 dark:text-white">{tz}</Text>
          <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-2">
            {L(
              'Wird vom Gerät übernommen. In den Systemeinstellungen änderbar.',
              'Read from the device. Change it in system settings.',
            )}
          </Text>
        </Card>

        {/* Date format */}
        <Card className="mb-3">
          <View className="flex-row items-center mb-3">
            <Calendar size={16} color="#0064E0" />
            <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-2">
              {L('Datumsformat', 'Date format')}
            </Text>
          </View>
          {(['de', 'iso', 'us'] as DateFormat[]).map((opt, i) => {
            const sel = dateFormat === opt
            const label =
              opt === 'de'
                ? L('Deutsch', 'European')
                : opt === 'iso'
                ? 'ISO 8601'
                : L('US', 'US')
            return (
              <Pressable
                key={opt}
                onPress={() => chooseDateFormat(opt)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: '#F1F5F9',
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: sel ? '#0064E0' : '#CBD5E1',
                    backgroundColor: sel ? '#0064E0' : '#fff',
                    marginRight: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {sel && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: '#fff',
                      }}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-[14px] font-bold text-gray-900 dark:text-white">{label}</Text>
                  <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    {DATE_FORMAT_EXAMPLES[opt]}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </Card>

        <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-2 text-center">
          {L(
            'Sprache wird auch in PDF-Exporten verwendet.',
            'Language is also used in PDF exports.',
          )}
        </Text>
      </ScrollView>
    </Screen>
  )
}
