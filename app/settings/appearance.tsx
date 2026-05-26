/**
 * Appearance — theme picker (system / light / dark).
 *
 * "System" follows the OS color scheme automatically; "Light" and
 * "Dark" override it per device. The pref is persisted via
 * lib/preferences and applied by lib/theme/ThemeProvider.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Sun,
  Moon,
  SunMoon,
  Check,
  Palette,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import type { ThemePref } from '@/lib/preferences'
import { useSafeBack } from '@/lib/use-safe-back'

interface Opt {
  key: ThemePref
  icon: React.ReactNode
  label_de: string
  label_en: string
  desc_de: string
  desc_en: string
}

const OPTIONS: Opt[] = [
  {
    key: 'system',
    icon: <SunMoon size={22} color="#0064E0" />,
    label_de: 'System',
    label_en: 'System',
    desc_de: 'Folgt der Einstellung Ihres Geräts.',
    desc_en: 'Follows your device setting.',
  },
  {
    key: 'light',
    icon: <Sun size={22} color="#F59E0B" />,
    label_de: 'Hell',
    label_en: 'Light',
    desc_de: 'Immer helles Design.',
    desc_en: 'Always light theme.',
  },
  {
    key: 'dark',
    icon: <Moon size={22} color="#475569" />,
    label_de: 'Dunkel',
    label_en: 'Dark',
    desc_de: 'Immer dunkles Design.',
    desc_en: 'Always dark theme.',
  },
]

export default function AppearanceScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { pref, setPref, scheme } = useTheme()

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Darstellung', 'Appearance')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Palette size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Erscheinungsbild', 'Theme')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                `Aktiv: ${scheme === 'dark' ? 'Dunkel' : 'Hell'}`,
                `Active: ${scheme === 'dark' ? 'Dark' : 'Light'}`,
              )}
            </Text>
          </View>
        </View>

        <Card style={{ padding: 0 } as any}>
          {OPTIONS.map((opt, i) => {
            const sel = pref === opt.key
            return (
              <Pressable
                key={opt.key}
                onPress={() => setPref(opt.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: '#F1F5F9',
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#F8FAFC',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  {opt.icon}
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                    {L(opt.label_de, opt.label_en)}
                  </Text>
                  <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    {L(opt.desc_de, opt.desc_en)}
                  </Text>
                </View>
                {sel && (
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: '#0064E0',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={14} color="#fff" />
                  </View>
                )}
              </Pressable>
            )
          })}
        </Card>

        <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-4 text-center">
          {L(
            'Dunkelmodus wird in den kommenden Updates auf alle Bildschirme ausgeweitet.',
            'Dark mode coverage is being expanded to all screens in upcoming updates.',
          )}
        </Text>
      </ScrollView>
    </Screen>
  )
}
