/**
 * Benachrichtigungen — mirrors the webapp's
 * app/dashboard/settings/notifications/page.tsx:
 *
 *   - per-user channel toggles (E-Mail, WhatsApp, Mobile Push, In der App)
 *   - per-event toggles (8 events)
 *   - Ruhezeiten (quiet hours start / end)
 *   - "Test senden" + "Einstellungen speichern"
 *
 * Persists to public.notification_preferences (one row per user, RLS:
 * own row read + write) — the same row the web edits and the server-side
 * dispatcher reads.
 *
 * Admins additionally keep the organisation-wide "Organisations-Vorgaben"
 * block (company_settings via useCompanySettings), which saves per toggle.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import {
  Bell,
  Mail,
  MessageCircle,
  MessageSquare,
  Smartphone,
  Save,
  TestTube,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  Zap,
  Building2,
} from 'lucide-react-native'

import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { sendNotification } from '@/lib/notifications/service'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useCompanySettings, type CompanySettings } from '@/hooks/useCompanySettings'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  ToggleRow,
  FieldLabel,
  SettingsInput,
  SC,
} from '@/components/settings/SettingsUI'

type Prefs = {
  email_enabled: boolean
  whatsapp_enabled: boolean
  push_enabled: boolean
  in_app_enabled: boolean
  event_new_shift: boolean
  event_shift_updated: boolean
  event_plan_confirmed: boolean
  event_plan_rejected: boolean
  event_calendar_invite: boolean
  event_calendar_reminder: boolean
  event_time_approval: boolean
  event_chat_mention: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
}

type BoolKey = Exclude<keyof Prefs, 'quiet_hours_start' | 'quiet_hours_end'>

const defaultPrefs: Prefs = {
  email_enabled: true,
  whatsapp_enabled: false,
  push_enabled: true,
  in_app_enabled: true,
  event_new_shift: true,
  event_shift_updated: true,
  event_plan_confirmed: true,
  event_plan_rejected: true,
  event_calendar_invite: true,
  event_calendar_reminder: true,
  event_time_approval: true,
  event_chat_mention: true,
  quiet_hours_start: null,
  quiet_hours_end: null,
}

const BOOL_KEYS: BoolKey[] = [
  'email_enabled',
  'whatsapp_enabled',
  'push_enabled',
  'in_app_enabled',
  'event_new_shift',
  'event_shift_updated',
  'event_plan_confirmed',
  'event_plan_rejected',
  'event_calendar_invite',
  'event_calendar_reminder',
  'event_time_approval',
  'event_chat_mention',
]

/** "HH:MM[:SS]" → "HH:MM" for display. */
function toHHMM(v: unknown): string {
  if (typeof v !== 'string') return ''
  const m = v.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

/** Validates a typed time; '' → null, invalid → undefined. */
function parseHHMM(v: string): string | null | undefined {
  const s = v.trim()
  if (!s) return null
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

// Org-wide (company_settings) block — admin only.
const ORG_CHANNELS: Array<{ key: keyof CompanySettings; icon: any; de: string; en: string; dde: string; den: string }> = [
  { key: 'email_enabled', icon: Mail, de: 'E-Mail-Benachrichtigungen', en: 'Email notifications', dde: 'Updates per Firmen-E-Mail erhalten.', den: 'Receive updates via company email.' },
  { key: 'whatsapp_enabled', icon: MessageSquare, de: 'WhatsApp-Hinweise', en: 'WhatsApp alerts', dde: 'Echtzeit-Updates via Twilio WhatsApp.', den: 'Real-time updates via Twilio WhatsApp.' },
  { key: 'push_enabled', icon: Bell, de: 'Push & In-App', en: 'Push & in-app', dde: 'Mobile Push und Benachrichtigungs-Glocke.', den: 'Mobile push and notification bell.' },
]
const ORG_ALERTS: Array<{ key: keyof CompanySettings; de: string; en: string; dde: string; den: string }> = [
  { key: 'alert_shift_assigned', de: 'Schicht zugewiesen', en: 'Shift assigned', dde: 'Wenn der/die Disposition einem Mitarbeiter eine Schicht zuweist.', den: 'When dispatch assigns a shift to an employee.' },
  { key: 'alert_shift_rejected', de: 'Schicht abgelehnt', en: 'Shift rejected', dde: 'Wenn ein Mitarbeiter eine zugewiesene Schicht ablehnt.', den: 'When an employee rejects an assigned shift.' },
  { key: 'alert_absence_submitted', de: 'Urlaubs- oder Krankmeldung', en: 'Vacation / sick-leave submitted', dde: 'Wenn ein Mitarbeiter eine Abwesenheit beantragt.', den: 'When an employee submits an absence request.' },
  { key: 'alert_job_completed', de: 'Auftrag abgeschlossen', en: 'Job completed', dde: 'Wenn ein Mitarbeiter einen Einsatz abschließt.', den: 'When an employee completes a shift.' },
]

export default function NotificationSettingsScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role } = useUser()
  const { settings: orgSettings, loading: orgLoading, update: updateOrg } = useCompanySettings()
  const isAdmin = canManageUsers(role)
  const profileId = profile?.id ?? null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(defaultPrefs)
  const [quietStart, setQuietStart] = useState('')
  const [quietEnd, setQuietEnd] = useState('')

  useEffect(() => {
    if (!profileId) {
      setLoading(false)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await getSupabase()
          .from('notification_preferences')
          .select('*')
          .eq('user_id', profileId)
          .maybeSingle()
        if (cancelled || !data) return
        const d = data as any
        const next: Prefs = { ...defaultPrefs }
        for (const k of BOOL_KEYS) {
          if (typeof d[k] === 'boolean') next[k] = d[k]
        }
        next.quiet_hours_start = d.quiet_hours_start ?? null
        next.quiet_hours_end = d.quiet_hours_end ?? null
        setPrefs(next)
        setQuietStart(toHHMM(next.quiet_hours_start))
        setQuietEnd(toHHMM(next.quiet_hours_end))
      } catch {
        // Missing row = everything on (same as the dispatcher's default).
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [profileId])

  const toggle = (k: BoolKey) => setPrefs((p) => ({ ...p, [k]: !p[k] }))

  const handleSave = async () => {
    if (!profileId || !profile?.organization_id) return
    const qs = parseHHMM(quietStart)
    const qe = parseHHMM(quietEnd)
    if (qs === undefined || qe === undefined) {
      toast.error(L('Ruhezeiten bitte als HH:MM eingeben (z. B. 22:00).', 'Enter quiet hours as HH:MM (e.g. 22:00).'))
      return
    }
    setSaving(true)
    try {
      const { error } = await getSupabase()
        .from('notification_preferences')
        .upsert(
          {
            user_id: profileId,
            organization_id: profile.organization_id,
            ...prefs,
            quiet_hours_start: qs,
            quiet_hours_end: qe,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'user_id' },
        )
      if (error) throw error
      setPrefs((p) => ({ ...p, quiet_hours_start: qs, quiet_hours_end: qe }))
      toast.success(L('Einstellungen gespeichert', 'Preferences saved'))
    } catch (err: any) {
      toast.error(err?.message || L('Speichern fehlgeschlagen', 'Save failed'))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!profileId || testing) return
    setTesting(true)
    try {
      await sendNotification({
        userId: profileId,
        title: L('🔔 Test-Benachrichtigung', '🔔 Test notification'),
        message: L('Ihre Benachrichtigungseinstellungen funktionieren.', 'Your notification preferences are working.'),
        module: 'system',
      })
      toast.success(L('Test-Benachrichtigung gesendet', 'Test notification sent'))
    } catch (err: any) {
      toast.error(err?.message || L('Senden fehlgeschlagen', 'Send failed'))
    } finally {
      setTesting(false)
    }
  }

  const onOrgToggle = async (key: keyof CompanySettings) => {
    if (!orgSettings) return
    try {
      await updateOrg({ [key]: !orgSettings[key] } as Partial<CompanySettings>)
      toast.success(L('Gespeichert', 'Saved'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    }
  }

  const testButton = (
    <Pressable
      onPress={handleTest}
      disabled={testing || loading}
      accessibilityRole="button"
      accessibilityLabel={L('Test senden', 'Send test')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        height: 36,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: SC.slate200,
        backgroundColor: '#FFFFFF',
        opacity: testing || loading ? 0.5 : 1,
      }}
    >
      {testing ? <ActivityIndicator size="small" color={SC.slate700} /> : <TestTube size={15} color={SC.slate700} />}
      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '600', color: SC.slate700 }}>
        {L('Test senden', 'Send test')}
      </Text>
    </Pressable>
  )

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={Bell}
        tileColor={SC.indigo500}
        title={L('Benachrichtigungen', 'Notifications')}
        subtitle={L(
          'E-Mail, WhatsApp und In-App-Benachrichtigungen verwalten.',
          'Manage email, WhatsApp and in-app notifications.',
        )}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -8, marginBottom: 16 }}>
        {testButton}
      </View>

      {loading ? (
        <SectionCard>
          <View style={{ paddingVertical: 32, alignItems: 'center' }}>
            <ActivityIndicator color={SC.blue600} />
          </View>
        </SectionCard>
      ) : (
        <>
          {/* Channels */}
          <SectionCard
            title={L('Kanäle', 'Channels')}
            description={L('Wo möchten Sie Benachrichtigungen empfangen?', 'Where do you want to receive notifications?')}
          >
            <ToggleRow
              icon={Mail}
              label={L('E-Mail', 'Email')}
              desc={L('Wichtige Updates per E-Mail.', 'Important updates by email.')}
              value={prefs.email_enabled}
              onValueChange={() => toggle('email_enabled')}
            />
            <ToggleRow
              icon={MessageCircle}
              label="WhatsApp"
              desc={L('Schnelle Nachrichten via WhatsApp (Twilio erforderlich).', 'Quick messages via WhatsApp (requires Twilio).')}
              value={prefs.whatsapp_enabled}
              onValueChange={() => toggle('whatsapp_enabled')}
            />
            <ToggleRow
              icon={Smartphone}
              label={L('Mobile Push', 'Mobile push')}
              desc={L('Push-Benachrichtigungen auf Ihrem Gerät.', 'Push notifications on your device.')}
              value={prefs.push_enabled}
              onValueChange={() => toggle('push_enabled')}
            />
            <ToggleRow
              icon={Bell}
              label={L('In der App', 'In-app')}
              desc={L('Anzeige in der Glocke oben rechts.', 'Shown in the bell at top right.')}
              value={prefs.in_app_enabled}
              onValueChange={() => toggle('in_app_enabled')}
              last
            />
          </SectionCard>

          {/* Events */}
          <SectionCard
            title={L('Ereignisse', 'Events')}
            description={L('Wofür sollen Benachrichtigungen versendet werden?', 'Which events should trigger a notification?')}
          >
            <ToggleRow icon={FileText} label={L('Neue Schicht zugewiesen', 'New shift assigned')} value={prefs.event_new_shift} onValueChange={() => toggle('event_new_shift')} />
            <ToggleRow icon={FileText} label={L('Schicht aktualisiert', 'Shift updated')} value={prefs.event_shift_updated} onValueChange={() => toggle('event_shift_updated')} />
            <ToggleRow icon={CheckCircle2} label={L('Einsatzplan bestätigt', 'Plan confirmed')} value={prefs.event_plan_confirmed} onValueChange={() => toggle('event_plan_confirmed')} />
            <ToggleRow icon={XCircle} label={L('Einsatzplan abgelehnt', 'Plan rejected')} value={prefs.event_plan_rejected} onValueChange={() => toggle('event_plan_rejected')} />
            <ToggleRow icon={Calendar} label={L('Termineinladung', 'Calendar invite')} value={prefs.event_calendar_invite} onValueChange={() => toggle('event_calendar_invite')} />
            <ToggleRow icon={Calendar} label={L('Termin-Erinnerung', 'Calendar reminder')} value={prefs.event_calendar_reminder} onValueChange={() => toggle('event_calendar_reminder')} />
            <ToggleRow icon={CheckCircle2} label={L('Zeit-Freigabe nötig', 'Time approval needed')} value={prefs.event_time_approval} onValueChange={() => toggle('event_time_approval')} />
            <ToggleRow icon={MessageSquare} label={L('Chat-Erwähnung', 'Chat mention')} value={prefs.event_chat_mention} onValueChange={() => toggle('event_chat_mention')} last />
          </SectionCard>

          {/* Quiet hours */}
          <SectionCard
            title={L('Ruhezeiten', 'Quiet hours')}
            description={L(
              'Innerhalb dieser Zeiten werden keine Push/WhatsApp-Benachrichtigungen gesendet.',
              'No push/WhatsApp notifications during these hours.',
            )}
          >
            <View style={{ flexDirection: 'row', gap: 12, padding: 20 }}>
              <View style={{ flex: 1 }}>
                <FieldLabel>{L('Beginn', 'Start')}</FieldLabel>
                <SettingsInput
                  value={quietStart}
                  onChangeText={setQuietStart}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  autoCorrect={false}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FieldLabel>{L('Ende', 'End')}</FieldLabel>
                <SettingsInput
                  value={quietEnd}
                  onChangeText={setQuietEnd}
                  placeholder="06:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  autoCorrect={false}
                />
              </View>
            </View>
          </SectionCard>

          <Button
            label={L('Einstellungen speichern', 'Save preferences')}
            onPress={handleSave}
            loading={saving}
            size="lg"
            leftIcon={<Save size={16} color="#FFFFFF" />}
            style={{ marginBottom: 28 }}
          />
        </>
      )}

      {/* Organisation-wide policy — admin only (company_settings) */}
      {isAdmin ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginLeft: 4 }}>
            <Building2 size={14} color={SC.slate400} />
            <Text
              style={{
                marginLeft: 6,
                fontSize: 11,
                fontWeight: '900',
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: SC.slate400,
              }}
            >
              {L('Organisations-Vorgaben', 'Organization policy')}
            </Text>
          </View>
          {orgLoading ? (
            <SectionCard>
              <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                <ActivityIndicator color={SC.blue600} />
              </View>
            </SectionCard>
          ) : !orgSettings ? (
            <SectionCard padded>
              <Text style={{ fontSize: 13, color: SC.slate500, textAlign: 'center' }}>
                {L('Keine Organisations-Einstellungen gefunden.', 'No organization settings found.')}
              </Text>
            </SectionCard>
          ) : (
            <>
              <SectionCard
                title={L('Kanäle', 'Channels')}
                description={L('Gilt für die gesamte Organisation. Änderungen werden sofort gespeichert.', 'Applies to the whole organization. Changes save instantly.')}
              >
                {ORG_CHANNELS.map((ch, i) => (
                  <ToggleRow
                    key={String(ch.key)}
                    icon={ch.icon}
                    label={L(ch.de, ch.en)}
                    desc={L(ch.dde, ch.den)}
                    value={!!orgSettings[ch.key]}
                    onValueChange={() => onOrgToggle(ch.key)}
                    last={i === ORG_CHANNELS.length - 1}
                  />
                ))}
              </SectionCard>
              <SectionCard title={L('Ereignisauslöser', 'Event triggers')} icon={Zap}>
                {ORG_ALERTS.map((a, i) => (
                  <ToggleRow
                    key={String(a.key)}
                    label={L(a.de, a.en)}
                    desc={L(a.dde, a.den)}
                    value={!!orgSettings[a.key]}
                    onValueChange={() => onOrgToggle(a.key)}
                    last={i === ORG_ALERTS.length - 1}
                  />
                ))}
              </SectionCard>
            </>
          )}
        </>
      ) : null}
    </SettingsShell>
  )
}
