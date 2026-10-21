/**
 * Anleitung (Kundenfeedback Punkt 15) — short step-by-step guides for
 * employees and for admin/dispatch, each linked to the matching screen.
 * Same guides as the webapp's /dashboard/help, worded for the app.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowRight, BookOpen, ChevronDown, ChevronLeft } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { useUser } from '@/lib/user-context'
import { useSafeBack } from '@/lib/use-safe-back'

interface Guide {
  title: string
  summary: string
  steps: string[]
  href?: string
  linkLabel?: string
}

const EMPLOYEE: Guide[] = [
  {
    title: 'Meine Woche ansehen und Schichten bestätigen',
    summary: 'Alle Einsätze der Woche mit Beginn, Ende, Kunde, Start- und Zielbetriebsstelle.',
    steps: [
      'Im Menü „Meine Woche“ öffnen – die aktuelle Kalenderwoche wird angezeigt.',
      'Mit den Pfeilen oben zur Vor- oder Folgewoche wechseln.',
      'Neue Schichten sind als „Offen“ markiert: „Bestätigen“ tippen. Passt eine Schicht nicht, „Ablehnen“ tippen und einen Grund angeben.',
      'Änderungen der Disposition erscheinen automatisch; Sie erhalten zusätzlich eine Nachricht per App und E-Mail.',
    ],
    href: '/plans/my-week',
    linkLabel: 'Meine Woche öffnen',
  },
  {
    title: 'Schicht starten, Pause und beenden',
    summary: 'Zeiterfassung direkt auf der Startseite.',
    steps: [
      'Auf der Startseite „Schicht starten“ tippen. Die geplante Schicht wird automatisch zugeordnet.',
      'Für eine Pause „Pause machen“, danach „Fortsetzen“ tippen. Ohne Pause bleibt die Pause bei 0 Minuten – das ist erlaubt.',
      'Am Ende „Beenden“ tippen. Die Zeit stoppt, und die Abschlussansicht öffnet sich.',
    ],
    href: '/(tabs)/home',
    linkLabel: 'Zur Startseite',
  },
  {
    title: 'Abschlussansicht: Zeiten prüfen und absenden',
    summary: 'Geplant, erfasst und abzusendende Werte nebeneinander.',
    steps: [
      'Beginn, Ende und Pause prüfen. Die Arbeitszeit wird sofort berechnet (z. B. 22:00–08:00 = 10,00 Std.; Ende am Folgetag wird erkannt).',
      '„Planzeit übernehmen“ setzt Beginn und Ende auf die geplanten Zeiten.',
      'Haben Sie länger gearbeitet, die tatsächlichen Zeiten eintragen.',
      '„Übernachtung“ einschalten, falls zutreffend – die Spesen werden angepasst.',
      '„Schicht absenden“ tippen. Danach sind Änderungen nur noch per Korrekturantrag möglich.',
    ],
  },
  {
    title: 'Schichtende vergessen – was tun?',
    summary: 'Beispiel: geplant 10:00–18:00, beendet erst um 23:00.',
    steps: [
      'Schicht wie gewohnt mit „Beenden“ stoppen (auch nachträglich).',
      'In der Abschlussansicht „Planzeit übernehmen“ tippen → 10:00–18:00, ohne Pause 8,00 Std.',
      '„Schicht absenden“. Die ursprünglich erfasste Zeit (23:00) bleibt für die Disposition im Verlauf sichtbar.',
      'Bereits abgesendet? Dann unter „Zeiterfassung“ den Eintrag öffnen und „Korrektur beantragen“ tippen.',
    ],
  },
  {
    title: 'Korrektur nach dem Absenden beantragen',
    summary: 'Änderungen werden erst nach Freigabe durch Disposition oder Admin wirksam.',
    steps: [
      '„Zeiterfassung“ öffnen und den Eintrag antippen.',
      '„Korrektur beantragen“ wählen, die richtigen Werte eintragen und kurz begründen.',
      'Bis zur Entscheidung gelten die bisherigen Werte; der Antrag ist als „Korrektur offen“ markiert.',
      'Sie werden über Genehmigung oder Ablehnung benachrichtigt.',
    ],
    href: '/times',
    linkLabel: 'Zur Zeiterfassung',
  },
  {
    title: 'Eigene Stunden und Monatsnachweis',
    summary: 'Alle Tage, Zuschläge, Spesen und Sonderzahlungen eines Monats.',
    steps: [
      'Im Menü „Monatsnachweis“ öffnen und den Monat wählen.',
      'Offene oder nicht freigegebene Einträge sind im Nachweis markiert.',
      '„PDF“ oder „Excel“ tippen und die Datei teilen oder speichern. 7,50 Std. entsprechen 7 Std. 30 Min.',
    ],
    href: '/reports',
    linkLabel: 'Monatsnachweis öffnen',
  },
]

const MANAGER: Guide[] = [
  {
    title: 'Startseite: Wer ist laut Planung im Einsatz?',
    summary: 'Die Startseite zeigt alle laut Plan aktiven Personen – auch ohne Check-in.',
    steps: [
      'Status je Person: noch nicht eingecheckt, eingecheckt, bereits beendet oder Planzeit überschritten.',
      'Darunter: offene Freigaben, unbesetzte und abgelehnte Schichten sowie bald ablaufende Fristen.',
    ],
    href: '/(tabs)/home',
    linkLabel: 'Zur Startseite',
  },
  {
    title: 'Schichten anlegen und zuweisen',
    summary: 'Einzeln, für mehrere Tage/Mitarbeiter oder aus der Wochenplanung.',
    steps: [
      '„Wochenplanung“ öffnen und beim Mitarbeiter auf das „+“ des Tages tippen – Datum und Mitarbeiter sind vorausgefüllt.',
      'Schichtbezeichnung, Zeiten, Kunde sowie Start- und Zielbetriebsstelle (Suche nach Name oder Kürzel) eintragen.',
      'Endet die Schicht nach Mitternacht, wird das Ende automatisch dem Folgetag zugeordnet.',
      '„Unbesetzt“ wählen, wenn noch niemand feststeht. Der Mitarbeiter wird per App und E-Mail informiert.',
    ],
    href: '/dashboard',
    linkLabel: 'Zur Wochenplanung',
  },
  {
    title: 'Schicht umverteilen (A → B)',
    summary: 'Schicht antippen → „Mitarbeiter ändern“.',
    steps: [
      'In der Wochenplanung die Schicht antippen und „Mitarbeiter ändern“ wählen (in der Webapp auch per Drag & Drop).',
      'Vor dem Speichern werden alte und neue Zuordnung angezeigt, dazu Warnungen zu Überschneidungen, Abwesenheit und abgelaufenen Nachweisen.',
      '„Umverteilung speichern“: A erhält eine Nachricht über den Entzug, B über die neue Schicht (App + E-Mail).',
      'Begonnene oder abgeschlossene Schichten sind gesperrt und lassen sich nur mit ausdrücklicher Bestätigung umverteilen.',
    ],
    href: '/dashboard',
    linkLabel: 'Zur Wochenplanung',
  },
  {
    title: 'Freigaben und Korrekturanträge',
    summary: 'Alles, was geprüft werden muss, an einer Stelle.',
    steps: [
      'Im Menü „Freigaben“ öffnen.',
      'Korrekturanträge: bisherige und beantragte Werte vergleichen, optional einen Hinweis eingeben, dann „Genehmigen“ oder „Ablehnen“.',
      'Abgesendete Zeiten einzeln oder gesammelt freigeben. Einträge mit Fehlern (z. B. 0 Stunden) können erst nach Korrektur freigegeben werden.',
      'Jede Änderung wird mit alten und neuen Werten, Bearbeiter, Zeitpunkt und Begründung protokolliert (Verlauf im Eintrag).',
    ],
    href: '/times/verify',
    linkLabel: 'Zu den Freigaben',
  },
  {
    title: 'Stunden stellvertretend erfassen',
    summary: 'Zeiten für einen Lokführer eintragen.',
    steps: [
      '„Zeiterfassung“ → „+“ tippen.',
      'Mitarbeiter und Datum wählen; unter „Geplante Schicht übernehmen“ eine Schicht auswählen – Zeiten und Details werden vorausgefüllt.',
      'Pause eintragen (0 ist erlaubt) und speichern, optional „Direkt freigeben“.',
      'Bei möglicher Doppelerfassung erscheint eine Warnung. Der Mitarbeiter sieht den Eintrag als „stellvertretend erfasst“.',
    ],
    href: '/times',
    linkLabel: 'Zur Zeiterfassung',
  },
  {
    title: 'Monatsnachweis, Spesen und Sonderzahlungen',
    summary: 'Ein Nachweis pro Mitarbeiter und Monat – identisch in App, Webapp, PDF und Excel.',
    steps: [
      '„Monatsnachweis“ öffnen, Monat und Mitarbeiter wählen.',
      'Kopf: Soll-Stunden, Erstellungsdatum und Freigabestatus. Tageszeilen mit Zuschlägen 25 %/40 %, Sonn-/Feiertag, Gastfahrt und Spesen.',
      'Sonderzahlungen unter „Sonderzahlungen“ anlegen (einmalig, monatlich oder anteilig) – sie erscheinen automatisch im passenden Monat.',
      'PDF (Querformat, Kopfzeile auf jeder Seite) oder Excel exportieren.',
    ],
    href: '/reports',
    linkLabel: 'Monatsnachweis öffnen',
  },
  {
    title: 'Auswertungen: alle Lokführer & Mehrmonatsreport',
    summary: 'Ein Monat für alle Lokführer oder ein Mitarbeiter über mehrere Monate.',
    steps: [
      '„Monatsnachweis“ → „Gesamtauswertung – alle Lokführer“: Monat wählen – eine Zeile je Mitarbeiter plus Summen.',
      '„Mehrmonatsreport“: Mitarbeiter und Zeitraum (z. B. 2026-01 bis 2026-06) wählen – Monatszeilen, Summen und Diagramme im PDF.',
      'Export als PDF oder Excel. Die Werte entsprechen den Monatsnachweisen.',
    ],
    href: '/reports',
    linkLabel: 'Zu den Auswertungen',
  },
  {
    title: 'Personalakte und Fristen',
    summary: 'Tauglichkeit und weitere Nachweise mit Ablaufdatum.',
    steps: [
      '„Personal & Fristen“ → „+“: Mitarbeiter, Dokumentart, Ablaufdatum, Datei und Erinnerungen wählen.',
      'Erinnerungen gehen automatisch an Admin und Disposition (Standard: 4 und 2 Wochen vorher sowie am Ablaufdatum).',
      'Nach Erneuerung „Erneuern“ wählen: der neue Nachweis wird gespeichert, der alte archiviert – offene Erinnerungen sind erledigt.',
      'Vertrauliche Unterlagen sind nur für Admins sichtbar.',
    ],
    href: '/qualifications',
    linkLabel: 'Zu Personal & Fristen',
  },
  {
    title: 'Betriebsstellen importieren und suchen',
    summary: 'Hunderte Betriebsstellen aus PDF, CSV oder Excel übernehmen.',
    steps: [
      'Der Import läuft in der Webapp: „Einstellungen“ → „Betriebsstellen“ → „Importieren“ und die Datei wählen.',
      'In der Vorschau jede Zeile prüfen und bei Bedarf Kürzel, Name oder Art korrigieren. Dubletten sind markiert.',
      'In der App lassen sich Betriebsstellen einzeln ergänzen und in allen Formularen nach Name, Namensteil oder Kürzel suchen.',
    ],
    href: '/operational-locations',
    linkLabel: 'Zu den Betriebsstellen',
  },
]

export default function HelpScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { isAdmin, isDispatcher } = useUser()
  const isManager = isAdmin || isDispatcher
  const [tab, setTab] = useState<'employee' | 'manager'>(isManager ? 'manager' : 'employee')
  const [open, setOpen] = useState<number | null>(0)
  const guides = tab === 'manager' ? MANAGER : EMPLOYEE

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header — web: BookOpen + text-2xl font-bold tracking-tight text-[#0064E0],
              subtitle text-sm text-slate-400 font-medium */}
          <Pressable
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
            accessibilityRole="button"
            accessibilityLabel="Zurück"
            style={{ width: 44, height: 44, marginLeft: -10, marginBottom: 4, alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={26} color="#0064E0" />
          </Pressable>
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <BookOpen size={28} color="#0064E0" />
              <Text style={{ marginLeft: 12, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: '#0064E0' }}>
                Anleitung
              </Text>
            </View>
            <Text style={{ marginTop: 4, fontSize: 14, fontWeight: '500', color: '#94A3B8' }}>
              Kurzanleitungen zu den wichtigsten Abläufen in LokShift.
            </Text>
          </View>

          {isManager ? (
            <View
              style={{
                flexDirection: 'row',
                alignSelf: 'flex-start',
                backgroundColor: '#F1F5F9',
                borderRadius: 12,
                padding: 4,
                marginBottom: 24,
              }}
            >
              {([
                ['manager', 'Admin & Disposition'],
                ['employee', 'Mitarbeiter'],
              ] as const).map(([k, label]) => {
                const active = tab === k
                return (
                  <Pressable
                    key={k}
                    onPress={() => {
                      setTab(k)
                      setOpen(0)
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={{
                      height: 36,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      shadowColor: '#0F172A',
                      shadowOpacity: active ? 0.06 : 0,
                      shadowRadius: 2,
                      shadowOffset: { width: 0, height: 1 },
                      elevation: active ? 1 : 0,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? '#0064E0' : '#64748B' }}>{label}</Text>
                  </Pressable>
                )
              })}
            </View>
          ) : null}

          {guides.map((g, i) => {
            const expanded = open === i
            return (
              <View
                key={g.title}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', marginBottom: 12 }}
              >
                <Pressable
                  onPress={() => setOpen(expanded ? null : i)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: '#EFF6FF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 14,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0064E0' }}>{String(i + 1)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }}>{g.title}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 16, color: '#64748B', marginTop: 2 }}>{g.summary}</Text>
                    </View>
                    <View style={{ marginLeft: 8, transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                      <ChevronDown size={20} color="#94A3B8" />
                    </View>
                  </View>
                </Pressable>
                {expanded ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 16 }}>
                    {g.steps.map((s, n) => (
                      <View key={n} style={{ flexDirection: 'row', marginBottom: 8 }}>
                        <View
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            backgroundColor: '#F1F5F9',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 12,
                            marginTop: 1,
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '900', color: '#475569' }}>{String(n + 1)}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: '#334155' }}>{s}</Text>
                      </View>
                    ))}
                    {g.href ? (
                      <Pressable
                        onPress={() => router.push(g.href as any)}
                        accessibilityRole="link"
                        hitSlop={8}
                        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 6 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0064E0' }}>{g.linkLabel ?? ''}</Text>
                        <ArrowRight size={16} color="#0064E0" style={{ marginLeft: 4 }} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            )
          })}
        </ScrollView>
      </Screen>
    </View>
  )
}
