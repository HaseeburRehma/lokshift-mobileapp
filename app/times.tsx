/**
 * Zeiterfassung — mobile replica of the webapp's /dashboard/times list
 * (components/time/TimesList.tsx):
 *
 *   Title     "Zeiterfassung" + "Arbeitszeiten erfassen und verwalten"
 *   Card      Filter & Suche — PDF exportieren · Monatsnachweis ·
 *             Freigaben (count) · Eintrag hinzufügen, status pills,
 *             search, employee select (admin/dispatcher)
 *   Rows      the web table as stacked cards: Datum · Mitarbeiter ·
 *             Beginn · Ende (+1) · Pause · Arbeitszeit · Kunde · Standort ·
 *             Status chips · Aktionen (als tatsächlich markieren, prüfen &
 *             absenden, freigeben / zurücknehmen, anzeigen, löschen)
 *   Footer    "Zeige X bis Y von N Einträgen" + pagination
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Image, Alert, Linking } from 'react-native'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle,
  ChevronDown,
  Download,
  Eye,
  FilePen,
  FileSpreadsheet,
  MapPin,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users as UsersIcon,
  XCircle,
} from 'lucide-react-native'
import { endOfMonth, endOfWeek, format, isWithinInterval, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { TimeEntrySheet } from '@/components/TimeEntrySheet'
import { ShiftClosingSheet } from '@/components/ShiftClosingSheet'
import { C, EntryStatusPill, IconAction, OutlineButton, Pagination, Pill, SolidButton, SurfaceCard, TONE } from '@/components/time/ui'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useTimeEntries } from '@/hooks/useTimeEntries'
import { useTimeTracking } from '@/hooks/useTimeTracking'
import { useCorrections } from '@/hooks/useCorrections'
import { useOrgRules } from '@/hooks/useOrgRules'
import { getSupabase } from '@/lib/supabase/client'
import { endDayOffset, entryNetHours, shiftIssueLabel, shiftIssues } from '@/lib/time/shift-hours'
import { formatDateDE, formatHours, formatShiftRange, formatTimeOfDay } from '@/lib/time/format'
import { dbErrorMessage, entryStatus } from '@/lib/times/entry-status'
import { sendNotification } from '@/lib/notifications/service'
import { exportMonatsnachweisPdf } from '@/lib/pdf/monatsnachweis'
import { fetchMonthlyReports, fileSlug } from '@/lib/reports/fetch'
import type { TimeEntry } from '@/lib/types'

type StatusFilter =
  | 'all'
  | 'actual'
  | 'pending'
  | 'approved'
  | 'issues'
  | 'planned'
  | 'this_week'
  | 'this_month'

const ITEMS_PER_PAGE = 8

export default function TimesScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { isAdmin, isDispatcher, profile, session } = useUser()
  const myId = session?.user?.id ?? profile?.id
  const { surchargeRules, spesenRates } = useOrgRules()
  const { grouped, loading, fetchEntries, createEntry, updateEntry, deleteEntry } = useTimeEntries()
  const { submitEntry } = useTimeTracking()
  const { corrections: pendingCorrections } = useCorrections({ pendingOnly: true })
  const dateLocale = locale === 'de' ? deLocale : enUS
  const params = useLocalSearchParams<{ action?: string }>()
  const router = useRouter()
  const isManagerial = isAdmin || isDispatcher

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [reviewEntry, setReviewEntry] = useState<TimeEntry | null>(null)
  const [exporting, setExporting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Filter & search state — matches web's Zeiterfassung filter card.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [page, setPage] = useState(1)

  const allEntries = useMemo(() => grouped.flatMap((g) => g.items), [grouped])

  // Employee options for the admin filter (managerial only)
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of allEntries) {
      if (e.employee_id && e.employee?.full_name) {
        map.set(e.employee_id, e.employee.full_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allEntries])

  const pendingCorrectionIds = useMemo(() => new Set(pendingCorrections.map((c) => c.entry_id)), [pendingCorrections])
  const approvalsCount = isManagerial
    ? pendingCorrections.length + allEntries.filter((e) => entryStatus(e) === 'submitted').length
    : 0

  const matchesFilter = (e: TimeEntry): boolean => {
    // Employee filter
    if (employeeFilter !== 'all' && e.employee_id !== employeeFilter) return false

    // Status filter
    const st = entryStatus(e)
    if (statusFilter === 'planned' && st !== 'planned') return false
    if (statusFilter === 'actual' && (st === 'draft' || st === 'running') === false) return false
    if (statusFilter === 'pending' && st !== 'submitted') return false
    if (statusFilter === 'approved' && st !== 'approved') return false
    if (statusFilter === 'issues' && shiftIssues(e).length === 0) return false
    if (statusFilter === 'this_week') {
      try {
        const d = parseISO(e.date)
        const week = { start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) }
        if (!isWithinInterval(d, week)) return false
      } catch { return false }
    }
    if (statusFilter === 'this_month') {
      try {
        const d = parseISO(e.date)
        const month = { start: startOfMonth(new Date()), end: endOfMonth(new Date()) }
        if (!isWithinInterval(d, month)) return false
      } catch { return false }
    }

    // Search (employee name, customer, location, notes, date)
    const q = search.trim().toLowerCase()
    if (q) {
      const employeeName = e.employee?.full_name?.toLowerCase() ?? ''
      const customer = e.customer?.name?.toLowerCase() ?? ''
      const location = e.location?.toLowerCase() ?? ''
      const notes = e.notes?.toLowerCase() ?? ''
      const date = e.date?.toLowerCase() ?? ''
      const matches =
        employeeName.includes(q) ||
        customer.includes(q) ||
        location.includes(q) ||
        notes.includes(q) ||
        date.includes(q)
      if (!matches) return false
    }
    return true
  }

  const filteredGroups = useMemo(() => {
    return grouped
      .map((g) => ({ date: g.date, items: g.items.filter(matchesFilter) }))
      .filter((g) => g.items.length > 0)
    // matchesFilter is intentionally not memoised — its inputs are below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, statusFilter, search, employeeFilter])

  const filteredEntries = useMemo(() => filteredGroups.flatMap((g) => g.items), [filteredGroups])

  // Reset to page 1 whenever the filter changes (same as the web table).
  useEffect(() => {
    setPage(1)
  }, [statusFilter, search, employeeFilter])

  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE)
  const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages))
  const paginated = filteredEntries.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE)

  const selectedEmployeeName =
    employeeFilter === 'all'
      ? L('Alle Mitarbeiter', 'All Employees')
      : (employeeOptions.find((e) => e.id === employeeFilter)?.name ?? '—')

  const onExportPdf = async () => {
    // Kundenfeedback Punkt 5 — the export is the Monatsnachweis built from
    // the shared report model, one statement per (employee, month) in the
    // current filter, so it matches the Reports screen and the webapp.
    const rows = filteredEntries.length > 0 ? filteredEntries : allEntries
    if (rows.length === 0 || !profile?.organization_id) {
      toast.error(L('Keine Einträge zum Exportieren gefunden.', 'No entries to export.'))
      return
    }
    const pairs = new Map<string, { employeeId: string; month: string; name?: string }>()
    for (const e of rows) {
      const month = (e.date || '').slice(0, 7)
      const employeeId = e.employee_id || profile.id
      if (!month) continue
      pairs.set(`${employeeId}::${month}`, { employeeId, month, name: e.employee?.full_name ?? undefined })
    }
    if (pairs.size > 24) {
      toast.error(
        L(
          `Zu viele Monatsnachweise (${pairs.size}). Bitte Filter eingrenzen, z. B. Mitarbeiter oder Monat.`,
          `Too many statements (${pairs.size}). Please narrow the filter, e.g. employee or month.`,
        ),
      )
      return
    }
    setExporting(true)
    try {
      const list = Array.from(pairs.values()).sort((a, b) =>
        a.month === b.month ? (a.name ?? '').localeCompare(b.name ?? '', 'de') : a.month.localeCompare(b.month),
      )
      const reports = await fetchMonthlyReports(profile.organization_id, list, { surchargeRules, spesenRates, locale })
      const base =
        reports.length === 1
          ? `Monatsnachweis_${fileSlug(reports[0].employee.name)}_${reports[0].month}`
          : `Monatsnachweise_${format(new Date(), 'yyyy-MM-dd')}`
      await exportMonatsnachweisPdf(reports, base)
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  // On-screen Monatsnachweis (same as the web's "Monatsnachweis" button):
  // current month, pre-selected employee when the filter has one.
  const onOpenMonthly = () => {
    const month = format(new Date(), 'yyyy-MM')
    const employee = isManagerial && employeeFilter !== 'all' ? `&employee=${encodeURIComponent(employeeFilter)}` : ''
    router.push(`/times/monthly?month=${month}${employee}` as any)
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

  // ── Row actions (same as the web table's Aktionen column) ──
  const setApproved = async (entry: TimeEntry, approved: boolean) => {
    if (!myId) return
    setBusyId(entry.id)
    const { error } = await getSupabase()
      .from('time_entries')
      .update({ is_verified: approved, verified_by: approved ? myId : null } as any)
      .eq('id', entry.id)
    setBusyId(null)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Freigabe konnte nicht gespeichert werden', 'Could not save approval')))
      return
    }
    toast.success(approved ? L('Zeiteintrag freigegeben', 'Time entry approved') : L('Freigabe zurückgenommen', 'Approval revoked'))
    if (approved && entry.employee_id !== myId) {
      void sendNotification({
        userId: entry.employee_id,
        title: 'Zeiteintrag freigegeben',
        message: `Ihr Zeiteintrag vom ${formatDateDE(entry.date)} (${formatShiftRange(entry.start_time, entry.end_time)}) wurde freigegeben.`,
        module: 'time_entries',
        moduleId: entry.id,
        link: `/dashboard/times?entry=${entry.id}`,
        skipEmail: true,
      })
    }
    fetchEntries()
  }

  const convertPlanned = async (entry: TimeEntry) => {
    setBusyId(entry.id)
    const { error } = await getSupabase().from('time_entries').update({ is_planned: false } as any).eq('id', entry.id)
    setBusyId(null)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Konnte nicht als tatsächlich markiert werden', 'Could not mark as actual')))
    } else {
      toast.success(L('Als tatsächliche Zeit markiert', 'Marked as actual time'))
    }
    fetchEntries()
  }

  const confirmDelete = (entry: TimeEntry) => {
    const employeeLabel = entry.employee?.full_name ?? L('Mitarbeiter', 'Employee')
    Alert.alert(
      L('Diesen Zeiteintrag wirklich löschen?', 'Really delete this time entry?'),
      L(
        `${formatDateDE(entry.date)} · ${employeeLabel} · ${formatHours(entry.net_hours, 'de')} Std.\n\nDer Vorgang wird im Änderungsprotokoll festgehalten.`,
        `${entry.date} · ${employeeLabel} · ${formatHours(entry.net_hours, 'en')} h`,
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Löschen', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id)
              toast.success(L('Zeiteintrag gelöscht', 'Time entry deleted'))
            } catch (err: any) {
              toast.error(dbErrorMessage(err, locale, L('Eintrag konnte nicht gelöscht werden', 'Failed to delete entry')))
            }
          },
        },
      ],
    )
  }

  const filterPills: [StatusFilter, string][] = [
    ['all', L('Alle', 'All')],
    ['actual', L('Nicht abgesendet', 'Not submitted')],
    ['pending', L('Zur Freigabe', 'Awaiting approval')],
    ['approved', L('Freigegeben', 'Approved')],
    ['issues', L('Fehlerhaft', 'With issues')],
    ['planned', L('Geplant', 'Planned')],
    ['this_week', L('Diese Woche', 'This Week')],
    ['this_month', L('Dieser Monat', 'This Month')],
  ]

  const fromIdx = filteredEntries.length === 0 ? 0 : (safePage - 1) * ITEMS_PER_PAGE + 1
  const toIdx = Math.min(safePage * ITEMS_PER_PAGE, filteredEntries.length)

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEntries} tintColor={C.brand} />}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader
            showBack
            title={L('Zeiterfassung', 'Time Tracking')}
            subtitle={L('Arbeitszeiten erfassen und verwalten', 'Record and manage working hours')}
          />

          <SurfaceCard padding={0} radius={24}>
            {/* Header toolbar */}
            <View style={{ padding: 16, paddingBottom: 8 }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate900, letterSpacing: -0.3 }}>
                {L('Filter & Suche', 'Filter & Search')}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <OutlineButton
                  label={L('PDF exportieren', 'Export PDF')}
                  icon={<Download size={16} color={C.slate700} />}
                  onPress={onExportPdf}
                  loading={exporting}
                  disabled={filteredEntries.length === 0}
                />
                <OutlineButton
                  label={L('Monatsnachweis', 'Monthly statement')}
                  icon={<FileSpreadsheet size={16} color={C.slate700} />}
                  onPress={onOpenMonthly}
                />
                {isManagerial ? (
                  <OutlineButton
                    tone="emerald"
                    label={L('Freigaben', 'Approvals')}
                    icon={<ShieldCheck size={16} color={C.emerald700} />}
                    badge={approvalsCount}
                    onPress={() => router.push('/times/verify' as any)}
                  />
                ) : null}
              </View>
              <SolidButton
                label={L('Eintrag hinzufügen', 'Add Time Entry')}
                icon={<Plus size={16} color="#FFFFFF" />}
                onPress={openAdd}
                color={C.blue600}
                uppercase={false}
                style={{ marginTop: 8 }}
              />
            </View>

            {/* Filter pills — horizontal scroll so they don't wrap into 3 rows */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              {filterPills.map(([id, label]) => {
                const active = statusFilter === id
                return (
                  <Pressable key={id} onPress={() => setStatusFilter(id)} accessibilityState={{ selected: active }}>
                    <View
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? C.blue600 : C.slate200,
                        backgroundColor: active ? C.blue600 : '#FFFFFF',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : C.slate400 }}>{label}</Text>
                    </View>
                  </Pressable>
                )
              })}
            </ScrollView>

            {/* Search + employee select */}
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 8 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: C.slate50,
                  borderWidth: 1,
                  borderColor: C.slate200,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  height: 40,
                }}
              >
                <Search size={16} color={C.slate400} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={L('Hier suchen…', 'Search…')}
                  placeholderTextColor={C.slate400}
                  style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', color: C.slate900 }}
                  autoCapitalize="none"
                />
              </View>

              {isManagerial && employeeOptions.length > 0 ? (
                <Pressable onPress={() => setEmployeePickerOpen((v) => !v)} accessibilityLabel={L('Mitarbeiter filtern', 'Filter by employee')}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      height: 40,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: employeeFilter === 'all' ? C.slate200 : '#93C5FD',
                      backgroundColor: employeeFilter === 'all' ? '#FFFFFF' : C.blue50,
                    }}
                  >
                    <UsersIcon size={16} color={C.slate400} />
                    <Text
                      style={{ flex: 1, marginLeft: 8, fontSize: 12, fontWeight: '700', color: employeeFilter === 'all' ? C.slate600 : C.blue700 }}
                      numberOfLines={1}
                    >
                      {selectedEmployeeName}
                    </Text>
                    <ChevronDown size={16} color={C.slate400} />
                  </View>
                </Pressable>
              ) : null}

              {isManagerial && employeePickerOpen ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderWidth: 1, borderColor: C.slate200, borderRadius: 12, padding: 10 }}>
                  {[{ id: 'all', name: L('Alle Mitarbeiter', 'All Employees') }, ...employeeOptions].map((e) => {
                    const active = employeeFilter === e.id
                    return (
                      <Pressable
                        key={e.id}
                        onPress={() => {
                          setEmployeeFilter(e.id)
                          setEmployeePickerOpen(false)
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: active ? C.blue600 : C.slate200,
                            backgroundColor: active ? C.blue600 : '#FFFFFF',
                          }}
                        >
                          {active ? <Check size={12} color="#FFFFFF" style={{ marginRight: 4 }} /> : null}
                          <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : C.slate600 }}>{e.name}</Text>
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </View>

            {/* Rows (the web table as stacked cards) */}
            {paginated.length === 0 ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.slate100, paddingVertical: 48, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: C.slate400 }}>
                  {loading && allEntries.length === 0 ? L('Lädt…', 'Loading…') : L('Keine Zeiteinträge gefunden', 'No time entries found')}
                </Text>
              </View>
            ) : (
              paginated.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  locale={locale}
                  dateLocale={dateLocale}
                  isManagerial={isManagerial}
                  myId={myId}
                  correctionOpen={pendingCorrectionIds.has(entry.id)}
                  busy={busyId === entry.id}
                  onOpen={() => openDetail(entry)}
                  onConvertPlanned={() => convertPlanned(entry)}
                  onReviewDraft={() => setReviewEntry(entry)}
                  onToggleApproval={() => setApproved(entry, !entry.is_verified)}
                  onDelete={() => confirmDelete(entry)}
                />
              ))
            )}

            {/* Pagination footer */}
            {totalPages > 0 ? (
              <View style={{ borderTopWidth: 1, borderTopColor: C.slate100, paddingHorizontal: 16, paddingVertical: 14, gap: 10 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: C.slate400, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {L('Zeige ', 'Showing ')}
                  <Text style={{ color: C.slate900 }}>{String(fromIdx)}</Text>
                  {L(' bis ', ' to ')}
                  <Text style={{ color: C.slate900 }}>{String(toIdx)}</Text>
                  {L(' von ', ' of ')}
                  <Text style={{ color: C.slate900 }}>{String(filteredEntries.length)}</Text>
                  {L(' Einträgen', ' results')}
                </Text>
                {totalPages > 1 ? <Pagination page={safePage} totalPages={totalPages} onChange={setPage} /> : null}
              </View>
            ) : null}
          </SurfaceCard>
        </ScrollView>

        <TimeEntrySheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          initial={editing}
          onCreate={createEntry}
          onUpdate={updateEntry}
          onDelete={deleteEntry}
        />
        <ShiftClosingSheet
          entry={reviewEntry}
          open={!!reviewEntry}
          onClose={() => setReviewEntry(null)}
          onSubmit={async (eid, values) => {
            const ok = await submitEntry(eid, values)
            if (ok) fetchEntries()
            return ok
          }}
        />
      </Screen>
    </View>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────

function Avatar({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    return <Image source={{ uri: url }} style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 1, borderColor: C.slate100 }} />
  }
  const initials = (name || 'U')
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFFFFF' }}>{initials || 'U'}</Text>
    </View>
  )
}

