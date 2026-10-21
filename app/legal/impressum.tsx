/**
 * Impressum — content and layout mirror the webapp's app/impressum/page.tsx
 * (Anbieterkennzeichnung gemäß § 5 TMG). The web only publishes a German
 * Impressum, so this screen is German-only too.
 */

import React from 'react'

import { LegalLayout, LegalSection, LegalP, LegalLink } from '@/components/settings/LegalLayout'

export default function ImpressumScreen() {
  return (
    <LegalLayout title="Impressum" subtitle="Anbieterkennzeichnung gemäß § 5 TMG.">
      <LegalSection title="Angaben gemäß § 5 TMG">
        <LegalP>
          {'Rhein Maas Rail GmbH\nJosefstraße 157\n52080 Aachen\nDeutschland'}
        </LegalP>
      </LegalSection>

      <LegalSection title="Vertretungsberechtigt">
        <LegalP>Ali Adem Altay, Geschäftsführer</LegalP>
      </LegalSection>

      <LegalSection title="Kontakt">
        <LegalP>
          {'E-Mail: '}
          <LegalLink url="mailto:lokshiftapp@gmail.com">lokshiftapp@gmail.com</LegalLink>
        </LegalP>
      </LegalSection>

      <LegalSection title="Registereintrag">
        <LegalP>{'Handelsregister: HRB 28426\nRegistergericht: Amtsgericht Aachen'}</LegalP>
      </LegalSection>

      <LegalSection title="Umsatzsteuer-ID">
        <LegalP>{'Umsatzsteuer-Identifikationsnummer nach § 27a UStG:\nDE451905461'}</LegalP>
      </LegalSection>

      <LegalSection title="Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV">
        <LegalP>{'Ali Adem Altay\nJosefstraße 157, 52080 Aachen'}</LegalP>
      </LegalSection>

      <LegalSection title="Streitschlichtung">
        <LegalP>
          {'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: '}
          <LegalLink url="https://ec.europa.eu/consumers/odr/">https://ec.europa.eu/consumers/odr/</LegalLink>
          {'. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.'}
        </LegalP>
      </LegalSection>

      <LegalSection title="Haftung für Inhalte">
        <LegalP>
          Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
          verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde
          Informationen zu überwachen.
        </LegalP>
      </LegalSection>

      <LegalSection title="Urheberrecht">
        <LegalP>
          Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem
          deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung
          außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen
          Autors bzw. Erstellers.
        </LegalP>
      </LegalSection>
    </LegalLayout>
  )
}
