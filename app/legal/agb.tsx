/**
 * Allgemeine Geschäftsbedingungen / Terms of Service — content mirrors the
 * webapp's app/agb/page.tsx (DE) and app/terms/page.tsx (EN). Opens in the
 * app language; the header link flips to the other version.
 */

import React, { useState } from 'react'
import { useRouter } from 'expo-router'

import { useTranslation } from '@/lib/i18n'
import { LegalLayout, LegalSection, LegalP, LegalList, LegalLink } from '@/components/settings/LegalLayout'

export default function AgbScreen() {
  const { locale } = useTranslation()
  const router = useRouter()
  const [lang, setLang] = useState<'de' | 'en'>(locale === 'en' ? 'en' : 'de')
  const openPrivacy = () => router.replace('/legal/datenschutz' as any)

  if (lang === 'en') {
    return (
      <LegalLayout
        title="Terms of Service"
        subtitle="Terms governing the use of the LokShift application."
        lastUpdated="Last updated: 3 July 2026"
        otherLocaleLabel="Deutsch"
        onOtherLocale={() => setLang('de')}
      >
        <LegalSection title="§ 1 Scope">
          <LegalP>
            These terms govern the use of the LokShift application (the “App”) by authorised
            employees and dispatchers of a customer organisation that holds a valid licence agreement.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 2 Eligibility">
          <LegalP>
            Access to the App is available only via an invitation provided by your employer. Accounts must
            not be shared with third parties.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 3 User Obligations">
          <LegalList
            items={[
              'Keep your credentials confidential.',
              'Recorded times must correspond to actual work performed.',
              'Location data must not be manipulated.',
              'Chat features are for professional communication only.',
              'Harassment, discrimination, or otherwise unlawful content is prohibited.',
            ]}
          />
        </LegalSection>

        <LegalSection title="§ 4 Availability">
          <LegalP>
            We aim for 99% uptime. Maintenance windows are announced in advance. Uninterrupted operation is
            not guaranteed.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 5 Data Processing">
          <LegalP>
            {'Data processing occurs in accordance with the '}
            <LegalLink onPress={openPrivacy}>Privacy Policy</LegalLink>
            {' and a separate data processing agreement between the employer and Rhein Maas Rail GmbH.'}
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 6 Liability">
          <LegalP>
            We are liable only for damages caused by gross negligence or intent. Liability for slight
            negligence is excluded except in cases of breach of material contractual obligations.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 7 Termination">
          <LegalP>
            When the employment relationship ends, your employer deactivates your account. Personal data is
            retained or deleted in accordance with the Privacy Policy.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 8 Changes">
          <LegalP>
            We reserve the right to modify these terms. Changes will be announced within the App; continued
            use constitutes acceptance.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 9 Governing Law">
          <LegalP>
            These terms are governed by the laws of the Federal Republic of Germany. The place of
            jurisdiction is Aachen, provided the user is a merchant.
          </LegalP>
        </LegalSection>

        <LegalSection title="§ 10 Severability">
          <LegalP>
            Should any provision of these terms be or become invalid, the validity of the remaining
            provisions shall not be affected.
          </LegalP>
        </LegalSection>
      </LegalLayout>
    )
  }

  return (
    <LegalLayout
      title="Allgemeine Geschäftsbedingungen"
      subtitle="Nutzungsbedingungen für die LokShift-Anwendung."
      lastUpdated="Stand: 3. Juli 2026"
      otherLocaleLabel="English"
      onOtherLocale={() => setLang('en')}
    >
      <LegalSection title="§ 1 Geltungsbereich">
        <LegalP>
          Diese Nutzungsbedingungen regeln die Nutzung der LokShift-Anwendung (nachfolgend „App“ oder
          „Anwendung“) durch berechtigte Mitarbeiter und Disponenten der Kundenorganisation, mit der ein
          gültiger Lizenzvertrag besteht.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 2 Berechtigung">
        <LegalP>
          Der Zugang zur App ist nur über eine durch den Arbeitgeber bereitgestellte Einladung möglich. Das
          Konto darf nicht an Dritte weitergegeben werden.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 3 Pflichten des Nutzers">
        <LegalList
          items={[
            'Anmeldedaten sind vertraulich zu behandeln.',
            'Erfasste Zeiten müssen der tatsächlichen Arbeitsleistung entsprechen.',
            'Standortdaten dürfen nicht manipuliert werden.',
            'Chat-Funktionen sind ausschließlich für dienstliche Kommunikation zu nutzen.',
            'Belästigungen, Diskriminierung oder rechtswidrige Inhalte sind untersagt.',
          ]}
        />
      </LegalSection>

      <LegalSection title="§ 4 Verfügbarkeit">
        <LegalP>
          Wir bemühen uns um eine Verfügbarkeit von 99 %. Wartungsfenster werden rechtzeitig angekündigt.
          Ein dauerhaft störungsfreier Betrieb wird nicht zugesichert.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 5 Datenverarbeitung">
        <LegalP>
          {'Die Datenverarbeitung erfolgt im Rahmen der '}
          <LegalLink onPress={openPrivacy}>Datenschutzerklärung</LegalLink>
          {' sowie eines gesonderten Auftragsverarbeitungsvertrags zwischen dem Arbeitgeber und der Rhein Maas Rail GmbH.'}
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 6 Haftung">
        <LegalP>
          Wir haften nur für Schäden, die auf grober Fahrlässigkeit oder Vorsatz beruhen. Die Haftung für
          leichte Fahrlässigkeit ist — außer bei Verletzung wesentlicher Vertragspflichten — ausgeschlossen.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 7 Beendigung">
        <LegalP>
          Bei Ende des Arbeitsverhältnisses wird das Konto vom Arbeitgeber deaktiviert. Persönliche Daten
          werden gemäß Datenschutzerklärung gespeichert oder gelöscht.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 8 Änderungen">
        <LegalP>
          Wir behalten uns vor, diese Bedingungen anzupassen. Änderungen werden in der App angekündigt; die
          fortgesetzte Nutzung gilt als Zustimmung.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 9 Anwendbares Recht">
        <LegalP>
          Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist Aachen, sofern der Nutzer
          Kaufmann ist.
        </LegalP>
      </LegalSection>

      <LegalSection title="§ 10 Salvatorische Klausel">
        <LegalP>
          Sollten einzelne Bestimmungen dieser Nutzungsbedingungen unwirksam sein, bleibt die Wirksamkeit der
          übrigen Bestimmungen unberührt.
        </LegalP>
      </LegalSection>
    </LegalLayout>
  )
}