function GridCell({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: last ? 0 : 6 }}>
      <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: C.slate800 }} numberOfLines={1}>
        {label}
      </Text>
      <View style={{ marginTop: 3, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>{children}</View>
    </View>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 6 }}>
      <Text style={{ width: 74, fontSize: 9, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', color: C.slate800, marginTop: 2 }}>
        {label}
      </Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '500', color: C.slate600 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

function EntryRow({
  entry,
  locale,
  dateLocale,
  isManagerial,
  myId,
  correctionOpen,
  busy,
  onOpen,
  onConvertPlanned,
  onReviewDraft,
  onToggleApproval,
  onDelete,
}: {
  entry: TimeEntry
  locale: 'de' | 'en'
  dateLocale: typeof deLocale
  isManagerial: boolean
  myId?: string
  correctionOpen: boolean
  busy: boolean
  onOpen: () => void
  onConvertPlanned: () => void
  onReviewDraft: () => void
  onToggleApproval: () => void
  onDelete: () => void
}) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const status = entryStatus(entry)
  const issues = shiftIssues(entry)
  const offset = entry.end_time ? endDayOffset(entry.start_time, entry.end_time) : 0
  const onBehalf = !!entry.entered_by && entry.entered_by !== entry.employee_id
  const customer = entry.customer?.name || entry.plan?.customer?.name || '-'
  const hasStations = !!(entry.start_location?.name || entry.destination_location?.name)
  const place = hasStations
    ? `${entry.start_location?.name ?? '—'} → ${entry.destination_location?.name ?? '—'}`
    : entry.location || entry.plan?.location || '-'
  const hasCoords = !!entry.latitude && !!entry.longitude
  let dateText = entry.date
  try {
    dateText = format(parseISO(entry.date), locale === 'de' ? 'dd.MM.yyyy' : 'MMM dd, yyyy', { locale: dateLocale })
  } catch {}
  let weekday = ''
  try {
    weekday = format(parseISO(entry.date), 'EEEE', { locale: dateLocale })
  } catch {}

  const canConvert = entry.is_planned
  const canReview = status === 'draft' && entry.employee_id === myId
  const canToggle = isManagerial && !entry.is_planned && !!entry.end_time
  const toggleBlocked = !entry.is_verified && issues.length > 0

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${dateText} ${entry.employee?.full_name ?? ''}`}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: C.slate100,
          backgroundColor: issues.length > 0 ? 'rgba(254,242,242,0.45)' : '#FFFFFF',
        }}
      >
        {/* Datum */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.slate600, fontVariant: ['tabular-nums'] }}>{dateText}</Text>
          {weekday ? <Text style={{ fontSize: 12, fontWeight: '500', color: C.slate400, marginLeft: 6 }}>{weekday}</Text> : null}
        </View>

        {/* Mitarbeiter (admin/dispatcher) */}
        {isManagerial ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
            <Avatar url={entry.employee?.avatar_url} name={entry.employee?.full_name ?? 'U'} />
            <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: '700', color: C.slate800, flexShrink: 1 }} numberOfLines={1}>
              {entry.employee?.full_name || L('Unbekannt', 'Unknown')}
            </Text>
          </View>
        ) : null}

        {/* Status chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <EntryStatusPill
            status={status}
            locale={locale}
            icon={entry.is_planned ? <CalendarClock size={11} color="#6D28D9" /> : undefined}
          />
          {issues.length > 0 ? <Pill label={L('Prüfen', 'Check')} tone={TONE.red} icon={<AlertTriangle size={11} color={C.red700} />} /> : null}
          {correctionOpen ? <Pill label={L('Korrektur offen', 'Correction open')} tone={TONE.amber} icon={<FilePen size={11} color={C.amber700} />} /> : null}
          {onBehalf ? <Pill label={L('Stellv.', 'On behalf')} tone={TONE.slate} /> : null}
          {entry.is_gastfahrt ? <Pill label="Gast" tone={TONE.violet} icon={<UserCheck size={11} color={C.violet700} />} /> : null}
        </View>
        {issues.length > 0 ? (
          <Text style={{ marginTop: 4, fontSize: 11, fontWeight: '700', color: C.red600 }}>
            {issues.map((i) => shiftIssueLabel(i, locale)).join(' · ')}
          </Text>
        ) : null}

        {/* Beginn · Ende · Pause · Arbeitszeit */}
        <View style={{ flexDirection: 'row', marginTop: 10, backgroundColor: 'rgba(248,250,252,0.9)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <GridCell label={L('Beginn', 'Start')}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate600, fontVariant: ['tabular-nums'] }}>{formatTimeOfDay(entry.start_time)}</Text>
          </GridCell>
          <GridCell label={L('Ende', 'End')}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate600, fontVariant: ['tabular-nums'] }}>
              {entry.end_time ? formatTimeOfDay(entry.end_time) : L('Läuft', 'Running')}
            </Text>
            {offset > 0 ? (
              <View style={{ marginLeft: 4, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, backgroundColor: C.indigo50 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: C.indigo700 }}>{`+${offset}`}</Text>
              </View>
            ) : null}
          </GridCell>
          <GridCell label={L('Pause', 'Break')}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: C.slate600 }}>{`${entry.break_minutes ?? 0} Min.`}</Text>
          </GridCell>
          <GridCell label={L('Arbeitszeit', 'Hours')} last>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.slate900, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
              {`${formatHours(entryNetHours(entry), locale)} ${L('Std.', 'h')}`}
            </Text>
          </GridCell>
        </View>

        {/* Kunde · Standort */}
        <InfoLine label={L('Kunde', 'Customer')} value={customer} />
        <InfoLine label={L('Standort', 'Location')} value={place} />
        {hasCoords ? (
          <Pressable
            onPress={() => Linking.openURL(`https://www.google.com/maps?q=${entry.latitude},${entry.longitude}`).catch(() => {})}
            hitSlop={6}
            style={{ marginTop: 4, marginLeft: 74, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
          >
            <MapPin size={12} color="#3B82F6" />
            <Text style={{ marginLeft: 4, fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{L('Einsatzkoordinaten', 'Mission Coordinates')}</Text>
          </Pressable>
        ) : null}

        {/* Aktionen */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          {canConvert ? (
            <IconAction
              label={L('Als tatsächlich markieren', 'Mark as actual')}
              bg={C.sky50}
              icon={<Play size={16} color={C.sky600} />}
              disabled={busy}
              onPress={onConvertPlanned}
            />
          ) : null}
          {canReview ? (
            <IconAction label={L('Prüfen & absenden', 'Review & submit')} bg={C.blue50} icon={<Send size={16} color={C.blue600} />} onPress={onReviewDraft} />
          ) : null}
          {canToggle ? (
            <IconAction
              label={
                toggleBlocked
                  ? L('Erst Fehler korrigieren', 'Fix issues first')
                  : entry.is_verified
                    ? L('Freigabe zurücknehmen', 'Revoke approval')
                    : L('Freigeben', 'Approve')
              }
              bg={entry.is_verified ? '#FFF7ED' : C.emerald50}
              icon={entry.is_verified ? <XCircle size={16} color="#F97316" /> : <CheckCircle size={16} color={C.emerald500} />}
              disabled={toggleBlocked || busy}
              onPress={onToggleApproval}
            />
          ) : null}
          <IconAction label={L('Anzeigen', 'View')} bg={C.slate100} icon={<Eye size={16} color={C.slate400} />} onPress={onOpen} />
          {isManagerial ? (
            <IconAction label={L('Löschen', 'Delete')} bg={C.red50} icon={<Trash2 size={16} color={C.red500} />} onPress={onDelete} />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}
