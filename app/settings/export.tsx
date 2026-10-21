/**
 * Daten-Export — lets the user download their own data as a single JSON
 * file (DSGVO Art. 15/20; referenced by the privacy policy: "Einstellungen
 * → Daten-Export"). Includes profile, time entries, plans, per-diem,
 * holiday bonuses, and absence requests.
 *
 * Admins additionally get an "org-wide" toggle that exports the same
 * tables for every member.
 *
 * Output goes to the cache directory and is handed to the system
 * share sheet via expo-sharing — same pattern as the Stundenzettel PDF.
 * Styled like the webapp settings sub-pages.
 */

import React, { useState } from 'react'
import { View, Text, Alert } from 'react-native'
import { Download, Database, Clock, CalendarCheck, Wallet, Gift, Palmtree, User as UserIcon } from 'lucide-react-native'
import { format } from 'date-fns'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  ToggleRow,
  FootNote,
  SC,
} from '@/components/settings/SettingsUI'

interface Section {
  key: string
  table: string
  label_de: string
  label_en: string
  icon: any
  /** Some tables key by employee_id, others by user_id, others by creator_id. */
  ownerColumn: 'employee_id' | 'user_id' | 'creator_id' | null
}

const SECTIONS: Section[] = [
  { key: 'time_entries', table: 'time_entries', label_de: 'Zeiteinträge', label_en: 'Time entries', icon: Clock, ownerColumn: 'employee_id' },
  { key: 'plans', table: 'plans', label_de: 'Pläne', label_en: 'Plans', icon: CalendarCheck, ownerColumn: 'employee_id' },
  { key: 'per_diems', table: 'per_diems', label_de: 'Spesen', label_en: 'Per diem', icon: Wallet, ownerColumn: 'employee_id' },
  { key: 'holiday_bonuses', table: 'holiday_bonuses', label_de: 'Boni', label_en: 'Bonuses', icon: Gift, ownerColumn: 'employee_id' },
  { key: 'absences', table: 'calendar_events', label_de: 'Anträge', label_en: 'Requests', icon: Palmtree, ownerColumn: 'creator_id' },
  { key: 'profile', table: 'profiles', label_de: 'Stammdaten', label_en: 'Profile', icon: UserIcon, ownerColumn: null },
]

export default function ExportScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, role } = useUser()
  const isAdmin = canManageUsers(role)

  const [busy, setBusy] = useState(false)
  const [orgWide, setOrgWide] = useState(false)

  const exportNow = async () => {
    if (!profile || !session?.user?.id) return
    setBusy(true)
    try {
      const supabase = getSupabase()
      const myId = session.user.id
      const out: Record<string, unknown> = {
        generated_at: new Date().toISOString(),
        scope: orgWide && isAdmin ? 'organization' : 'self',
        organization_id: profile.organization_id,
        exporter: { id: myId, full_name: profile.full_name, email: profile.email },
      }

      for (const section of SECTIONS) {
        let query = supabase.from(section.table).select('*')
        if (profile.organization_id && section.table !== 'profiles') {
          query = query.eq('organization_id', profile.organization_id)
        }
        if (!(orgWide && isAdmin)) {
          // Self-only.
          if (section.ownerColumn) {
            query = query.eq(section.ownerColumn, myId)
          } else if (section.table === 'profiles') {
            query = query.eq('id', myId)
          }
        }
        if (section.table === 'calendar_events') {
          query = query.in('event_type', ['holiday', 'sick_leave'])
        }
        const { data, error } = await query
        if (error) {
          console.warn(`[export] ${section.table} failed`, error.message)
          out[section.key] = { error: error.message, rows: [] }
        } else {
          out[section.key] = data ?? []
        }
      }

      const stamp = format(new Date(), 'yyyy-MM-dd_HHmm')
      const filename =
        orgWide && isAdmin
          ? `lokshift_export_${profile.organization_id ?? 'org'}_${stamp}.json`
          : `lokshift_export_self_${stamp}.json`
      const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory ?? null
      if (!targetDir) {
        toast.error(L('Kein Speicherort verfügbar.', 'No writable location.'))
        return
      }
      const uri = `${targetDir}${filename}`
      await (FileSystem as any).writeAsStringAsync(uri, JSON.stringify(out, null, 2))

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          dialogTitle: L('Daten exportieren', 'Export data'),
        })
      } else {
        Alert.alert(L('Export erstellt', 'Export ready'), L(`Gespeichert unter: ${uri}`, `Saved to: ${uri}`))
      }
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={Database}
        tileColor={SC.emerald500}
        title={L('Daten-Export', 'Data export')}
        subtitle={L(
          'Eine JSON-Datei mit allen Bereichen, sofort über das Teilen-Menü.',
          'A JSON file with every area, ready to share via the system menu.',
        )}
      />

      <SectionCard
        title={L('Enthalten', 'Included')}
        description={L('Diese Bereiche werden in die Datei geschrieben.', 'These areas are written to the file.')}
      >
        {SECTIONS.map((s, i) => {
          const Icon = s.icon
          return (
            <View
              key={s.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderBottomWidth: i === SECTIONS.length - 1 ? 0 : 1,
                borderBottomColor: SC.slate50,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  backgroundColor: SC.slate50,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Icon size={16} color={SC.slate500} />
              </View>
              <Text style={{ fontSize: 14, fontWeight: '600', color: SC.slate800 }}>{L(s.label_de, s.label_en)}</Text>
            </View>
          )
        })}
      </SectionCard>

      {isAdmin ? (
        <SectionCard>
          <ToggleRow
            label={L('Gesamte Organisation', 'Organisation-wide')}
            desc={L('Exportiert alle Mitarbeiter (nur Admin).', 'Exports every employee (admin only).')}
            value={orgWide}
            onValueChange={setOrgWide}
            last
          />
        </SectionCard>
      ) : null}

      <Button
        label={busy ? t('common.loading') : L('Export erstellen & teilen', 'Generate & share export')}
        onPress={exportNow}
        loading={busy}
        size="lg"
        leftIcon={<Download size={18} color="#FFFFFF" />}
        style={{ marginBottom: 16 }}
      />

      <FootNote>
        {L(
          'Die Datei wird auf Ihrem Gerät erstellt und nicht hochgeladen.',
          'The file is generated on your device and not uploaded.',
        )}
      </FootNote>
    </SettingsShell>
  )
}
