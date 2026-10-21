/**
 * Lokalisierung — mirrors the webapp's
 * app/dashboard/settings/localization/page.tsx:
 *
 *   - "Meine Sprache": per-user UI language, instant (i18n setLocale)
 *   - "Organisations-Standards": default language, timezone, currency,
 *     time format and date format on public.organizations. Editable by
 *     admins ("Standards speichern"), read-only ("Nur lesen") otherwise.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { Globe, Save } from 'lucide-react-native'

import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  FieldLabel,
  ChoiceGroup,
  SC,
} from '@/components/settings/SettingsUI'

const TIMEZONES = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'UTC',
]

const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP']

const DATE_FORMATS = [
  { id: 'DD.MM.YYYY', sample: '28.04.2026' },
  { id: 'YYYY-MM-DD', sample: '2026-04-28' },
  { id: 'MM/DD/YYYY', sample: '04/28/2026' },
]

const LANGUAGES: Array<{ code: 'de' | 'en'; name: { de: string; en: string }; flag: string }> = [
  { code: 'de', name: { de: 'Deutsch', en: 'German' }, flag: '🇩🇪' },
  { code: 'en', name: { de: 'Englisch', en: 'English' }, flag: '🇬🇧' },
]

interface OrgDefaults {
  timezone: string
  currency: string
  default_locale: 'de' | 'en'
  date_format: string
  time_format: string
}

const DEFAULTS: OrgDefaults = {
  timezone: 'Europe/Berlin',
  currency: 'EUR',
  default_locale: 'de',
  date_format: 'DD.MM.YYYY',
  time_format: '24h',
}

export default function LocalizationScreen() {
  const { locale, setLocale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, isAdmin } = useUser()
  const orgId = profile?.organization_id ?? null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState<OrgDefaults>(DEFAULTS)

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getSupabase()
          .from('organizations')
          .select('timezone, currency, default_locale, date_format, time_format')
          .eq('id', orgId)
          .maybeSingle()
        if (cancelled || !data) return
        const d = data as any
        setOrg({
          timezone: d.timezone || DEFAULTS.timezone,
          currency: d.currency || DEFAULTS.currency,
          default_locale: d.default_locale === 'en' ? 'en' : 'de',
          date_format: d.date_format || DEFAULTS.date_format,
          time_format: d.time_format || DEFAULTS.time_format,
        })
      } catch {
        // Keep defaults on network/RLS failure.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  const chooseLanguage = (code: 'de' | 'en') => {
    setLocale(code)
    toast.success(code === 'de' ? 'Sprache geändert' : 'Language changed')
  }

  const handleSave = async () => {
    if (!orgId) return
    if (!isAdmin) {
      toast.error(L('Nur Administratoren können Standards ändern', 'Only admins can change defaults'))
      return
    }
    setSaving(true)
    try {
      const { error } = await getSupabase()
        .from('organizations')
        .update({
          timezone: org.timezone,
          currency: org.currency,
          default_locale: org.default_locale,
          date_format: org.date_format,
          time_format: org.time_format,
        } as any)
        .eq('id', orgId)
      if (error) throw error
      toast.success(L('Standards gespeichert', 'Defaults saved'))
    } catch (err: any) {
      toast.error(err?.message || L('Speichern fehlgeschlagen', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  // Timezone/currency lists fall back to including the stored value so an
  // org configured elsewhere still shows its current selection.
  const tzOptions = TIMEZONES.includes(org.timezone) ? TIMEZONES : [org.timezone, ...TIMEZONES]
  const curOptions = CURRENCIES.includes(org.currency) ? CURRENCIES : [org.currency, ...CURRENCIES]
  const readOnly = !isAdmin

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={Globe}
        tileColor={SC.cyan500}
        title={L('Lokalisierung', 'Localization')}
        subtitle={L('Sprache, Zeitzone, Währung und Datumsformat.', 'Language, timezone, currency and date format.')}
      />

      {/* Personal language preference (per-user, instant) */}
      <SectionCard
        title={L('Meine Sprache', 'My language')}
        description={L('Wirkt sich sofort auf Ihre eigene Oberfläche aus.', 'Takes effect instantly on your own UI.')}
        padded
      >
        <View style={{ marginTop: 16 }}>
          <ChoiceGroup
            options={LANGUAGES.map((lang) => ({
              value: lang.code,
              label: L(lang.name.de, lang.name.en),
              sub: lang.code.toUpperCase(),
              leading: lang.flag,
            }))}
            value={locale === 'en' ? 'en' : 'de'}
            onChange={chooseLanguage}
            showCheck
          />
        </View>
      </SectionCard>

      {/* Organization defaults — admin only */}
      <SectionCard
        title={L('Organisations-Standards', 'Organization defaults')}
        description={L(
          'Diese Standards werden für neue Benutzer und systemweite Anzeige verwendet.',
          'These defaults apply to new users and system-wide display.',
        )}
        badge={readOnly ? L('Nur lesen', 'Read-only') : undefined}
        dimmed={readOnly}
        padded
      >
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={SC.blue600} />
          </View>
        ) : (
          <View style={{ marginTop: 16, gap: 20 }}>
            <View>
              <FieldLabel>{L('Standard-Sprache', 'Default language')}</FieldLabel>
              <ChoiceGroup
                options={[
                  { value: 'de', label: 'Deutsch (DE)' },
                  { value: 'en', label: 'English (EN)' },
                ]}
                value={org.default_locale}
                onChange={(v) => setOrg((p) => ({ ...p, default_locale: v as 'de' | 'en' }))}
                disabled={readOnly}
              />
            </View>

            <View>
              <FieldLabel>{L('Zeitzone', 'Timezone')}</FieldLabel>
              <ChoiceGroup
                options={tzOptions.map((tz) => ({ value: tz, label: tz }))}
                value={org.timezone}
                onChange={(v) => setOrg((p) => ({ ...p, timezone: v }))}
                disabled={readOnly}
              />
            </View>

            <View>
              <FieldLabel>{L('Währung', 'Currency')}</FieldLabel>
              <ChoiceGroup
                options={curOptions.map((c) => ({ value: c, label: c }))}
                value={org.currency}
                onChange={(v) => setOrg((p) => ({ ...p, currency: v }))}
                disabled={readOnly}
                columns={4}
              />
            </View>

            <View>
              <FieldLabel>{L('Zeitformat', 'Time format')}</FieldLabel>
              <ChoiceGroup
                options={[
                  { value: '24h', label: '24h', sub: '14:30' },
                  { value: '12h', label: '12h', sub: '2:30 PM' },
                ]}
                value={org.time_format}
                onChange={(v) => setOrg((p) => ({ ...p, time_format: v }))}
                disabled={readOnly}
              />
            </View>

            <View>
              <FieldLabel>{L('Datumsformat', 'Date format')}</FieldLabel>
              <ChoiceGroup
                options={DATE_FORMATS.map((df) => ({ value: df.id, label: df.id, sub: df.sample }))}
                value={org.date_format}
                onChange={(v) => setOrg((p) => ({ ...p, date_format: v }))}
                disabled={readOnly}
                columns={1}
              />
            </View>

            {isAdmin ? (
              <Button
                label={L('Standards speichern', 'Save defaults')}
                onPress={handleSave}
                loading={saving}
                leftIcon={<Save size={16} color="#FFFFFF" />}
              />
            ) : null}
          </View>
        )}
      </SectionCard>

      {!orgId ? (
        <Text style={{ fontSize: 11, color: SC.slate400, textAlign: 'center' }}>
          {L('Keine Organisation zugeordnet.', 'No organization assigned.')}
        </Text>
      ) : null}
    </SettingsShell>
  )
}
