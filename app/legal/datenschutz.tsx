/**
 * Datenschutzerklärung / Privacy Policy — content mirrors the webapp's
 * app/datenschutz/page.tsx (DE) and app/privacy-policy/page.tsx (EN).
 * Opens in the app language; the header link flips to the other version.
 */

import React, { useState } from 'react'

import { useTranslation } from '@/lib/i18n'
import { LegalLayout, LegalSection, LegalP, LegalList, LegalLink } from '@/components/settings/LegalLayout'

const MAIL = 'mailto:lokshiftapp@gmail.com'

export default function DatenschutzScreen() {
  const { locale } = useTranslation()
  const [lang, setLang] = useState<'de' | 'en'>(locale === 'en' ? 'en' : 'de')

  if (lang === 'en') {
    return (
      <LegalLayout
        title="Privacy Policy"
        subtitle="How we process personal data in the LokShift application."
        lastUpdated="Last updated: 3 July 2026"
        otherLocaleLabel="Deutsch"
        onOtherLocale={() => setLang('de')}
      >
        <LegalSection title="1. Data Controller">
          <LegalP>
            {'Rhein Maas Rail GmbH\nJosefstraße 157, 52080 Aachen, Germany\nEmail: '}
            <LegalLink url={MAIL}>lokshiftapp@gmail.com</LegalLink>
          </LegalP>
        </LegalSection>

        <LegalSection title="2. Data We Process">
          <LegalList
            items={[
              'Identity data (name, email, phone, date of birth, gender)',
              'Employment data (role, working-time model, target hours)',
              'Time tracking (start/end time, breaks, per diem, location)',
              'Shift plans and assignments',
              'Chat messages and attachments (images, files, voice messages)',
              'Location data during an active shift (every 5 minutes)',
              'Device information for push notifications',
              'Profile picture (if uploaded)',
              'Qualifications and certificates (if recorded)',
            ]}
          />
        </LegalSection>

        <LegalSection title="3. Legal Bases">
          <LegalP>Processing is based on:</LegalP>
          <LegalList
            items={[
              'Art. 6 (1) (b) GDPR — Performance of a contract (employment contract)',
              'Art. 6 (1) (c) GDPR — Compliance with legal obligations (working time and tax law)',
              'Art. 6 (1) (f) GDPR — Legitimate interests (dispatch, security)',
              'Art. 6 (1) (a) GDPR — Consent (optional features such as biometric lock)',
            ]}
          />
        </LegalSection>

        <LegalSection title="4. Storage and Data Processing">
          <LegalP>
            Application data is hosted on Supabase (EU servers). A data processing agreement pursuant to
            Art. 28 GDPR exists with the provider.
          </LegalP>
          <LegalP>Optional crash reporting is provided in anonymised form via Sentry (if enabled).</LegalP>
        </LegalSection>

        <LegalSection title="5. Location Data">
          <LegalP>
            While a shift is active, the app records your location every 5 minutes. Transmission stops
            automatically at clock-out and can be disabled at any time in security settings. The data is
            shown only to your organisation’s dispatch team for planning purposes.
          </LegalP>
        </LegalSection>

        <LegalSection title="6. Push Notifications">
          <LegalP>
            With your consent, we send push notifications via Apple Push Notification Service (APNs) and
            Firebase Cloud Messaging (FCM). You can disable them at any time in your device settings.
          </LegalP>
        </LegalSection>

        <LegalSection title="7. Retention">
          <LegalP>
            Personal data is stored for the duration of your employment. Timesheets and tax-relevant data
            are archived for 10 years pursuant to § 147 AO. Chat messages are retained for 12 months and
            then automatically deleted.
          </LegalP>
        </LegalSection>

        <LegalSection title="8. Your Rights">
          <LegalP>
            You have the right to information (Art. 15), rectification (Art. 16), erasure (Art. 17),
            restriction (Art. 18), data portability (Art. 20), and objection (Art. 21).
          </LegalP>
          <LegalP>
            Inside the app you can go to “Settings → Data Export” at any time to download a
            complete copy of your data as a JSON file.
          </LegalP>
        </LegalSection>

        <LegalSection title="9. Data Protection Officer">
          <LegalP>
            {'A dedicated data protection officer is not legally required. For any privacy questions, please contact: '}
            <LegalLink url={MAIL}>lokshiftapp@gmail.com</LegalLink>
          </LegalP>
        </LegalSection>

        <LegalSection title="10. Right of Complaint">
          <LegalP>
            You have the right to lodge a complaint with a supervisory authority — for example, the State
            Commissioner for Data Protection and Freedom of Information of North Rhine-Westphalia (Germany).
          </LegalP>
        </LegalSection>

        <LegalSection title="11. Changes to This Policy">
          <LegalP>We reserve the right to adapt this privacy policy to reflect legal changes or new features.</LegalP>
        </LegalSection>
      </LegalLayout>
    )
  }

  return (
    <LegalLayout
      title="Datenschutzerklärung"
      subtitle="Wie wir personenbezogene Daten in der LokShift-Anwendung verarbeiten."
      lastUpdated="Stand: 3. Juli 2026"
      otherLocaleLabel="English"
      onOtherLocale={() => setLang('en')}
    >
      <LegalSection title="1. Verantwortlicher">
        <LegalP>
          {'Rhein Maas Rail GmbH\nJosefstraße 157, 52080 Aachen, Deutschland\nE-Mail: '}
          <LegalLink url={MAIL}>lokshiftapp@gmail.com</LegalLink>
        </LegalP>
      </LegalSection>

      <LegalSection title="2. Welche Daten wir verarbeiten">
        <LegalList
          items={[
            'Stammdaten (Name, E-Mail, Telefon, Geburtsdatum, Geschlecht)',
            'Beschäftigungsdaten (Rolle, Arbeitszeitmodell, Soll-Stunden)',
            'Zeiterfassung (Start-/Endzeit, Pausen, Spesen, Ort)',
            'Einsatzpläne und Schichtdaten',
            'Chat-Nachrichten und Anhänge (Bilder, Dateien, Sprachnachrichten)',
            'Standortdaten während aktiver Schichten (alle 5 Minuten)',
            'Geräteinformationen für Push-Benachrichtigungen',
            'Profilbild (sofern hochgeladen)',
            'Qualifikationen und Zertifikate (sofern erfasst)',
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Rechtsgrundlagen">
        <LegalP>Die Verarbeitung erfolgt auf Grundlage von:</LegalP>
        <LegalList
          items={[
            'Art. 6 Abs. 1 lit. b DSGVO — Vertragserfüllung (Arbeitsvertrag)',
            'Art. 6 Abs. 1 lit. c DSGVO — Erfüllung gesetzlicher Pflichten (Arbeitszeitgesetz, Steuerrecht)',
            'Art. 6 Abs. 1 lit. f DSGVO — Berechtigte Interessen (Disposition, Sicherheit)',
            'Art. 6 Abs. 1 lit. a DSGVO — Einwilligung (optionale Funktionen wie biometrische Sperre)',
          ]}
        />
      </LegalSection>

      <LegalSection title="4. Speicherort und Auftragsverarbeitung">
        <LegalP>
          Die Anwendungsdaten werden bei Supabase gehostet (Server in der EU). Mit dem Anbieter besteht ein
          Auftragsverarbeitungsvertrag nach Art. 28 DSGVO.
        </LegalP>
        <LegalP>Optionales Crash-Reporting erfolgt anonymisiert über Sentry (sofern aktiviert).</LegalP>
      </LegalSection>

      <LegalSection title="5. Standortdaten">
        <LegalP>
          Während einer aktiven Schicht erfasst die App alle 5 Minuten Ihre Position. Die Übertragung endet
          automatisch beim Ausstempeln und kann jederzeit in den Sicherheitseinstellungen deaktiviert
          werden. Die Daten werden ausschließlich der Disposition Ihrer Organisation zur Einsatzplanung
          angezeigt.
        </LegalP>
      </LegalSection>

      <LegalSection title="6. Push-Benachrichtigungen">
        <LegalP>
          Mit Ihrer Einwilligung versenden wir Push-Benachrichtigungen über Apple Push Notification Service
          (APNs) bzw. Firebase Cloud Messaging (FCM). Sie können diese in den Geräteeinstellungen jederzeit
          deaktivieren.
        </LegalP>
      </LegalSection>

      <LegalSection title="7. Speicherdauer">
        <LegalP>
          Personenbezogene Daten werden für die Dauer des Arbeitsverhältnisses gespeichert. Stundenzettel
          und steuerlich relevante Daten werden gemäß § 147 AO 10 Jahre archiviert. Chat-Nachrichten werden
          12 Monate aufbewahrt, danach automatisch gelöscht.
        </LegalP>
      </LegalSection>

      <LegalSection title="8. Ihre Rechte">
        <LegalP>
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21).
        </LegalP>
        <LegalP>
          In der App können Sie unter „Einstellungen → Daten-Export“ jederzeit eine vollständige Kopie Ihrer
          Daten als JSON-Datei herunterladen.
        </LegalP>
      </LegalSection>

      <LegalSection title="9. Datenschutzbeauftragter">
        <LegalP>
          {'Ein Datenschutzbeauftragter ist gesetzlich nicht erforderlich. Bei Fragen zum Datenschutz wenden Sie sich an: '}
          <LegalLink url={MAIL}>lokshiftapp@gmail.com</LegalLink>
        </LegalP>
      </LegalSection>

      <LegalSection title="10. Beschwerderecht">
        <LegalP>
          Sie haben das Recht, sich bei einer Aufsichtsbehörde zu beschweren — z. B. beim
          Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen.
        </LegalP>
      </LegalSection>

      <LegalSection title="11. Änderungen dieser Erklärung">
        <LegalP>
          Wir behalten uns vor, diese Datenschutzerklärung an geänderte Rechtslagen oder Funktionen
          anzupassen.
        </LegalP>
      </LegalSection>
    </LegalLayout>
  )
}
