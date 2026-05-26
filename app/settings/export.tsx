/**
 * Data export — lets the user download their own data as a single JSON
 * file (DSGVO §15 spirit). Includes profile, time entries, plans,
 * per-diem, holiday bonuses, and absence requests.
 *
 * Admins additionally get an "org-wide" toggle that exports the same
 * tables for every member.
 *
 * Output goes to the cache directory and is handed to the system
 * share sheet via expo-sharing — same pattern as the Stundenzettel PDF.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, Switch, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Download, Database } from 'lucide-react-native'
import { format } from 'date-fns'
import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

interface Section {
  key: string
  table: string
  label_de: string
  label_en: string
  /** Some tables key by employee_id, others by user_id, others by creator_id. */
  ownerColumn: 'employee_id' | 'user_id' | 'creator_id' | null
}

const SECTIONS: Section[] = [
  { key: 'time_entries', table: 'time_entries', label_de: 'Zeiteinträge', label_en: 'Time entries', ownerColumn: 'employee_id' },
  { key: 'plans', table: 'plans', label_de: 'Pläne', label_en: 'Plans', ownerColumn: 'employee_id' },
  { key: 'per_diems', table: 'per_diems', label_de: 'Spesen', label_en: 'Per diem', ownerColumn: 'employee_id' },
  { key: 'holiday_bonuses', table: 'holiday_bonuses', label_de: 'Boni', label_en: 'Bonuses', ownerColumn: 'employee_id' },
  { key: 'absences', table: 'calendar_events', label_de: 'Anträge', label_en: 'Requests', ownerColumn: 'creator_id' },
  { key: 'profile', table: 'profiles', label_de: 'Stammdaten', label_en: 'Profile', ownerColumn: null },
]

export default function ExportScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
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
      const targetDir =
        (FileSystem as any).cacheDirectory ??
        (FileSystem as any).documentDirectory ??
        null
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
        Alert.alert(
          L('Export erstellt', 'Export ready'),
          L(`Gespeichert unter: ${uri}`, `Saved to: ${uri}`),
        )
      }
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Daten-Export', 'Data export')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Database size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Ihre Daten herunterladen', 'Download your data')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Eine JSON-Datei mit allen Bereichen, sofort über das Teilen-Menü.',
                'A JSON file with every area, ready to share via the system menu.',
              )}
            </Text>
          </View>
        </View>

        <Card className="mb-3">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white mb-2">
            {L('Enthalten', 'Included')}
          </Text>
          {SECTIONS.map((s) => (
            <View
              key={s.key}
              className="flex-row items-center py-2 border-b border-gray-50 dark:border-slate-800"
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: '#0064E0',
                  marginRight: 10,
                }}
              />
              <Text className="text-[13px] text-gray-800 dark:text-slate-100">
                {L(s.label_de, s.label_en)}
              </Text>
            </View>
          ))}
        </Card>

        {isAdmin && (
          <Card className="mb-3 flex-row items-center">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
                {L('Gesamte Organisation', 'Organisation-wide')}
              </Text>
              <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                {L(
                  'Exportiert alle Mitarbeiter (nur Admin).',
                  'Exports every employee (admin only).',
                )}
              </Text>
            </View>
            <Switch
              value={orgWide}
              onValueChange={setOrgWide}
              trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
            />
          </Card>
        )}

        <Button
          label={
            busy
              ? t('common.loading')
              : L('Export erstellen & teilen', 'Generate & share export')
          }
          onPress={exportNow}
          loading={busy}
          size="lg"
          leftIcon={<Download size={18} color="#fff" />}
        />

        <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-4 text-center">
          {L(
            'Die Datei wird auf Ihrem Gerät erstellt und nicht hochgeladen.',
            'The file is generated on your device and not uploaded.',
          )}
        </Text>
      </ScrollView>
    </Screen>
  )
}
