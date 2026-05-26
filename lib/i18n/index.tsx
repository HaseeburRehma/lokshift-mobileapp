/**
 * i18n — German base / English fallback, mirroring the webapp's
 * `lib/i18n.tsx`. Selection is persisted to AsyncStorage so the user
 * doesn't have to reselect after every app launch.
 *
 * Usage:
 *   const { t, locale, setLocale } = useTranslation()
 *   t('auth.welcome')                      // → key-driven
 *   const L = (de, en) => locale === 'de' ? de : en  // inline alternative
 *
 * We deliberately keep the dictionary small here — most strings are
 * inlined via the L(de, en) pattern (matches the webapp's local style).
 * Add a key here when the same string appears in 3+ places.
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type Locale = 'de' | 'en'

const STORAGE_KEY = 'lokshift.locale'

const DICTIONARY: Record<Locale, Record<string, string>> = {
  de: {
    'auth.welcome':         'Willkommen bei Lokshift',
    'auth.signin':          'Anmelden',
    'auth.signup':          'Registrieren',
    'auth.login':           'Anmelden',
    'auth.register':        'Registrieren',
    'auth.email':           'E-Mail',
    'auth.password':        'Passwort',
    'auth.full_name':       'Vollständiger Name',
    'auth.remember':        'Angemeldet bleiben',
    'auth.forgot':          'Passwort vergessen?',
    'auth.forgot_password': 'Passwort vergessen?',
    'auth.send_code':       'Code senden',
    'auth.enter_otp':       '6-stelligen Code eingeben',
    'auth.new_password':    'Neues Passwort',
    'auth.confirm_password':'Passwort bestätigen',
    'auth.continue':        'Weiter',
    'auth.signing_in':      'Anmeldung läuft…',
    'auth.signed_out':      'Abgemeldet',
    'auth.invalid':         'Ungültige Zugangsdaten',
    'auth.signup_continue': 'Registrieren, um fortzufahren',
    'auth.code_sent_to':    'Geben Sie den 6-stelligen Code ein, den wir gesendet haben an:',
    'auth.email_confirmed': 'E-Mail bestätigt',
    'auth.finish_setup':    'Konto fertig einrichten',
    'auth.resend':          'Keinen Code erhalten? Erneut senden',
    'auth.verify_code':     'Code bestätigen',
    'auth.too_short':       'Zu kurz',
    'auth.fair':            'Mittel',
    'auth.good':            'Gut',
    'auth.strong':          'Stark',
    'auth.terms_prefix':    'Mit der Registrierung akzeptiere ich die LokShift',
    'auth.terms_link':      'Nutzungsbedingungen',
    'auth.privacy_link':    'Datenschutzerklärung',
    'auth.terms_and':       'und erkenne die',
    'auth.terms_suffix':    'an.',
    'auth.cancel':          'Abbrechen',
    'auth.back':            'Zurück',
    'onboarding.next':      'Weiter',
    'onboarding.skip':      'Überspringen',
    'onboarding.start':     'Loslegen',
    'onboarding.slide1.title': 'Verwalten Sie Ihr Team mühelos',
    'onboarding.slide1.body':  'Schichten zuweisen, Mitarbeiter verfolgen — alles an einem Ort.',
    'onboarding.slide2.title': 'Sicherer Rollenzugriff',
    'onboarding.slide2.body':  'Admin, Disponent und Mitarbeiter — saubere Trennung der Berechtigungen.',
    'onboarding.slide3.title': 'Ihre Schichten — immer aktuell',
    'onboarding.slide3.body':  'Tagesplan einsehen, bestätigen und Arbeitszeiten erfassen — von überall.',
    'onboarding.permissions.title': 'Berechtigungen',
    'onboarding.permissions.body':  'Damit Lokshift funktioniert, benötigen wir einige Berechtigungen.',
    'onboarding.permissions.notifications': 'Benachrichtigungen',
    'onboarding.permissions.notifications_body': 'Erhalten Sie Updates zu neuen Schichten.',
    'onboarding.permissions.location': 'Standort',
    'onboarding.permissions.location_body': 'Damit wir Sie beim Ein-/Ausstempeln erkennen können.',
    'onboarding.finish':    'Fertig',

    'tabs.dashboard':       'Übersicht',
    'tabs.times':           'Zeiten',
    'tabs.account':         'Konto',
    'tabs.plans':           'Pläne',
    'tabs.per_diem':        'Spesen',
    'tabs.bonuses':         'Boni',
    'tabs.notifications':   'Alerts',
    'tabs.profile':         'Profil',

    'dashboard.hello':      'Hallo',
    'dashboard.quick':      'Schnellaktionen',
    'dashboard.today':      'Heute',
    'dashboard.week':       'Diese Woche',
    'dashboard.balance':    'Zeitkonto-Saldo',
    'dashboard.upcoming':   'Anstehende Schichten',
    'dashboard.no_plans':   'Keine zugewiesenen Schichten.',

    'times.add':            'Zeit erfassen',
    'times.edit':           'Bearbeiten',
    'times.delete':         'Löschen',
    'times.empty':          'Keine Zeiteinträge.',
    'times.start':          'Startzeit',
    'times.end':            'Endzeit',
    'times.break':          'Pause (Min.)',
    'times.date':           'Datum',
    'times.customer':       'Kunde',
    'times.location':       'Ort',
    'times.notes':          'Notizen',
    'times.overnight':      'Übernachtung',
    'times.hotel':          'Hoteladresse',
    'times.net_hours':      'Netto-Stunden',
    'times.save':           'Speichern',
    'times.cancel':         'Abbrechen',
    'times.deleted':        'Eintrag gelöscht',
    'times.saved':          'Eintrag gespeichert',

    'plans.empty':          'Keine Pläne.',
    'plans.confirm':        'Bestätigen',
    'plans.reject':         'Ablehnen',
    'plans.status.draft':       'Entwurf',
    'plans.status.assigned':    'Zugewiesen',
    'plans.status.confirmed':   'Bestätigt',
    'plans.status.rejected':    'Abgelehnt',
    'plans.status.cancelled':   'Storniert',
    'plans.confirmed_toast':    'Schicht bestätigt',
    'plans.rejected_toast':     'Schicht abgelehnt',

    'common.loading':       'Wird geladen…',
    'common.error':         'Etwas ist schief gelaufen',
    'common.retry':         'Erneut versuchen',
    'common.signout':       'Abmelden',
    'common.language':      'Sprache',
    'common.ok':            'OK',
  },
  en: {
    'auth.welcome':         'Welcome to Lokshift',
    'auth.signin':          'Sign in',
    'auth.signup':          'Sign up',
    'auth.login':           'Log in',
    'auth.register':        'Sign up',
    'auth.email':           'Email',
    'auth.password':        'Password',
    'auth.full_name':       'Full name',
    'auth.remember':        'Remember me',
    'auth.forgot':          'Forgot password?',
    'auth.forgot_password': 'Forgot password?',
    'auth.send_code':       'Send code',
    'auth.enter_otp':       'Enter 6-digit code',
    'auth.new_password':    'New password',
    'auth.confirm_password':'Confirm password',
    'auth.continue':        'Continue',
    'auth.signing_in':      'Signing in…',
    'auth.signed_out':      'Signed out',
    'auth.invalid':         'Invalid credentials',
    'auth.signup_continue': 'Sign up to continue',
    'auth.code_sent_to':    'Enter the 6-digit code we sent to:',
    'auth.email_confirmed': 'Email confirmed',
    'auth.finish_setup':    'Finish setting up your account',
    'auth.resend':          "Didn't get a code? Resend",
    'auth.verify_code':     'Verify code',
    'auth.too_short':       'Too short',
    'auth.fair':            'Fair',
    'auth.good':            'Good',
    'auth.strong':          'Strong',
    'auth.terms_prefix':    'By signing up, I accept the LokShift',
    'auth.terms_link':      'Terms of Service',
    'auth.privacy_link':    'Privacy Policy',
    'auth.terms_and':       'and acknowledge the',
    'auth.terms_suffix':    '.',
    'auth.cancel':          'Cancel',
    'auth.back':            'Back',
    'onboarding.next':      'Next',
    'onboarding.skip':      'Skip',
    'onboarding.start':     'Get started',
    'onboarding.slide1.title': 'Manage your team effortlessly',
    'onboarding.slide1.body':  'Assign shifts, track employees — all in one place.',
    'onboarding.slide2.title': 'Secure role-based access',
    'onboarding.slide2.body':  'Admin, Dispatcher, and Employee roles keep your data safe.',
    'onboarding.slide3.title': 'Your shifts, always up to date',
    'onboarding.slide3.body':  'View your Tagesplan, confirm assignments, log times from anywhere.',
    'onboarding.permissions.title': 'Permissions',
    'onboarding.permissions.body':  'For Lokshift to work, we need a few permissions.',
    'onboarding.permissions.notifications': 'Notifications',
    'onboarding.permissions.notifications_body': 'Get pinged when new shifts are assigned.',
    'onboarding.permissions.location': 'Location',
    'onboarding.permissions.location_body': 'So we can recognise you when you clock in/out.',
    'onboarding.finish':    'Finish',

    'tabs.dashboard':       'Dashboard',
    'tabs.times':           'Times',
    'tabs.account':         'Account',
    'tabs.plans':           'Plans',
    'tabs.per_diem':        'Per Diem',
    'tabs.bonuses':         'Bonuses',
    'tabs.notifications':   'Alerts',
    'tabs.profile':         'Profile',

    'dashboard.hello':      'Hi',
    'dashboard.quick':      'Quick actions',
    'dashboard.today':      'Today',
    'dashboard.week':       'This week',
    'dashboard.balance':    'Time-account balance',
    'dashboard.upcoming':   'Upcoming shifts',
    'dashboard.no_plans':   'No assigned shifts.',

    'times.add':            'Add time',
    'times.edit':           'Edit',
    'times.delete':         'Delete',
    'times.empty':          'No time entries yet.',
    'times.start':          'Start time',
    'times.end':            'End time',
    'times.break':          'Break (min)',
    'times.date':           'Date',
    'times.customer':       'Customer',
    'times.location':       'Location',
    'times.notes':          'Notes',
    'times.overnight':      'Overnight stay',
    'times.hotel':          'Hotel address',
    'times.net_hours':      'Net hours',
    'times.save':           'Save',
    'times.cancel':         'Cancel',
    'times.deleted':        'Entry deleted',
    'times.saved':          'Entry saved',

    'plans.empty':          'No plans.',
    'plans.confirm':        'Confirm',
    'plans.reject':         'Reject',
    'plans.status.draft':       'Draft',
    'plans.status.assigned':    'Assigned',
    'plans.status.confirmed':   'Confirmed',
    'plans.status.rejected':    'Rejected',
    'plans.status.cancelled':   'Cancelled',
    'plans.confirmed_toast':    'Shift confirmed',
    'plans.rejected_toast':     'Shift rejected',

    'common.loading':       'Loading…',
    'common.error':         'Something went wrong',
    'common.retry':         'Try again',
    'common.signout':       'Sign out',
    'common.language':      'Language',
    'common.ok':            'OK',
  },
}

interface I18nContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Default to German — matches the webapp (German is the client's
  // primary market). Will be overridden by AsyncStorage on first render.
  const [locale, setLocaleState] = useState<Locale>('de')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'de' || stored === 'en') setLocaleState(stored)
    })
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {})
  }

  const t = (key: string): string => {
    return DICTIONARY[locale][key] ?? DICTIONARY.en[key] ?? key
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Falling back instead of throwing keeps tests + storybook usable
    // outside the provider tree.
    return {
      locale: 'de',
      setLocale: () => {},
      t: (k) => DICTIONARY.de[k] ?? DICTIONARY.en[k] ?? k,
    }
  }
  return ctx
}
