/**
 * Darstellung — theme picker behind the settings hub's "Design" row
 * (web hub: DARSTELLUNG → Design). Styled like the webapp settings
 * sub-pages.
 *
 * The app is currently locked to the light theme (lib/theme), so the
 * System / Dunkel options are shown but marked as coming soon; setPref
 * stays wired so the picker works as soon as the provider unlocks.
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Sun, Moon, SunMoon, Check } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import type { ThemePref } from '@/lib/preferences'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  Badge,
  FootNote,
  SC,
} from '@/components/settings/SettingsUI'

interface Opt {
  key: ThemePref
  icon: any
  iconColor: string
  label_de: string
  label_en: string
  desc_de: string
  desc_en: string
}

const OPTIONS: Opt[] = [
  {
    key: 'light',
    icon: Sun,
    iconColor: SC.amber500,
    label_de: 'Hell',
    label_en: 'Light',
    desc_de: 'Immer helles Design.',
    desc_en: 'Always light theme.',
  },
  {
    key: 'system',
    icon: SunMoon,
    iconColor: SC.blue600,
    label_de: 'System',
    label_en: 'System',
    desc_de: 'Folgt der Einstellung Ihres Geräts.',
    desc_en: 'Follows your device setting.',
  },
  {
    key: 'dark',
    icon: Moon,
    iconColor: SC.slate600,
    label_de: 'Dunkel',
    label_en: 'Dark',
    desc_de: 'Immer dunkles Design.',
    desc_en: 'Always dark theme.',
  },
]

export default function AppearanceScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { pref, setPref, scheme } = useTheme()
  // Only the light theme is shipped right now (see lib/theme).
  const available = (k: ThemePref) => k === 'light'

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={Sun}
        tileColor={SC.slate900}
        title={L('Darstellung', 'Appearance')}
        subtitle={L(
          `Erscheinungsbild der App. Aktiv: ${scheme === 'dark' ? 'Dunkel' : 'Hell'}.`,
          `How the app looks. Active: ${scheme === 'dark' ? 'Dark' : 'Light'}.`,
        )}
      />

      <SectionCard
        title={L('Design', 'Theme')}
        description={L('Wählen Sie das Farbschema für dieses Gerät.', 'Choose the colour scheme for this device.')}
      >
        {OPTIONS.map((opt, i) => {
          const Icon = opt.icon
          const sel = pref === opt.key
          const enabled = available(opt.key)
          return (
            <Pressable
              key={opt.key}
              onPress={() => {
                if (enabled) setPref(opt.key)
              }}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled: !enabled }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 14,
                borderBottomWidth: i === OPTIONS.length - 1 ? 0 : 1,
                borderBottomColor: SC.slate50,
                opacity: enabled ? 1 : 0.55,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: SC.slate50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Icon size={18} color={opt.iconColor} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: SC.slate800 }}>{L(opt.label_de, opt.label_en)}</Text>
                <Text style={{ fontSize: 12, color: SC.slate500, marginTop: 2 }}>{L(opt.desc_de, opt.desc_en)}</Text>
              </View>
              {sel ? (
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: SC.blue600,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={14} color="#FFFFFF" />
                </View>
              ) : !enabled ? (
                <Badge label={L('Bald', 'Soon')} />
              ) : null}
            </Pressable>
          )
        })}
      </SectionCard>

      <FootNote>
        {L(
          'LokShift nutzt derzeit das helle Design. System- und Dunkelmodus folgen in einem kommenden Update.',
          'LokShift currently uses the light theme. System and dark mode will follow in an upcoming update.',
        )}
      </FootNote>
    </SettingsShell>
  )
}
