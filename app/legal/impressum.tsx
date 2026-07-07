/**
 * Impressum — German Telemediengesetz §5 / Medienstaatsvertrag §18
 * impressum requirement. Every commercial mobile app distributed in
 * Germany needs one in-app.
 *
 * The content below is a TEMPLATE — the publishing entity (Name,
 * address, contact, registry data, tax id, content responsible person)
 * MUST be filled in before submission. Replace the [PLATZHALTER]
 * tokens with the client's actual data.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, Linking } from 'react-native'
import { ChevronLeft, ExternalLink } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { useSafeBack } from '@/lib/use-safe-back'

export default function ImpressumScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const goBack = useSafeBack('/(tabs)/settings')

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Impressum', 'Imprint')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('Anbieter', 'Provider')}
          </Text>
          <Text className="text-[15px] font-black text-gray-900 dark:text-white">
            Rhein Maas Rail GmbH
          </Text>
          <Text className="text-[13px] text-gray-600 dark:text-slate-400 mt-1">
            Josefstraße 157{'\n'}
            52080 Aachen{'\n'}
            Deutschland
          </Text>
        </Card>

        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('Kontakt', 'Contact')}
          </Text>
          <Row label="E-Mail" value="lokshiftapp@gmail.com" link="mailto:lokshiftapp@gmail.com" />
          <Row label="Web" value="https://lokshift.app" link="https://lokshift.app" />
        </Card>

        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('Registereintrag', 'Registry')}
          </Text>
          <Row label={L('Handelsregister', 'Trade register')} value="HRB 28426" />
          <Row label={L('Registergericht', 'Court')} value="Amtsgericht Aachen" />
          <Row
            label={L('Vertretungsberechtigt', 'Authorised representatives')}
            value="Ali Adem Altay"
          />
        </Card>

        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('Steuer', 'Tax')}
          </Text>
          <Row
            label={L('Umsatzsteuer-ID', 'VAT ID')}
            value="DE451905461"
          />
        </Card>

        <Card className="mb-3">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('Inhaltlich verantwortlich gem. § 18 Abs. 2 MStV', 'Editorially responsible per § 18 (2) MStV')}
          </Text>
          <Text className="text-[14px] font-black text-gray-900 dark:text-white">
            Ali Adem Altay, Josefstraße 157, 52080 Aachen
          </Text>
        </Card>

        <Card>
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2">
            {L('EU-Streitschlichtung', 'EU dispute resolution')}
          </Text>
          <Text className="text-[12px] text-gray-600 dark:text-slate-400">
            {L(
              'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:',
              'The European Commission provides a platform for online dispute resolution (ODR):',
            )}
          </Text>
          <Pressable
            onPress={() => Linking.openURL('https://ec.europa.eu/consumers/odr').catch(() => {})}
            className="flex-row items-center mt-2"
          >
            <Text className="text-[13px] font-black text-brand">
              ec.europa.eu/consumers/odr
            </Text>
            <ExternalLink size={14} color="#0064E0" style={{ marginLeft: 4 }} />
          </Pressable>
          <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-3">
            {L(
              'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
              'We are not obliged or willing to participate in dispute resolution proceedings before a consumer arbitration board.',
            )}
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  )
}

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  const safeLink = link && /^(https:|mailto:|tel:)/i.test(link) ? link : undefined
  return (
    <View className="flex-row items-start py-2 border-b border-gray-50 dark:border-slate-800">
      <Text className="text-[12px] text-gray-500 dark:text-slate-400 w-28">{label}</Text>
      <View className="flex-1">
        {safeLink ? (
          <Pressable onPress={() => Linking.openURL(safeLink).catch(() => {})}>
            <Text className="text-[13px] font-bold text-brand">{value}</Text>
          </Pressable>
        ) : (
          <Text className="text-[13px] font-bold text-gray-900 dark:text-white">{value}</Text>
        )}
      </View>
    </View>
  )
}
