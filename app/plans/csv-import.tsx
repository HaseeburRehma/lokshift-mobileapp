/**
 * CSV import for plans. Pick a .csv file → parse → resolve employees +
 * customers → show a preview of valid rows AND invalid rows with
 * reasons → user confirms → batch insert with one summary notification
 * per unique employee.
 *
 * Reuses the bulk insert shape from plans/bulk.tsx (organization_id,
 * creator_id, status='assigned', etc.) so anything the CSV adds shows
 * up in the same downstream flows.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import {
  ChevronLeft,
  FileText,
  CheckCircle2,
  AlertTriangle,
  CalendarPlus,
  Copy as CopyIcon,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { getSupabase } from '@/lib/supabase/client'
import {
  parseCsv,
  toRawRows,
  validateRows,
  SAMPLE_CSV,
  type CsvImportReport,
} from '@/lib/plans/csvImport'
import { useSafeBack } from '@/lib/use-safe-back'

export default function CsvImportScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/plans')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile, session } = useUser()

  const [filename, setFilename] = useState<string | null>(null)
  const [report, setReport] = useState<CsvImportReport | null>(null)
  const [working, setWorking] = useState(false)

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 text-center">
          {L(
            'Nur Admins oder Disponenten dürfen CSV importieren.',
            'Only admins or dispatchers can import CSVs.',
          )}
        </Text>
      </Screen>
    )
  }

  const pickFile = async () => {
    setWorking(true)
    try {
      const res = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['text/csv', 'text/comma-separated-values', '*/*'],
      })
      if (res.canceled || res.assets.length === 0) {
        setWorking(false)
        return
      }
      const asset = res.assets[0]
      setFilename(asset.name ?? 'import.csv')
      const text = await (FileSystem as any).readAsStringAsync(asset.uri, {
        encoding: 'utf8',
      })
      if (!profile?.organization_id) throw new Error('No organisation')

      // Resolve employees + customers in parallel.
      const [{ data: profs }, { data: custs }] = await Promise.all([
        getSupabase()
          .from('profiles')
          .select('id, email')
          .eq('organization_id', profile.organization_id),
        getSupabase()
          .from('customers')
          .select('id, name')
          .eq('organization_id', profile.organization_id),
      ])
      const empMap = new Map<string, string>()
      for (const p of (profs ?? []) as any[]) {
        if (p.email) empMap.set(String(p.email).toLowerCase(), p.id)
      }
      const custMap = new Map<string, string>()
      for (const c of (custs ?? []) as any[]) {
        if (c.name) custMap.set(String(c.name).toLowerCase(), c.id)
      }

      const parsed = parseCsv(text)
      if (parsed.rows.length === 0) {
        toast.error(L('Keine Datenzeilen gefunden.', 'No data rows found.'))
        setReport(null)
        return
      }
      const raws = toRawRows(parsed)
      const r = validateRows(raws, empMap, custMap)
      setReport(r)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
      setReport(null)
    } finally {
      setWorking(false)
    }
  }

  const insertNow = async () => {
    if (!report || report.valid.length === 0) return
    if (!profile?.organization_id || !session?.user?.id) return
    setWorking(true)
    try {
      const orgId = profile.organization_id
      const creatorId = session.user.id
      const rows = report.valid.map((r) => ({
        organization_id: orgId,
        creator_id: creatorId,
        employee_id: r.payload.employee_id,
        customer_id: r.payload.customer_id,
        start_time: r.payload.start_time,
        end_time: r.payload.end_time,
        status: 'assigned',
        route: r.payload.route,
        location: r.payload.location,
        notes: r.payload.notes,
        overnight_stay: r.payload.overnight_stay,
        hotel_address: r.payload.hotel_address,
        is_gastfahrt: r.payload.is_gastfahrt,
      }))
      const { error } = await getSupabase().from('plans').insert(rows as any)
      if (error) throw error

      // One summary notification per unique employee.
      const grouped = new Map<string, number>()
      for (const r of report.valid) {
        grouped.set(
          r.payload.employee_id,
          (grouped.get(r.payload.employee_id) ?? 0) + 1,
        )
      }
      await Promise.all(
        Array.from(grouped.entries()).map(([uid, count]) =>
          getSupabase()
            .from('notifications')
            .insert({
              user_id: uid,
              title: L('📋 Neue Schichten zugewiesen', '📋 New shifts assigned'),
              body: L(
                `Ihnen wurden ${count} neue Schicht(en) zugewiesen.`,
                `${count} new shift(s) have been assigned to you.`,
              ),
              type: 'plans',
              is_read: false,
            } as any)
            .then(() => {}),
        ),
      )

      toast.success(
        L(`${rows.length} Pläne importiert`, `${rows.length} plans imported`),
      )
      router.replace('/plans')
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setWorking(false)
    }
  }

  const showSample = () => {
    Alert.alert(
      L('Beispiel-CSV', 'Sample CSV'),
      SAMPLE_CSV,
      [{ text: t('common.ok') }],
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('CSV importieren', 'Import CSV')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <FileText size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Pläne aus einer CSV-Datei erstellen', 'Create plans from a CSV file')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Eine Zeile pro Schicht. Mitarbeiter werden per E-Mail-Adresse zugeordnet.',
                'One row per shift. Employees are matched by email address.',
              )}
            </Text>
          </View>
        </View>

        <Card className="mb-3 space-y-3">
          <View>
            <Text className="text-[13px] font-black text-gray-900 dark:text-white">
              {L('Erwartete Spalten', 'Expected columns')}
            </Text>
            <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
              employee_email, date (YYYY-MM-DD), start (HH:mm), end (HH:mm),
              customer_name, location, route, notes, overnight, hotel_address, gastfahrt
            </Text>
          </View>
          <Pressable
            onPress={showSample}
            className="flex-row items-center self-start"
          >
            <CopyIcon size={14} color="#0064E0" />
            <Text className="text-[12px] font-bold text-brand ml-1.5">
              {L('Beispiel anzeigen', 'Show sample')}
            </Text>
          </Pressable>
        </Card>

        <Button
          label={
            working
              ? t('common.loading')
              : L('CSV-Datei wählen', 'Pick a CSV file')
          }
          onPress={pickFile}
          loading={working && !report}
          leftIcon={<FileText size={18} color="#fff" />}
          size="lg"
          style={{ marginBottom: 16 }}
        />

        {filename && (
          <Text className="text-[11px] text-gray-500 dark:text-slate-400 mb-3 text-center">
            {filename}
          </Text>
        )}

        {report && (
          <>
            {/* Summary */}
            <Card className="mb-3 flex-row items-center gap-3">
              <View
                style={{
                  width: 44, height: 44, borderRadius: 999,
                  backgroundColor: '#ECFDF5',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={20} color="#10B981" />
              </View>
              <View className="flex-1">
                <Text className="text-[20px] font-black text-emerald-600">
                  {report.valid.length}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-slate-400">
                  {L('gültige Zeilen', 'valid rows')}
                </Text>
              </View>
              <View
                style={{
                  width: 44, height: 44, borderRadius: 999,
                  backgroundColor: '#FEF2F2',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} color="#DC2626" />
              </View>
              <View className="flex-1">
                <Text className="text-[20px] font-black text-red-600">
                  {report.errors.length}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-slate-400">
                  {L('Fehler', 'errors')}
                </Text>
              </View>
            </Card>

            {/* Valid preview (first 8 rows) */}
            {report.valid.length > 0 && (
              <>
                <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
                  {L('Vorschau', 'Preview')}
                </Text>
                <Card style={{ padding: 0 } as any} className="mb-3">
                  {report.valid.slice(0, 8).map((r, i) => (
                    <View
                      key={r.index}
                      className="px-3 py-2"
                      style={{
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: '#F1F5F9',
                      }}
                    >
                      <Text className="text-[12px] font-bold text-gray-900 dark:text-white">
                        {r.raw.date} · {r.raw.start}–{r.raw.end}
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                        {r.raw.employee_email}
                        {r.raw.customer_name ? ` · ${r.raw.customer_name}` : ''}
                      </Text>
                    </View>
                  ))}
                  {report.valid.length > 8 && (
                    <Text className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-2">
                      … +{report.valid.length - 8} {L('weitere', 'more')}
                    </Text>
                  )}
                </Card>
              </>
            )}

            {/* Errors */}
            {report.errors.length > 0 && (
              <>
                <Text className="text-[11px] font-black uppercase tracking-widest text-red-500 mb-2 ml-1">
                  {L('Fehlerhafte Zeilen', 'Error rows')}
                </Text>
                <Card style={{ padding: 0 } as any} className="mb-3">
                  {report.errors.slice(0, 10).map((e, i) => (
                    <View
                      key={`err-${e.index}`}
                      className="px-3 py-2"
                      style={{
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: '#FEE2E2',
                      }}
                    >
                      <Text className="text-[12px] font-bold text-red-700">
                        {L(`Zeile ${e.index}`, `Row ${e.index}`)}: {e.reason}
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
                        {e.raw.employee_email ?? ''} · {e.raw.date ?? ''} · {e.raw.start ?? ''}–{e.raw.end ?? ''}
                      </Text>
                    </View>
                  ))}
                  {report.errors.length > 10 && (
                    <Text className="text-[11px] text-gray-400 dark:text-slate-500 text-center py-2">
                      … +{report.errors.length - 10} {L('weitere', 'more')}
                    </Text>
                  )}
                </Card>
              </>
            )}

            <Button
              label={
                working
                  ? t('common.loading')
                  : L(
                      `${report.valid.length} Pläne importieren`,
                      `Import ${report.valid.length} plans`,
                    )
              }
              onPress={insertNow}
              loading={working}
              disabled={report.valid.length === 0}
              size="lg"
              leftIcon={<CalendarPlus size={18} color="#fff" />}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
