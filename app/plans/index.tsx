/**
 * Pläne & Termine — mobile replica of the webapp's app/dashboard/plans.
 *
 * Admin / dispatcher: title + "Schichten und Einsätze verwalten", the
 * action row (CSV · Excel · PDF · Mehrere · Plan erstellen), the
 * Wochenplanung entry, a filter card (Alle · Entwurf · Zugewiesen ·
 * Bestätigt · Diese Woche, employee filter, search) and one card per plan
 * (Mitarbeiter, Datum, Start/Ende, Kunde, Standort, Status) with the web's
 * row actions: Bearbeiten, Bestätigen, Ablehnen, Stornieren. Paginated
 * like the web table (8 per page, page total in hours).
 *
 * Employee: "Meine Pläne" grouped by date with KW, Ja / Nein for open
 * shifts and "Ändern" (change request to dispatch).
 *
 * Exports use the filtered list, like the web.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, Modal, Image, ActivityIndicator, Alert } from 'react-native'
import {
  Calendar,
  MapPin,
  ArrowRight,
  Plus,
  Download,
  FileSpreadsheet,
  FileText,
  CalendarDays,
  Search,
  ChevronDown,
  ChevronUp,
  Pencil,
  MoreHorizontal,
  CheckCircle2,
  XCircle,
  Ban,
  X,
  MessageSquare,
  Check,
} from 'lucide-react-native'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'
import { safeFormatDate, safeFormatTime, safeParseISO, safeNumber } from '@/lib/safe-format'
import { useRouter } from 'expo-router'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { usePlans } from '@/hooks/usePlans'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { exportPlansPdf } from '@/lib/pdf/reports'
import { exportPlansXlsx } from '@/lib/excel/reports'
import { exportCsv } from '@/lib/csv/exportCsv'
import { captureError } from '@/lib/monitoring'
import { getSupabase } from '@/lib/supabase/client'
import { notifyPlanCancelled } from '@/lib/plans/notify'
import { notifyManagers, sendNotification } from '@/lib/notifications/service'
import { dbErrorMessage } from '@/lib/times/entry-status'
import { isoWeek as isoWeekOfKey } from '@/lib/plans/week'
import { endDayOffset, hoursBetween, localDateKey } from '@/lib/time/shift-hours'
import { formatHours, formatShiftRange } from '@/lib/time/format'
import type { Plan, PlanStatus } from '@/lib/types'

const PAGE_SIZE = 8

function isoWeek(d: Date): number {
  return isoWeekOfKey(localDateKey(d))
}

type StatusFilter = 'all' | PlanStatus | 'this-week'

const ADMIN_FILTERS: StatusFilter[] = ['all', 'draft', 'assigned', 'confirmed', 'this-week']
const EMPLOYEE_FILTERS: StatusFilter[] = ['all', 'draft', 'assigned', 'confirmed', 'rejected', 'cancelled', 'this-week']

export default function PlansScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, isAdmin, isDispatcher, profile, session } = useUser()
  const { plans, loading, fetchPlans, updateStatus } = usePlans()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const router = useRouter()
  const showCreate = canCreatePlans(role)
  const isManager = isAdmin || isDispatcher

  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [menuPlan, setMenuPlan] = useState<Plan | null>(null)
  const [rejectPlan, setRejectPlan] = useState<Plan | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [changePlan, setChangePlan] = useState<Plan | null>(null)
  const [changeMessage, setChangeMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const stamp = format(new Date(), 'yyyy-MM-dd')

  // Employees that appear in the loaded plans — keeps the filter short.
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of plans) if (p.employee_id && p.employee?.full_name) map.set(p.employee_id, p.employee.full_name)
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [plans])

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase()
    const now = new Date()
    const wStart = startOfWeek(now, { weekStartsOn: 1 })
    const wEnd = endOfWeek(now, { weekStartsOn: 1 })
    const result = plans.filter((p) => {
      const matchText =
        !q ||
        (p.employee?.full_name ?? '').toLowerCase().includes(q) ||
        (p.location ?? '').toLowerCase().includes(q) ||
        (p.route ?? '').toLowerCase().includes(q) ||
        (p.shift_name ?? '').toLowerCase().includes(q) ||
        (p.customer?.name ?? '').toLowerCase().includes(q)
      let matchStatus = statusFilter === 'all' || p.status === statusFilter
      if (statusFilter === 'this-week') {
        const d = new Date(p.start_time)
        matchStatus = d >= wStart && d <= wEnd
      }
      const matchEmployee = employeeFilter === 'all' || p.employee_id === employeeFilter
      return matchText && matchStatus && matchEmployee
    })
    return [...result].sort((a, b) => {
      const cmp = new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [plans, search, statusFilter, employeeFilter, sortDir])

  // Back to page 1 whenever the filter changes.
  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, employeeFilter, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagePlans = useMemo(
    () => filteredPlans.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredPlans, currentPage],
  )
  const pageHours = pagePlans.reduce((s, p) => s + hoursBetween(p.start_time, p.end_time, 0), 0)

  // Employee view: page items grouped by local start day.
  const grouped = useMemo(() => {
    const map = new Map<string, Plan[]>()
    for (const p of pagePlans) {
      const key = localDateKey(new Date(p.start_time))
      const arr = map.get(key)
      if (arr) arr.push(p)
      else map.set(key, [p])
    }
    return Array.from(map.entries()).map(([date, items]) => ({ date, items }))
  }, [pagePlans])

  const guardEmpty = (): boolean => {
    if (filteredPlans.length === 0) {
      toast.error(L('Keine Daten zum Exportieren.', 'No data to export.'))
      return true
    }
    return false
  }

  const onCsv = async () => {
    if (guardEmpty()) return
    setBusy('csv')
    try {
      const headers =
        locale === 'de'
          ? ['Mitarbeiter', 'Kunde', 'Ort', 'Strecke', 'Datum', 'Zeit', 'Std.', 'KW', 'Status', 'Notizen']
          : ['Employee', 'Customer', 'Location', 'Route', 'Date', 'Time', 'Hours', 'KW', 'Status', 'Notes']
      const rows = filteredPlans.map((p) => {
        // Defensive parsing — a malformed timestamp shouldn't take the
        // whole export down. safeParseISO returns null on bad input.
        const start = safeParseISO(p.start_time)
        const end = safeParseISO(p.end_time)
        const hours =
          start && end ? (end.getTime() - start.getTime()) / 3_600_000 : 0
        const cw = start ? `KW ${isoWeek(start)}` : '—'
        return [
          p.employee?.full_name ?? '',
          p.customer?.name ?? '',
          p.location ?? '',
          p.route ?? '',
          safeFormatDate(p.start_time, 'dd.MM.yyyy'),
          `${safeFormatTime(p.start_time)} - ${safeFormatTime(p.end_time)}`,
          Number(safeNumber(hours, 2)),
          cw,
          p.status,
          (p.notes ?? '').replace(/[,;]/g, ' '),
        ]
      })
      await exportCsv({
        headers,
        rows,
        filename: `plans_${stamp}`,
        dialogTitle: L('Einsatzpläne', 'Plans'),
      })
    } catch (err: any) {
      captureError(err, { tags: { action: 'plans.export-csv' } })
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const onExcel = async () => {
    if (guardEmpty()) return
    setBusy('xlsx')
    try {
      await exportPlansXlsx(filteredPlans, {
        sheetName: L('Einsatzpläne', 'Plans'),
        filename: `plans_${stamp}`,
        locale,
        showEmployee: true,
      })
    } catch (err: any) {
      captureError(err, { tags: { action: 'plans.export-excel' } })
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const onPdf = async () => {
    if (guardEmpty()) return
    setBusy('pdf')
    try {
      await exportPlansPdf(filteredPlans, {
        title: L('Einsatzpläne', 'Plans'),
        subtitle: L(
          `Stand ${format(new Date(), 'dd.MM.yyyy')}`,
          `As of ${format(new Date(), 'yyyy-MM-dd')}`,
        ),
        filename: `plans_${stamp}`,
        locale,
        showEmployee: true,
      })
    } catch (err: any) {
      captureError(err, { tags: { action: 'plans.export-pdf' } })
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const setStatus = async (plan: Plan, status: PlanStatus, reason?: string) => {
    setUpdatingId(plan.id)
    try {
      await updateStatus(plan, status, reason)
      toast.success(status === 'confirmed' ? t('plans.confirmed_toast') : t('plans.rejected_toast'))
    } catch (err: any) {
      captureError(err, { tags: { action: `plans.list-${status}` } })
      toast.error(dbErrorMessage(err, locale, L('Planstatus konnte nicht aktualisiert werden', 'Failed to update plan status')))
    } finally {
      setUpdatingId(null)
    }
  }

  // Web "Stornieren" = delete the shift and tell the driver.
  const cancelPlan = (plan: Plan) => {
    Alert.alert(
      L('Schicht stornieren?', 'Cancel shift?'),
      `${safeFormatDate(plan.start_time, 'EEEE, dd.MM.yyyy', { locale: dateLocale })} · ${formatShiftRange(plan.start_time, plan.end_time, locale)}${plan.employee_id ? L('\n\nDer Mitarbeiter wird benachrichtigt.', '\n\nThe employee will be notified.') : ''}`,
      [
        { text: L('Nein', 'No'), style: 'cancel' },
        {
          text: L('Stornieren', 'Cancel shift'),
          style: 'destructive',
          onPress: async () => {
            setUpdatingId(plan.id)
            const { error } = await getSupabase().from('plans').delete().eq('id', plan.id)
            setUpdatingId(null)
            if (error) {
              toast.error(dbErrorMessage(error, locale, L('Einsatzplan konnte nicht gelöscht werden', 'Failed to delete plan')))
              return
            }
            if (plan.employee_id && new Date(plan.end_time) > new Date()) void notifyPlanCancelled(plan, plan.employee_id)
            toast.success(L('Einsatzplan gelöscht', 'Plan deleted'))
            fetchPlans()
          },
        },
      ],
    )
  }

  const sendChangeRequest = async () => {
    const plan = changePlan
    const message = changeMessage.trim()
    if (!plan || !message) return
    setSending(true)
    // Stored DE-canonical, like the web.
    const payload = {
      title: '🔄 Änderungsanfrage',
      message: `${profile?.full_name ?? 'Mitarbeiter'} bittet um eine Änderung der Schicht am ${safeFormatDate(plan.start_time, 'dd.MM.yyyy')}: „${message}"`,
      module: 'plans' as const,
      moduleId: plan.id,
    }
    const res =
      plan.creator_id && plan.creator_id !== session?.user?.id
        ? await sendNotification({ userId: plan.creator_id, ...payload })
        : await notifyManagers(payload)
    setSending(false)
    if (res?.success === false) {
      toast.error(L('Anfrage konnte nicht gesendet werden', 'Request could not be sent'))
      return
    }
    toast.success(L('Änderungsanfrage gesendet', 'Change request sent'))
    setChangePlan(null)
    setChangeMessage('')
  }

  const filterLabel = (s: StatusFilter): string => {
    const labels: Record<StatusFilter, [string, string]> = {
      all: ['Alle', 'All'],
      draft: ['Entwurf', 'Draft'],
      assigned: ['Zugewiesen', 'Assigned'],
      confirmed: ['Bestätigt', 'Confirmed'],
      rejected: ['Abgelehnt', 'Rejected'],
      cancelled: ['Storniert', 'Cancelled'],
      'this-week': ['Diese Woche', 'This week'],
    }
    return L(labels[s][0], labels[s][1])
  }

  const employeeLabel =
    employeeFilter === 'all'
      ? L('Alle Mitarbeiter', 'All employees')
      : employeeOptions.find((e) => e.id === employeeFilter)?.name ?? '—'

  const filters = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, padding: 4 }} style={{ backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9' }}>
        {(isManager ? ADMIN_FILTERS : EMPLOYEE_FILTERS).map((s) => {
          const on = statusFilter === s
          return (
            <Pressable key={s} onPress={() => setStatusFilter(s)}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: on ? '#0064E0' : 'transparent' }}>
                <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: on ? '#FFFFFF' : '#94A3B8' }}>
                  {filterLabel(s)}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {isManager ? (
          <Pressable onPress={() => setEmployeePickerOpen(true)} style={{ flex: 1 }}>
            <View
              style={{
                height: 46,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: employeeFilter === 'all' ? '#F1F5F9' : '#BFDBFE',
                backgroundColor: employeeFilter === 'all' ? '#F8FAFC' : '#EFF6FF',
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: employeeFilter === 'all' ? '#475569' : '#1D4ED8' }} numberOfLines={1}>
                {employeeLabel}
              </Text>
              <ChevronDown size={15} color="#94A3B8" />
            </View>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))} accessibilityLabel={L('Sortierung nach Datum', 'Sort by date')}>
          <View style={{ height: 46, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8', marginRight: 4 }}>{L('Datum', 'Date')}</Text>
            {sortDir === 'asc' ? <ChevronUp size={14} color="#475569" /> : <ChevronDown size={14} color="#475569" />}
          </View>
        </Pressable>
      </View>

      <View style={{ height: 46, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <Search size={15} color="#94A3B8" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={L('Hier suchen …', 'Search here …')}
          placeholderTextColor="#94A3B8"
          style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '500', color: '#0F172A' }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <X size={14} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>
    </View>
  )

  const pagination =
    filteredPlans.length > 0 ? (
      <View style={{ marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderColor: '#F1F5F9', gap: 10 }}>
        <View>
          <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8' }}>
            {L(
              `Zeige ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filteredPlans.length)} von ${filteredPlans.length} Plänen`,
              `Showing ${(currentPage - 1) * PAGE_SIZE + 1} to ${Math.min(currentPage * PAGE_SIZE, filteredPlans.length)} of ${filteredPlans.length} plans`,
            )}
          </Text>
          {isManager ? (
            <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8', marginTop: 2 }}>
              {L('Seitensumme', 'Page total')}: {formatHours(pageHours, locale)} {L('Std.', 'h')}
            </Text>
          ) : null}
        </View>
        {totalPages > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PageButton label={L('Zurück', 'Previous')} disabled={currentPage === 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '900', color: '#475569' }}>
              {L('Seite', 'Page')} {currentPage} / {totalPages}
            </Text>
            <PageButton label={L('Weiter', 'Next')} disabled={currentPage === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))} />
          </View>
        ) : null}
      </View>
    ) : null

  const emptyCard = (
    <Card className="items-center py-10" style={{ borderColor: '#F1F5F9' }}>
      <Calendar size={32} color="#D1D5DB" />
      <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#CBD5E1', marginTop: 12, textAlign: 'center' }}>
        {isManager
          ? L('Keine Pläne in dieser Kategorie', 'No plans found in this category')
          : L('Keine Zuweisungen gefunden.', 'No assignments found.')}
      </Text>
    </Card>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPlans} tintColor="#0064E0" />}
        >
          {isManager ? (
            <>
              <PageHeader
                showBack
                title={L('Pläne & Termine', 'Plans & Schedules')}
                subtitle={L('Schichten und Einsätze verwalten', 'Manage shift assignments and schedules')}
              />

              {/* Action row — CSV · Excel · PDF · Mehrere · Plan erstellen */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8, marginBottom: 12 }}>
                <ExportChip icon={<Download size={15} color="#334155" />} label="CSV" onPress={onCsv} loading={busy === 'csv'} disabled={busy !== null} />
                <ExportChip icon={<FileSpreadsheet size={15} color="#334155" />} label="Excel" onPress={onExcel} loading={busy === 'xlsx'} disabled={busy !== null} />
                <ExportChip icon={<FileText size={15} color="#334155" />} label="PDF" onPress={onPdf} loading={busy === 'pdf'} disabled={busy !== null} />
                {showCreate ? (
                  <ExportChip icon={<CalendarDays size={15} color="#334155" />} label={L('Mehrere', 'Bulk create')} onPress={() => router.push('/plans/bulk' as any)} disabled={busy !== null} />
                ) : null}
              </View>
              {showCreate ? (
                <Pressable onPress={() => router.push('/plans/new' as any)} style={{ marginBottom: 12 }}>
                  <View style={{ height: 50, borderRadius: 16, backgroundColor: '#0064E0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', shadowColor: '#0064E0', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
                    <Plus size={20} color="#FFFFFF" />
                    <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{L('Plan erstellen', 'Create Plan')}</Text>
                  </View>
                </Pressable>
              ) : null}

              {/* Entry to the team week grid */}
              <Pressable onPress={() => router.push('/dashboard' as any)} accessibilityLabel={L('Wochenplanung öffnen', 'Open weekly planning')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 16 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#0064E0', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <CalendarDays size={18} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>{L('Wochenplanung', 'Weekly planning')}</Text>
                    <Text style={{ fontSize: 12, color: '#64748B', marginTop: 1 }} numberOfLines={1}>
                      {L('Alle Mitarbeiter, alle Schichten, eine Ansicht', 'All employees, all shifts, one view')}
                    </Text>
                  </View>
                  <ArrowRight size={16} color="#0064E0" />
                </View>
              </Pressable>

              <Card style={{ borderColor: '#F1F5F9', padding: 14, marginBottom: 14 }}>{filters}</Card>

              {loading && plans.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <ActivityIndicator color="#0064E0" />
                </View>
              ) : pagePlans.length === 0 ? (
                emptyCard
              ) : (
                pagePlans.map((p) => (
                  <AdminPlanRow
                    key={p.id}
                    plan={p}
                    locale={locale}
                    dateLocale={dateLocale}
                    updating={updatingId === p.id}
                    onOpen={() => router.push(`/plans/${p.id}` as any)}
                    onEdit={() => router.push(`/plans/edit/${p.id}` as any)}
                    onMenu={() => setMenuPlan(p)}
                  />
                ))
              )}
              {pagination}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#2563EB', marginBottom: 2 }}>
                {L('Mein Dienstplan', 'My Schedule')}
              </Text>
              <PageHeader showBack title={L('Meine Pläne', 'My Plans')} />
              <View style={{ marginTop: -8, marginBottom: 16 }}>{filters}</View>

              <Pressable onPress={() => router.push('/plans/my-week' as any)} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#EFF6FF', padding: 12 }}>
                  <CalendarDays size={16} color="#0064E0" />
                  <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '800', color: '#1D4ED8', flex: 1 }}>{L('Meine Woche', 'My week')}</Text>
                  <ArrowRight size={14} color="#0064E0" />
                </View>
              </Pressable>

              {loading && plans.length === 0 ? (
                <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                  <ActivityIndicator color="#0064E0" />
                </View>
              ) : grouped.length === 0 ? (
                emptyCard
              ) : (
                grouped.map((group) => (
                  <View key={group.date} style={{ marginBottom: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
                      <Text style={{ paddingHorizontal: 8, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8' }} numberOfLines={1}>
                        {safeFormatDate(group.date, 'EEEE, dd. MMMM yyyy', { locale: dateLocale })} ·{' '}
                        <Text style={{ color: '#2563EB' }}>KW {isoWeekOfKey(group.date)}</Text>
                      </Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: '#F1F5F9' }} />
                    </View>
                    {group.items.map((p) => (
                      <EmployeePlanCard
                        key={p.id}
                        plan={p}
                        locale={locale}
                        updating={updatingId === p.id}
                        onOpen={() => router.push(`/plans/${p.id}` as any)}
                        onConfirm={() => setStatus(p, 'confirmed')}
                        onReject={() => {
                          setRejectReason('')
                          setRejectPlan(p)
                        }}
                        onChange={() => {
                          setChangeMessage('')
                          setChangePlan(p)
                        }}
                      />
                    ))}
                  </View>
                ))
              )}
              {pagination}
            </>
          )}
        </ScrollView>
      </Screen>

      {/* Row menu (web dropdown) */}
      <Modal visible={!!menuPlan} transparent animationType="fade" onRequestClose={() => setMenuPlan(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setMenuPlan(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingBottom: 28 }}>
            {menuPlan ? (
              <>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', marginBottom: 8, marginLeft: 4 }} numberOfLines={1}>
                  {(menuPlan.employee?.full_name ?? L('Unbesetzt', 'Unassigned'))} · {safeFormatDate(menuPlan.start_time, 'dd.MM.yyyy')}
                </Text>
                <MenuItem icon={<Pencil size={16} color="#94A3B8" />} label={L('Plan bearbeiten', 'Edit Plan')} onPress={() => { const p = menuPlan; setMenuPlan(null); router.push(`/plans/edit/${p.id}` as any) }} />
                {menuPlan.status === 'assigned' ? (
                  <MenuItem icon={<CheckCircle2 size={16} color="#059669" />} label={L('Bestätigen', 'Confirm Shift')} color="#059669" onPress={() => { const p = menuPlan; setMenuPlan(null); void setStatus(p, 'confirmed') }} />
                ) : null}
                {menuPlan.status === 'assigned' || menuPlan.status === 'draft' ? (
                  <MenuItem icon={<XCircle size={16} color="#EA580C" />} label={L('Ablehnen', 'Reject Shift')} color="#EA580C" onPress={() => { const p = menuPlan; setMenuPlan(null); setRejectReason(''); setRejectPlan(p) }} />
                ) : null}
                {menuPlan.status !== 'cancelled' && menuPlan.status !== 'rejected' ? (
                  <>
                    <View style={{ height: 1, backgroundColor: '#F1F5F9', marginVertical: 4, marginHorizontal: 8 }} />
                    <MenuItem icon={<Ban size={16} color="#EF4444" />} label={L('Stornieren', 'Cancel Shift')} color="#EF4444" onPress={() => { const p = menuPlan; setMenuPlan(null); cancelPlan(p) }} />
                  </>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Employee filter */}
      <Modal visible={employeePickerOpen} transparent animationType="slide" onRequestClose={() => setEmployeePickerOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setEmployeePickerOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingBottom: 28, maxHeight: '75%' }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', marginBottom: 8, marginLeft: 4 }}>{L('Mitarbeiter', 'Employee')}</Text>
            <ScrollView>
              {[{ id: 'all', name: L('Alle Mitarbeiter', 'All employees') }, ...employeeOptions].map((e) => {
                const on = employeeFilter === e.id
                return (
                  <Pressable key={e.id} onPress={() => { setEmployeeFilter(e.id); setEmployeePickerOpen(false) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: on ? '#EFF6FF' : 'transparent' }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: on ? '900' : '600', color: on ? '#0064E0' : '#0F172A' }} numberOfLines={1}>{e.name}</Text>
                      {on ? <Check size={16} color="#0064E0" /> : null}
                    </View>
                  </Pressable>
                )
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reject with optional reason */}
      <Modal visible={!!rejectPlan} transparent animationType="fade" onRequestClose={() => setRejectPlan(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>{L('Schicht ablehnen', 'Reject shift')}</Text>
            {rejectPlan ? (
              <Text style={{ marginTop: 6, fontSize: 12, color: '#64748B' }}>
                {safeFormatDate(rejectPlan.start_time, 'EEEE, dd.MM.yyyy', { locale: dateLocale })} · {formatShiftRange(rejectPlan.start_time, rejectPlan.end_time, locale)}
              </Text>
            ) : null}
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder={L('Grund (optional)', 'Reason (optional)')}
              placeholderTextColor="#9CA3AF"
              style={{ marginTop: 12, minHeight: 72, borderWidth: 2, borderColor: '#F1F5F9', borderRadius: 14, padding: 12, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB', textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setRejectPlan(null)}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', padding: 10 }}>{L('Abbrechen', 'Cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const p = rejectPlan
                  setRejectPlan(null)
                  if (p) void setStatus(p, 'rejected', rejectReason.trim() || undefined)
                }}
              >
                <View style={{ borderRadius: 12, backgroundColor: '#DC2626', paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>{L('Ablehnen', 'Reject')}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change request (employee) */}
      <Modal visible={!!changePlan} transparent animationType="slide" onRequestClose={() => setChangePlan(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setChangePlan(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#2563EB' }}>{L('Änderungsanfrage', 'Change request')}</Text>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', marginTop: 2 }}>{L('Änderung anfragen', 'Request modification')}</Text>
              </View>
              <Pressable onPress={() => setChangePlan(null)} hitSlop={8} style={{ padding: 4 }}>
                <X size={18} color="#94A3B8" />
              </Pressable>
            </View>
            {changePlan ? (
              <View style={{ marginTop: 14, borderRadius: 16, backgroundColor: '#EFF6FF', padding: 14 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#2563EB' }}>{L('Schicht', 'Shift')}</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2 }}>
                  {safeFormatDate(changePlan.start_time, 'EEEE, dd. MMMM', { locale: dateLocale })}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 1 }}>
                  {formatShiftRange(changePlan.start_time, changePlan.end_time, locale)}
                  {changePlan.location ? ` · ${changePlan.location}` : ''}
                </Text>
              </View>
            ) : null}
            <TextInput
              value={changeMessage}
              onChangeText={setChangeMessage}
              multiline
              placeholder={L('Was soll geändert werden?', 'What should be changed?')}
              placeholderTextColor="#9CA3AF"
              style={{ marginTop: 12, minHeight: 100, borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, padding: 14, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB', textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => setChangePlan(null)} style={{ flex: 1 }}>
                <View style={{ height: 48, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155' }}>{L('Abbrechen', 'Cancel')}</Text>
                </View>
              </Pressable>
              <Pressable onPress={sendChangeRequest} disabled={!changeMessage.trim() || sending} style={{ flex: 1 }}>
                <View style={{ height: 48, borderRadius: 16, backgroundColor: '#2563EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', opacity: !changeMessage.trim() || sending ? 0.5 : 1 }}>
                  {sending ? <ActivityIndicator color="#FFFFFF" /> : <MessageSquare size={16} color="#FFFFFF" />}
                  <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>{L('Anfrage senden', 'Send request')}</Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function initialsOf(name: string | null | undefined): string {
  return (name || 'U')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function AdminPlanRow({
  plan,
  locale,
  dateLocale,
  updating,
  onOpen,
  onEdit,
  onMenu,
}: {
  plan: Plan
  locale: 'de' | 'en'
  dateLocale: typeof deLocale
  updating: boolean
  onOpen: () => void
  onEdit: () => void
  onMenu: () => void
}) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const start = safeParseISO(plan.start_time)
  const name = plan.employee?.full_name ?? null
  return (
    <Pressable onPress={onOpen}>
      <View style={{ borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', padding: 14, marginBottom: 10, opacity: updating ? 0.6 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {plan.employee?.avatar_url ? (
            <Image source={{ uri: plan.employee.avatar_url }} style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#EFF6FF' }} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: name ? '#0064E0' : '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '900', color: name ? '#FFFFFF' : '#B45309' }}>{name ? initialsOf(name) : '?'}</Text>
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: name ? '#0F172A' : '#B45309' }} numberOfLines={1}>
              {name ?? L('Unbesetzt', 'Unassigned')}
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginTop: 1 }} numberOfLines={1}>
              {safeFormatDate(plan.start_time, 'EEE, dd. MMM yyyy', { locale: dateLocale })}
              {start ? ` · KW ${isoWeek(start)}` : ''}
            </Text>
          </View>
          {updating ? <ActivityIndicator size="small" color="#0064E0" /> : <StatusBadge status={plan.status} />}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>{L('Startzeit', 'Start time')}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 1, fontVariant: ['tabular-nums'] }}>{safeFormatTime(plan.start_time)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>{L('Endzeit', 'End time')}</Text>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 1, fontVariant: ['tabular-nums'] }}>{safeFormatTime(plan.end_time)}
              {endDayOffset(plan.start_time, plan.end_time) > 0 ? (
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#4338CA' }}> +{endDayOffset(plan.start_time, plan.end_time)}</Text>
              ) : null}
            </Text>
          </View>
          <View style={{ flex: 1.4 }}>
            <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }}>{L('Kunde', 'Customer')}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 1 }} numberOfLines={1}>{plan.customer?.name ?? '—'}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
          <MapPin size={12} color="#94A3B8" />
          <Text style={{ flex: 1, marginLeft: 4, fontSize: 12, fontWeight: '600', color: '#64748B' }} numberOfLines={1}>
            {plan.location ?? '—'}
          </Text>
          <Pressable onPress={onEdit} hitSlop={6} accessibilityLabel={L('Plan bearbeiten', 'Edit Plan')}>
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
              <Pencil size={15} color="#94A3B8" />
            </View>
          </Pressable>
          <Pressable onPress={onMenu} hitSlop={6} style={{ marginLeft: 6 }} accessibilityLabel={L('Aktionen', 'Actions')}>
            <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
              <MoreHorizontal size={17} color="#94A3B8" />
            </View>
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

function EmployeePlanCard({
  plan,
  locale,
  updating,
  onOpen,
  onConfirm,
  onReject,
  onChange,
}: {
  plan: Plan
  locale: 'de' | 'en'
  updating: boolean
  onOpen: () => void
  onConfirm: () => void
  onReject: () => void
  onChange: () => void
}) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hours = hoursBetween(plan.start_time, plan.end_time, 0)
  return (
    <Pressable onPress={onOpen}>
      <View style={{ borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#FFFFFF', padding: 16, marginBottom: 10, opacity: updating ? 0.6 : 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <View style={{ alignSelf: 'flex-start' }}>
              <StatusBadge status={plan.status} />
            </View>
            {plan.shift_name || plan.route ? (
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0064E0' }} numberOfLines={1}>{plan.shift_name || plan.route}</Text>
            ) : null}
            {plan.location ? <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>{plan.location}</Text> : null}
            {plan.customer?.name ? (
              <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8' }} numberOfLines={1}>
                {plan.customer.name}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#001D3D', fontVariant: ['tabular-nums'] }}>
              {formatHours(hours, locale)} {L('Std.', 'h')}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', marginTop: 2 }}>{formatShiftRange(plan.start_time, plan.end_time, locale)}</Text>
          </View>
        </View>

        {plan.notes ? (
          <View style={{ marginTop: 12, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F9FAFB', padding: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase', color: '#94A3B8', marginBottom: 2 }}>{L('Notizen', 'Notes')}</Text>
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#4B5563' }} numberOfLines={2}>{plan.notes}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {plan.status === 'assigned' ? (
            <>
              <Pressable onPress={onConfirm} disabled={updating} style={{ flex: 1 }}>
                <View style={{ height: 40, borderRadius: 12, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#FFFFFF' }}>{updating ? '…' : L('Ja', 'Confirm')}</Text>
                </View>
              </Pressable>
              <Pressable onPress={onReject} disabled={updating} style={{ flex: 1 }}>
                <View style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2', backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: '#DC2626' }}>{L('Nein', 'Reject')}</Text>
                </View>
              </Pressable>
            </>
          ) : null}
          <Pressable onPress={onChange} style={{ flex: 1 }}>
            <View style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#94A3B8' }}>{L('Ändern', 'Modify')}</Text>
            </View>
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

function MenuItem({ icon, label, onPress, color = '#0F172A' }: { icon: React.ReactNode; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 12 }}>
        {icon}
        <Text style={{ marginLeft: 10, fontSize: 14, fontWeight: '700', color }}>{label}</Text>
      </View>
    </Pressable>
  )
}

function PageButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      <View style={{ height: 40, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
        <Text style={{ fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#334155' }}>{label}</Text>
      </View>
    </Pressable>
  )
}

function ExportChip({
  icon,
  label,
  onPress,
  loading,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 44,
          paddingHorizontal: 14,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          backgroundColor: '#FFFFFF',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color="#0064E0" /> : icon}
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: '#334155',
            marginLeft: 6,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  )
}
