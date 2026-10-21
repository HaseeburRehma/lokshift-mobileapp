/**
 * Spesen (Verpflegungsmehraufwand) — phone replica of the webapp's
 * app/dashboard/per-diem/page.tsx:
 *
 *   header (+ CSV / Excel / PDF for admin & dispatch)
 *   → SpesenExplainer (automatic Spesen from shifts vs. claims)
 *   → stat cards (Gesamt diesen Monat · Offene Anträge · Genehmigt · Gesamtsumme)
 *   → "Zusätzliche Spesenanträge" card: search, status filter, add button,
 *     one row per claim with approve / reject / details, pagination
 *   → detail sheet
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native'
import {
  Plus,
  Wallet,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Eye,
  X as XIcon,
} from 'lucide-react-native'
import { format } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { safeFormatDate, safeNumber, safeParseISO } from '@/lib/safe-format'
import { captureError } from '@/lib/monitoring'
import { PageHeader } from '@/components/PageHeader'
import { SpesenExplainer } from '@/components/SpesenExplainer'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { PerDiemSheet } from '@/components/PerDiemSheet'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { usePerDiem } from '@/hooks/usePerDiem'
import { canApproveTimes } from '@/lib/rbac/permissions'
import { exportPerDiemPdf } from '@/lib/pdf/reports'
import { exportPerDiemXlsx } from '@/lib/excel/reports'
import { exportCsv } from '@/lib/csv/exportCsv'
import type { PerDiem, PerDiemStatus } from '@/lib/types'

const ITEMS_PER_PAGE = 10

type StatusFilter = 'all' | PerDiemStatus

// Web StatusBadge: amber (pending) · emerald (approved) · red (rejected).
const STATUS_BADGE: Record<string, { bg: string; border: string; text: string }> = {
  submitted: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  approved: { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
  rejected: { bg: '#FEF2F2', border: '#FECACA', text: '#EF4444' },
}

export default function PerDiemScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, isEmployee } = useUser()
  const canApprove = canApproveTimes(role)
  const dateLocale = locale === 'de' ? deLocale : enUS

  // Status filter is applied client-side (like the webapp) so the stat
  // cards always describe every claim, not just the filtered ones.
  const [filter, setFilter] = useState<StatusFilter>('all')
  const { items, loading, fetchItems, submit, updateStatus } = usePerDiem()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<PerDiem | null>(null)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  const stamp = format(new Date(), 'yyyy-MM-dd')

  const approve = async (p: PerDiem) => {
    try { await updateStatus(p, 'approved'); toast.success(L('Genehmigt', 'Approved')) }
    catch (err: any) { toast.error(err?.message ?? t('common.error')) }
  }
  const reject = async (p: PerDiem) => {
    try { await updateStatus(p, 'rejected'); toast.success(L('Abgelehnt', 'Rejected')) }
    catch (err: any) { toast.error(err?.message ?? t('common.error')) }
  }

  const statusLabel = (s: string) =>
    s === 'submitted'
      ? L('Ausstehend', 'Pending')
      : s === 'approved'
        ? L('Genehmigt', 'Approved')
        : s === 'rejected'
          ? L('Abgelehnt', 'Rejected')
          : s

  // Employee options for the admin filter
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of items) {
      if (p.employee_id && p.employee?.full_name) map.set(p.employee_id, p.employee.full_name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((p) => {
      if (filter !== 'all' && p.status !== filter) return false
      if (employeeFilter !== 'all' && p.employee_id !== employeeFilter) return false
      if (!q) return true
      const name = p.employee?.full_name?.toLowerCase() ?? ''
      const country = (p.country ?? '').toLowerCase()
      const notes = (p.notes ?? '').toLowerCase()
      const task = (p.task ?? '').toLowerCase()
      return name.includes(q) || country.includes(q) || notes.includes(q) || task.includes(q) || String(p.amount).includes(q)
    })
  }, [items, filter, employeeFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = useMemo(
    () => filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [filtered, page],
  )

  useEffect(() => {
    setPage(1)
  }, [search, employeeFilter, filter])

  // Snap page back into range when the underlying list shrinks.
  useEffect(() => {
    if (page > totalPages) setPage(Math.max(1, totalPages))
  }, [page, totalPages])

  // Same four numbers as the webapp's stat cards (over all claims).
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = items.filter((p) => {
      const d = safeParseISO(p.date)
      return !!d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    const totalAmount = thisMonth
      .filter((p) => p.status === 'approved')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const pendingCount = items.filter((p) => p.status === 'submitted').length
    const approvedCount = items.filter((p) => p.status === 'approved').length
    const totalAll = items.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    return { totalAmount, pendingCount, approvedCount, totalAll }
  }, [items])

  const exportError = (err: any) => {
    captureError(err, {
      tags: { area: 'per-diem.export' },
      extra: { rowCount: filtered.length, employeeFilter, statusFilter: filter, search },
      message: 'Per-diem export failed',
    })
    toast.error(err?.message ?? L('Export fehlgeschlagen.', 'Export failed.'))
  }

  const onCsv = async () => {
    if (filtered.length === 0) {
      toast.error(L('Keine Daten zum Exportieren.', 'No data to export.'))
      return
    }
    setBusy('csv')
    try {
      const headers =
        locale === 'de'
          ? ['Datum', 'Mitarbeiter', 'Land', 'Tage', 'Satz €', 'Betrag €', 'Status', 'Notizen']
          : ['Date', 'Employee', 'Country', 'Days', 'Rate €', 'Amount €', 'Status', 'Notes']
      const rows = filtered.map((p) => [
        safeFormatDate(p.date, 'dd.MM.yyyy'),
        p.employee?.full_name ?? p.employee_id,
        p.country || '-',
        Number.isFinite(Number(p.num_days)) ? Number(p.num_days) : 0,
        safeNumber(p.rate),
        safeNumber(p.amount),
        p.status,
        (p.notes ?? '').replace(/[,;]/g, ' '),
      ])
      await exportCsv({ headers, rows, filename: `spesenbericht_${stamp}`, dialogTitle: L('Spesen', 'Per Diem') })
      toast.success(L('Export gestartet', 'Export started'))
    } catch (err: any) {
      exportError(err)
    } finally {
      setBusy(null)
    }
  }

  const onExcel = async () => {
    if (filtered.length === 0) {
      toast.error(L('Keine Daten zum Exportieren.', 'No data to export.'))
      return
    }
    setBusy('xlsx')
    try {
      await exportPerDiemXlsx(filtered, { sheetName: L('Spesen', 'Per Diem'), filename: `spesenbericht_${stamp}`, locale })
    } catch (err: any) {
      exportError(err)
    } finally {
      setBusy(null)
    }
  }

  const onPdf = async () => {
    if (filtered.length === 0) {
      toast.error(L('Keine Daten zum Exportieren.', 'No data to export.'))
      return
    }
    setBusy('pdf')
    try {
      await exportPerDiemPdf(filtered, {
        title: L('Spesenbericht', 'Per Diem Report'),
        subtitle: L(`Stand ${format(new Date(), 'dd.MM.yyyy')}`, `As of ${format(new Date(), 'yyyy-MM-dd')}`),
        filename: `spesenbericht_${stamp}`,
        locale,
      })
    } catch (err: any) {
      exportError(err)
    } finally {
      setBusy(null)
    }
  }

  const selectedEmployeeName =
    employeeFilter === 'all'
      ? L('Alle Mitarbeiter', 'All employees')
      : (employeeOptions.find((e) => e.id === employeeFilter)?.name ?? '—')

  const formatDateRange = (pd: PerDiem) => {
    if (pd.start_date && pd.end_date) {
      return `${safeFormatDate(pd.start_date, locale === 'de' ? 'd. MMM' : 'MMM d', { locale: dateLocale })} – ${safeFormatDate(pd.end_date, locale === 'de' ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale })}`
    }
    return safeFormatDate(pd.date, locale === 'de' ? 'd. MMM yyyy' : 'MMM d, yyyy', { locale: dateLocale })
  }

  const daysOrHours = (pd: PerDiem) => {
    if (pd.working_hours) return `${pd.working_hours} ${L('Std.', 'hrs')}`
    const n = Number(pd.num_days) || 1
    return `${n} ${n === 1 ? L('Tag', 'day') : L('Tage', 'days')}`
  }

  const rateLabel = (pd: PerDiem) => {
    if (pd.working_hours && pd.hourly_rate) return `€${safeNumber(pd.hourly_rate)}/${L('Std.', 'hr')}`
    return `€${safeNumber(pd.rate)}/${L('Tag', 'day')}`
  }

  const canAdd = isEmployee || canApprove
  const filterLabels: Record<StatusFilter, string> = {
    all: L('Alle', 'All'),
    submitted: L('Ausstehend', 'Pending'),
    approved: L('Genehmigt', 'Approved'),
    rejected: L('Abgelehnt', 'Rejected'),
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} tintColor="#0064E0" />}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader
            showBack
            title={L('Spesen (Verpflegungsmehraufwand)', 'Per diem (meal allowance)')}
            subtitle={L(
              'Automatische Spesen aus Schichten und zusätzliche Spesenanträge',
              'Automatic per diem from shifts and additional claims',
            )}
          />

          {canApprove ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8, marginBottom: 20 }}>
              <OutlineButton
                icon={<Download size={16} color="#475569" />}
                label={L('CSV exportieren', 'Export CSV')}
                onPress={onCsv}
                loading={busy === 'csv'}
                disabled={busy !== null}
              />
              <OutlineButton
                icon={<FileSpreadsheet size={16} color="#475569" />}
                label="Excel"
                onPress={onExcel}
                loading={busy === 'xlsx'}
                disabled={busy !== null}
              />
              <OutlineButton
                icon={<FileText size={16} color="#475569" />}
                label="PDF"
                onPress={onPdf}
                loading={busy === 'pdf'}
                disabled={busy !== null}
              />
            </View>
          ) : null}

          <SpesenExplainer manager={canApprove} />

          {/* Stat cards */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 18 }}>
            <StatCard value={`€${safeNumber(stats.totalAmount)}`} label={L('Gesamt diesen Monat', 'Total This Month')} color="#2563EB" />
            <StatCard value={String(stats.pendingCount)} label={L('Offene Anträge', 'Pending Claims')} color="#2563EB" />
            <StatCard value={String(stats.approvedCount)} label={L('Genehmigt', 'Approved')} color="#10B981" />
            <StatCard value={`€${safeNumber(stats.totalAll, 0)}`} label={L('Gesamtsumme', 'Total All Time')} color="#0F172A" />
          </View>

          {/* Claims card */}
          <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
                {L('Zusätzliche Spesenanträge', 'Additional per diem claims')}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    height: 40,
                  }}
                >
                  <Search size={16} color="#94A3B8" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={canApprove ? L('Mitarbeiter oder Einsatz suchen…', 'Search employee or task…') : L('Zielort suchen…', 'Search destination…')}
                    placeholderTextColor="#94A3B8"
                    style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '500', color: '#334155' }}
                    autoCapitalize="none"
                  />
                </View>
                {canApprove && employeeOptions.length > 0 ? (
                  <Pressable onPress={() => setEmployeePickerOpen((v) => !v)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: employeeFilter === 'all' ? '#E2E8F0' : '#0064E0',
                        backgroundColor: employeeFilter === 'all' ? '#FFFFFF' : '#EFF6FF',
                        height: 40,
                        maxWidth: 140,
                      }}
                    >
                      <UsersIcon size={14} color={employeeFilter === 'all' ? '#475569' : '#0064E0'} />
                      <Text
                        numberOfLines={1}
                        style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: employeeFilter === 'all' ? '#475569' : '#0064E0' }}
                      >
                        {employeeFilter === 'all' ? L('Alle', 'All') : selectedEmployeeName.split(' ')[0]}
                      </Text>
                    </View>
                  </Pressable>
                ) : null}
              </View>

              {employeePickerOpen && canApprove ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {[{ id: 'all', name: L('Alle Mitarbeiter', 'All employees') }, ...employeeOptions].map((e) => (
                    <FilterPill
                      key={e.id}
                      label={e.name}
                      active={employeeFilter === e.id}
                      onPress={() => {
                        setEmployeeFilter(e.id)
                        setEmployeePickerOpen(false)
                      }}
                    />
                  ))}
                </View>
              ) : null}

              {/* Status filters — web: slate-900 active */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(['all', 'submitted', 'approved', 'rejected'] as StatusFilter[]).map((f) => {
                  const active = filter === f
                  return (
                    <Pressable
                      key={f}
                      onPress={() => setFilter(f)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? '#0F172A' : '#E2E8F0',
                        backgroundColor: active ? '#0F172A' : '#FFFFFF',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: active ? '#FFFFFF' : '#64748B' }}>{filterLabels[f]}</Text>
                    </Pressable>
                  )
                })}
              </View>

              {canAdd ? (
                <Pressable
                  onPress={() => setSheetOpen(true)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: '#2563EB',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Plus size={16} color="#FFFFFF" />
                  <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>
                    {L('Antrag hinzufügen', 'Add Claim')}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Rows */}
            {loading && items.length === 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 56 }}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={{ marginLeft: 10, fontSize: 13, color: '#94A3B8' }}>{L('Anträge werden geladen…', 'Loading claims…')}</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 64, opacity: 0.6 }}>
                <Wallet size={40} color="#CBD5E1" />
                <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '500', color: '#94A3B8' }}>
                  {L('Keine Spesenanträge gefunden.', 'No per diem claims found.')}
                </Text>
              </View>
            ) : (
              paginated.map((pd, i) => (
                <View
                  key={pd.id}
                  style={{ paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: '#F1F5F9', gap: 12 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                      {canApprove ? (
                        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600', color: '#2563EB', marginBottom: 3 }}>
                          {pd.employee?.full_name ?? L('Unbekannt', 'Unknown')}
                        </Text>
                      ) : null}
                      <Text style={{ fontSize: 14, fontWeight: '600', color: '#0F172A' }}>{formatDateRange(pd)}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: '#94A3B8', marginTop: 3 }}>
                        {`${pd.country || '—'} · ${daysOrHours(pd)}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669', fontVariant: ['tabular-nums'] }}>
                        {`€${safeNumber(pd.amount)}`}
                      </Text>
                      <View style={{ marginTop: 6 }}>
                        <StatusPill status={pd.status} label={statusLabel(pd.status)} />
                      </View>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>{rateLabel(pd)}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {canApprove && pd.status === 'submitted' ? (
                        <>
                          <Pressable
                            onPress={() => approve(pd)}
                            style={{ height: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 8, backgroundColor: '#ECFDF5' }}
                          >
                            <CheckCircle2 size={14} color="#059669" />
                            <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: '#059669' }}>{L('Genehmigen', 'Approve')}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => reject(pd)}
                            style={{ height: 32, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 8, backgroundColor: '#FEF2F2' }}
                          >
                            <XCircle size={14} color="#EF4444" />
                            <Text style={{ marginLeft: 4, fontSize: 12, fontWeight: '600', color: '#EF4444' }}>{L('Ablehnen', 'Reject')}</Text>
                          </Pressable>
                        </>
                      ) : null}
                      <Pressable
                        onPress={() => setSelected(pd)}
                        accessibilityLabel={L('Details anzeigen', 'View details')}
                        style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Eye size={16} color="#64748B" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))
            )}

            {/* Pagination */}
            {totalPages > 1 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 14,
                  borderTopWidth: 1,
                  borderTopColor: '#F1F5F9',
                  backgroundColor: '#F8FAFC',
                }}
              >
                <PageArrow dir="prev" disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
                {totalPages <= 7 ? (
                  Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setPage(n)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: n === page ? '#2563EB' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: n === page ? '#FFFFFF' : '#64748B' }}>{n}</Text>
                    </Pressable>
                  ))
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginHorizontal: 8 }}>{`${page} / ${totalPages}`}</Text>
                )}
                <PageArrow dir="next" disabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))} />
              </View>
            ) : null}
          </View>
        </ScrollView>

        <PerDiemSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} />

        <PerDiemDetailSheet
          pd={selected}
          isAdminView={canApprove}
          formatDateRange={formatDateRange}
          daysOrHours={daysOrHours}
          rateLabel={rateLabel}
          statusLabel={statusLabel}
          onClose={() => setSelected(null)}
          onApprove={(pd) => {
            setSelected(null)
            approve(pd)
          }}
          onReject={(pd) => {
            setSelected(null)
            reject(pd)
          }}
        />
      </Screen>
    </View>
  )
}

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
      <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 16, backgroundColor: '#FFFFFF' }}>
        <Text
          style={{ fontSize: 24, fontWeight: '700', color, letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6 }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const s = STATUS_BADGE[status] ?? { bg: '#F8FAFC', border: '#E2E8F0', text: '#64748B' }
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: s.border, backgroundColor: s.bg }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: s.text }}>{label}</Text>
    </View>
  )
}

function OutlineButton({
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
          paddingHorizontal: 14,
          height: 38,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#E2E8F0',
          backgroundColor: '#FFFFFF',
          opacity: disabled && !loading ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color="#475569" /> : icon}
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginLeft: 8 }}>{label}</Text>
      </View>
    </Pressable>
  )
}

function PageArrow({ dir, disabled, onPress }: { dir: 'prev' | 'next'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {dir === 'prev' ? <ChevronLeft size={16} color="#64748B" /> : <ChevronRight size={16} color="#64748B" />}
    </Pressable>
  )
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress}>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: active ? '#0064E0' : '#E2E8F0',
          backgroundColor: active ? '#0064E0' : '#FFFFFF',
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : '#475569' }}>{label}</Text>
      </View>
    </Pressable>
  )
}

/** Web: PerDiemDetailModal — read-only detail rows + approve / reject. */
function PerDiemDetailSheet({
  pd,
  isAdminView,
  formatDateRange,
  daysOrHours,
  rateLabel,
  statusLabel,
  onClose,
  onApprove,
  onReject,
}: {
  pd: PerDiem | null
  isAdminView: boolean
  formatDateRange: (pd: PerDiem) => string
  daysOrHours: (pd: PerDiem) => string
  rateLabel: (pd: PerDiem) => string
  statusLabel: (s: string) => string
  onClose: () => void
  onApprove: (pd: PerDiem) => void
  onReject: (pd: PerDiem) => void
}) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  return (
    <Modal visible={!!pd} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        {pd ? (
          <Pressable
            onPress={() => {}}
            style={{ width: '100%', maxWidth: 440, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#F1F5F9',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0F172A' }}>{L('Spesendetails', 'Per Diem Detail')}</Text>
              <Pressable onPress={onClose} hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <XIcon size={18} color="#94A3B8" />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
              {isAdminView && pd.employee?.full_name ? (
                <DetailRow label={L('Mitarbeiter', 'Employee')} value={pd.employee.full_name} />
              ) : null}
              <DetailRow label={L('Reisezeitraum', 'Travel Dates')} value={formatDateRange(pd)} />
              <DetailRow label={L('Zielort', 'Destination')} value={pd.country || '—'} />
              <DetailRow label={L('Dauer', 'Duration')} value={daysOrHours(pd)} />
              <DetailRow label={L('Satz', 'Rate')} value={rateLabel(pd)} />
              {pd.task ? <DetailRow label={L('Einsatz / Notiz', 'Task / Note')} value={pd.task} /> : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: '#F1F5F9',
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>{L('Gesamtbetrag', 'Total Amount')}</Text>
                <Text style={{ fontSize: 22, fontWeight: '700', color: '#059669', fontVariant: ['tabular-nums'] }}>
                  {`€${safeNumber(pd.amount)}`}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 }}>
                <Text style={{ fontSize: 13, color: '#94A3B8' }}>Status</Text>
                <StatusPill status={pd.status} label={statusLabel(pd.status)} />
              </View>
            </View>

            {isAdminView && pd.status === 'submitted' ? (
              <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingBottom: 20 }}>
                <Pressable
                  onPress={() => onReject(pd)}
                  style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>{L('Ablehnen', 'Reject')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onApprove(pd)}
                  style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFFFFF' }}>{L('Genehmigen', 'Approve')}</Text>
                </Pressable>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </Pressable>
    </Modal>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '500', color: '#94A3B8' }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A', textAlign: 'right', flexShrink: 1, marginLeft: 12 }}>{value}</Text>
    </View>
  )
}
