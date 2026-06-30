/**
 * Datenschutzerklärung — DSGVO-compliant privacy notice. Required by
 * App Store + Play Store + German law. Replace [PLATZHALTER] tokens
 * before publishing.
 *
 * The text below is a starting point that matches the data flows the
 * app actually performs (Supabase backend, location while clocked-in,
 * camera/mic/photo library on user action, biometric auth on-device).
 * Have it reviewed by counsel before launch.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, Linking } from 'react-native'
import { ChevronLeft, ExternalLink } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { useTranslation } from '@/lib/i18n'
import { useSafeBack } from '@/lib/use-safe-back'

export default function DatenschutzScreen() {
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
          {L('Datenschutzerklärung', 'Privacy Policy')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <Section title="1. Verantwortlicher">
          Rhein Maas Rail GmbH{'\n'}
          Josefstraße 157, 52080 Aachen{'\n'}
          E-Mail: lokshiftapp@gmail.com
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          • Stammdaten (Name, E-Mail, Telefon, Geburtsdatum, Geschlecht){'\n'}
          • Beschäftigungsdaten (Rolle, Arbeitszeitmodell, Soll-Stunden){'\n'}
          • Zeiterfassung (Start-/Endzeit, Pausen, Spesen, Ort){'\n'}
          • Einsatzpläne und Schichtdaten{'\n'}
          • Chat-Nachrichten und Anhänge (Bilder, Dateien, Sprachnachrichten){'\n'}
          • Standortdaten während aktiver Schichten (alle 5 Minuten){'\n'}
          • Geräteinformationen für Push-Benachrichtigungen{'\n'}
          • Profilbild (sofern hochgeladen){'\n'}
          • Qualifikationen und Zertifikate (sofern erfasst)
        </Section>

        <Section title="3. Rechtsgrundlagen">
          Die Verarbeitung erfolgt auf Grundlage von:{'\n\n'}
          • Art. 6 Abs. 1 lit. b DSGVO – Vertragserfüllung (Arbeitsvertrag){'\n'}
          • Art. 6 Abs. 1 lit. c DSGVO – Erfüllung gesetzlicher Pflichten (Arbeitszeitgesetz, Steuerrecht){'\n'}
          • Art. 6 Abs. 1 lit. f DSGVO – Berechtigte Interessen (Disposition, Sicherheit){'\n'}
          • Art. 6 Abs. 1 lit. a DSGVO – Einwilligung (optionale Funktionen wie biometrische Sperre)
        </Section>

        <Section title="4. Speicherort und Auftragsverarbeitung">
          Die Anwendungsdaten werden bei Supabase gehostet (Server in der EU). Mit
          dem Anbieter besteht ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.{'\n\n'}
          Optionales Crash-Reporting erfolgt anonymisiert über Sentry (sofern aktiviert).
        </Section>

        <Section title="5. Standortdaten">
          Während einer aktiven Schicht erfasst die App alle 5 Minuten Ihre
          Position. Die Übertragung endet automatisch beim Ausstempeln und kann
          jederzeit in den Sicherheitseinstellungen deaktiviert werden. Die
          Daten werden ausschließlich der Disposition Ihrer Organisation zur
          Einsatzplanung angezeigt.
        </Section>

        <Section title="6. Push-Benachrichtigungen">
          Mit Ihrer Einwilligung versenden wir Push-Benachrichtigungen über Apple
          Push Notification Service (APNs) bzw. Firebase Cloud Messaging (FCM).
          Sie können diese in den Geräteeinstellungen jederzeit deaktivieren.
        </Section>

        <Section title="7. Speicherdauer">
          Personenbezogene Daten werden für die Dauer des Arbeitsverhältnisses
          gespeichert. Stundenzettel und steuerlich relevante Daten werden gemäß
          § 147 AO 10 Jahre archiviert. Chat-Nachrichten werden 12 Monate
          aufbewahrt, danach automatisch gelöscht.
        </Section>

        <Section title="8. Ihre Rechte">
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
          Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit
          (Art. 20) und Widerspruch (Art. 21).{'\n\n'}
          In der App können Sie unter „Einstellungen → Daten-Export" jederzeit eine
          vollständige Kopie Ihrer Daten als JSON-Datei herunterladen.
        </Section>

        <Section title="9. Datenschutzbeauftragter">
          Ein Datenschutzbeauftragter ist gesetzlich nicht erforderlich.
          Bei Fragen zum Datenschutz wenden Sie sich an: lokshiftapp@gmail.com
        </Section>

        <Section title="10. Beschwerderecht">
          Sie haben das Recht, sich bei einer Aufsichtsbehörde zu beschweren —
          z. B. beim Landesbeauftragten für Datenschutz und Informationsfreiheit
          Nordrhein-Westfalen.
        </Section>

        <Section title="11. Änderungen dieser Erklärung">
          Wir behalten uns vor, diese Datenschutzerklärung an geänderte Rechtslagen
          oder Funktionen anzupassen. Stand: 30. Juni 2026.
        </Section>

        <View style={{ marginTop: 12 }}>
          <Pressable
            onPress={() =>
              Linking.openURL('https://lokshift.app/datenschutz').catch(() => {})
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
