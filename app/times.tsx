/**
 * Times list — grouped by date with status icons. Floating "Add" button
 * opens a modal entry form. Tapping an entry opens it for edit/delete.
 */

import React, { useState, useMemo, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import {
  Plus,
  Clock,
  MapPin,
  Check,
  ShieldCheck,
  Download,
  FileText,
} from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeEntries } from '@/hooks/useTimeEntries'
import type { TimeEntry } from '@/lib/types'
import { TimeEntrySheet } from '@/components/TimeEntrySheet'
import { exportWorkingTimePdf } from '@/lib/pdf/reports'

export default function TimesScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { isAdmin, isDispatcher } = useUser()
  const { grouped, loading, fetchEntries, createEntry, updateEntry, deleteEntry } = useTimeEntries()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const params = useLocalSearchParams<{ action?: string }>()
  const router = useRouter()
  const isManagerial = isAdmin || isDispatcher

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [exporting, setExporting] = useState(false)

  const allEntries = useMemo(
    () => grouped.flatMap((g) => g.items),
    [grouped],
  )

  const onExportPdf = async () => {
    if (allEntries.length === 0) {
      toast.error(L('Keine Einträge zum Exportieren.', 'No entries to export.'))
      return
    }
    setExporting(true)
    try {
      await exportWorkingTimePdf(allEntries, {
        title: L('Arbeitszeitbericht', 'Working Time Report'),
        subtitle: L(
          `Stand ${format(new Date(), 'dd.MM.yyyy')}`,
          `As of ${format(new Date(), 'yyyy-MM-dd')}`,
        ),
        filename: `arbeitszeitbericht_${format(new Date(), 'yyyy-MM-dd')}`,
        locale,
        showEmployee: isManagerial,
      })
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  const onStundenzettel = () => {
    // Stundenzettel needs a month + per-employee picker; the dedicated
    // /reports screen already hosts that flow with quick-picks.
    router.push('/reports' as any)
  }

  // Deep link from dashboard quick-action: ?action=add → open sheet,
  // then immediately clear the param so re-visiting the tab doesn't
  // re-open the sheet every time.
  useEffect(() => {
    if (params.action === 'add') {
      setEditing(null)
      setSheetOpen(true)
      router.setParams({ action: undefined })
    }
  }, [params.action, router])

  const openAdd = () => { setEditing(null); setSheetOpen(true) }
  // Tapping an entry opens the proper detail screen (matches web). Quick
  // edit is still available from the detail's pencil button → sheet.
  const openDetail = (e: TimeEntry) => router.push(`/times/${e.id}` as any)

  const totalThisMonth = useMemo(() => {
    const now = new Date()
    const month = format(now, 'yyyy-MM')
    return grouped
      .filter((g) => g.date.startsWith(month))
      .flatMap((g) => g.items)
      .reduce((s, e) => s + (Number(e.net_hours) || 0), 0)
  }, [grouped])

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEntries} tintColor="#0064E0" />}
      >
        <PageHeader
          showBack
          title={L('Zeiterfassung', 'Time Tracking')}
          subtitle={`${format(new Date(), 'MMMM yyyy', { locale: dateLocale })} · ${totalThisMonth.toFixed(1)} h`}
        />

        {/* Filter & Suche / export bar — mirrors the web Zeiterfassung card */}
        <Card className="mb-4">
          <Text className="text-[12px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-3">
            {L('Filter & Suche', 'Filter & search')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={onExportPdf}
              disabled={exporting}
              style={({ pressed }: { pressed: boolean }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                opacity: exporting ? 0.6 : pressed ? 0.85 : 1,
              })}
            >
              <Download size={14} color="#0064E0" />
              <Text className="text-[12px] font-black text-gray-700 dark:text-white ml-1.5">
                {exporting ? '…' : L('PDF exportieren', 'Export PDF')}
              </Text>
            </Pressable>
            <Pressable
              onPress={onStundenzettel}
              style={({ pressed }: { pressed: boolean }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#E5E7EB',
                backgroundColor: '#FFFFFF',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <FileText size={14} color="#0064E0" />
              <Text className="text-[12px] font-black text-gray-700 dark:text-white ml-1.5">
                {L('Stundenzettel', 'Stundenzettel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => { setEditing(null); setSheetOpen(true) }}
              style={({ pressed }: { pressed: boolean }) => ({
                width: 40,
                height: 40,
                borderRadius: 14,
                backgroundColor: '#0064E0',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
              accessibilityLabel={L('Eintrag hinzufügen', 'Add entry')}
            >
              <Plus size={20} color="#fff" />
            </Pressable>
          </View>
        </Card>

        {(isAdmin || isDispatcher) && (
          <Pressable
            onPress={() => router.push('/times/verify')}
            style={({ pressed }: { pressed: boolean }) => ({
              flexDirection: 'row', alignItems: 'center',
              backgroundColor: '#EFF6FF', borderRadius: 12,
              paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View
              style={{
                width: 36, height: 36, borderRadius: 10, backgroundColor: '#0064E0',
                alignItems: 'center', justifyContent: 'center', marginRight: 10,
              }}
            >
              <ShieldCheck size={18} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text className="text-[13px] font-black text-gray-900 dark:text-white">
                {L('Zeiten bestätigen', 'Verify time entries')}
              </Text>
              <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                {L('Offene Einträge prüfen und freigeben.', 'Review pending entries.')}
              </Text>
            </View>
          </Pressable>
        )}

        {grouped.length === 0 && !loading ? (
          <Card className="items-center py-10">
            <Clock size={32} color="#D1D5DB" />
            <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">{t('times.empty')}</Text>
          </Card>
        ) : null}

        {grouped.map((group) => (
          <View key={group.date} className="mb-5">
            <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
              {format(parseISO(group.date), 'EEEE, dd. MMMM', { locale: dateLocale })}
            </Text>
            {group.items.map((entry) => (
              <Pressable key={entry.id} onPress={() => openDetail(entry)}>
                <Card className="mb-2 flex-row items-center">
                  <View className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand/20 items-center justify-center mr-3">
                    {entry.is_verified
                      ? <Check size={20} color="#10B981" />
                      : <Clock size={20} color="#0064E0" />}
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                      {format(parseISO(entry.start_time), 'HH:mm')}
                      {entry.end_time ? ` – ${format(parseISO(entry.end_time), 'HH:mm')}` : ''}
                      {entry.net_hours ? `  ·  ${Number(entry.net_hours).toFixed(2)} h` : ''}
                    </Text>
                    <View className="flex-row items-center mt-0.5">
                      {entry.customer?.name && (
                        <Text className="text-[12px] text-gray-500 dark:text-slate-400 mr-2">{entry.customer.name}</Text>
                      )}
                      {entry.location && (
                        <View className="flex-row items-center">
                          <MapPin size={11} color="#9CA3AF" />
                          <Text className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{entry.location}</Text>
                        </View>
                      )}
                    </View>
                    {(isAdmin || isDispatcher) && entry.employee?.full_name && (
                      <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-1">
                        {entry.employee.full_name}
                      </Text>
                    )}
                  </View>
                  {entry.overnight_stay && (
                    <View className="px-2 py-0.5 rounded-full bg-emerald-100 ml-2">
                      <Text className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">
                        {locale === 'de' ? 'Über.' : 'Over.'}
                      </Text>
                    </View>
                  )}
                </Card>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {/* Floating add */}
      <Pressable
        onPress={openAdd}
        className="absolute bottom-24 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center shadow-xl"
      >
        <Plus size={28} color="#fff" />
      </Pressable>

      <TimeEntrySheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={editing}
        onCreate={createEntry}
        onUpdate={updateEntry}
        onDelete={deleteEntry}
      />
      </Screen>
    </View>
  )
}
