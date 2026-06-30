/**
 * Nutzungsbedingungen / Terms of Service. Required by both stores
 * (especially Google's "agreed to terms" requirement) and recommended
 * for any B2B SaaS to limit liability.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, Linking } from 'react-native'
import { ChevronLeft, ExternalLink } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { useTranslation } from '@/lib/i18n'
import { useSafeBack } from '@/lib/use-safe-back'

export default function AgbScreen() {
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
          {L('Nutzungsbedingungen', 'Terms of Service')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <Section title="§ 1 Geltungsbereich">
          Diese Nutzungsbedingungen regeln die Nutzung der mobilen LokShift-Applikation
          („App") durch berechtigte Mitarbeiter und Disponenten der Kundenorganisation,
          mit der ein gültiger Lizenzvertrag besteht.
        </Section>

        <Section title="§ 2 Berechtigung">
          Der Zugang zur App ist nur über eine durch den Arbeitgeber bereitgestellte
          Einladung möglich. Das Konto darf nicht an Dritte weitergegeben werden.
        </Section>

        <Section title="§ 3 Pflichten des Nutzers">
          • Anmeldedaten sind vertraulich zu behandeln.{'\n'}
          • Erfasste Zeiten müssen der tatsächlichen Arbeitsleistung entsprechen.{'\n'}
          • Standortdaten dürfen nicht manipuliert werden.{'\n'}
          • Chat-Funktionen sind ausschließlich für dienstliche Kommunikation zu nutzen.
        </Section>

        <Section title="§ 4 Verfügbarkeit">
          Wir bemühen uns um eine Verfügbarkeit von 99 %. Wartungsfenster werden
          rechtzeitig angekündigt. Ein dauerhaft störungsfreier Betrieb wird nicht
          zugesichert.
        </Section>

        <Section title="§ 5 Datenverarbeitung">
          Die Datenverarbeitung erfolgt im Rahmen der Datenschutzerklärung sowie eines
          gesonderten Auftragsverarbeitungsvertrags zwischen dem Arbeitgeber und der
          Rhein Maas Rail GmbH.
        </Section>

        <Section title="§ 6 Haftung">
          Wir haften nur für Schäden, die auf grober Fahrlässigkeit oder Vorsatz
          beruhen. Die Haftung für leichte Fahrlässigkeit ist – außer bei Verletzung
          wesentlicher Vertragspflichten – ausgeschlossen.
        </Section>

        <Section title="§ 7 Beendigung">
          Bei Ende des Arbeitsverhältnisses wird das Konto vom Arbeitgeber deaktiviert.
          Persönliche Daten werden gemäß Datenschutzerklärung gespeichert oder gelöscht.
        </Section>

        <Section title="§ 8 Änderungen">
          Wir behalten uns vor, diese Bedingungen anzupassen. Änderungen werden in der
          App angekündigt; die fortgesetzte Nutzung gilt als Zustimmung.
        </Section>

        <Section title="§ 9 Anwendbares Recht">
          Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist
          Aachen, sofern der Nutzer Kaufmann ist.
        </Section>

        <View style={{ marginTop: 12 }}>
          <Pressable
            onPress={() =>
              Linking.openURL('https://lokshift.app/agb').catch(() => {})
            }
            className="flex-row items-center px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700"
          >
            <Text className="text-[13px] font-bold text-brand flex-1">
              {L('Vollständige Fassung im Web', 'Full version on the web')}
            </Text>
            <ExternalLink size={16} color="#0064E0" />
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-4">
      <Text className="text-[14px] font-black text-gray-900 dark:text-white mb-2">
        {title}
      </Text>
      <Text className="text-[12px] text-gray-700 dark:text-slate-300 leading-5">
        {children}
      </Text>
    </View>
  )
}
