/**
 * Per Diem screen — mirrors web /dashboard/per-diem.
 *
 * Employee view: own claims list with status badges + submit FAB.
 *
 * Managerial view: hero YTD card + 3 stats tiles (total amount,
 * pending count, approved count) + status filter tabs + employee
 * filter + search + CSV/Excel/PDF exports + paginated list with
 * approve/reject actions on submitted rows.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
} from 'react-native'
import {
  Plus,
  Check,
  X as XIcon,
  Euro,
  Wallet,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native'
import { format } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { safeFormatDate, safeNumber } from '@/lib/safe-format'
import { captureError } from '@/lib/monitoring'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
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

const STATUS_STYLES: Record<PerDiemStatus, { bg: string; text: string }> = {
  submitted: { bg: 'bg-amber-100', text: 'text-amber-700' },
  approved:  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected:  { bg: 'bg-red-100', text: 'text-red-600' },
}

export default function PerDiemScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, isEmployee } = useUser()
  const canApprove = canApproveTimes(role)
  const dateLocale = locale === 'de' ? deLocale : enUS

  const [filter, setFilter] = useState<'all' | PerDiemStatus>('all')
  const { items, loading, fetchItems, submit, updateStatus, ytdTotal } = usePerDiem(filter)
  const [sheetOpen, setSheetOpen] = useState(false)
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

  // Employee options for the admin filter dropdown
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of items) {
      if (p.employee_id && p.employee?.full_name) {
        map.set(p.employee_id, p.employee.full_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((p) => {
      if (employeeFilter !== 'all' && p.employee_id !== employeeFilter) return false
      if (!q) return true
      const name = p.employee?.full_name?.toLowerCase() ?? ''
      const country = (p.country ?? '').toLowerCase()
      const notes = (p.notes ?? '').toLowerCase()
      const task = (p.task ?? '').toLowerCase()
      return (
        name.includes(q) ||
        country.includes(q) ||
        notes.includes(q) ||
        task.includes(q) ||
        String(p.amount).includes(q)
      )
    })
  }, [items, employeeFilter, search])

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

  // Stats — computed off the un-paginated filtered set so admins see
  // aggregate counts that respond to the search/employee filter.
  const stats = useMemo(() => {
    const totalAmount = filtered.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const pending = filtered.filter((p) => p.status === 'submitted').length
    const approved = filtered.filter((p) => p.status === 'approved').length
    return { totalAmount, pending, approved }
  }, [filtered])

  const noMatches = filtered.length === 0 && !loading

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
      await exportCsv({
        headers,
        rows,
        filename: `spesenbericht_${stamp}`,
        dialogTitle: L('Spesen', 'Per Diem'),
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'per-diem.export' },
        extra: { rowCount: filtered.length, employeeFilter, statusFilter: filter, search },
        message: 'Per-diem export failed',
      })
      toast.error(err?.message ?? L('Export fehlgeschlagen.', 'Export failed.'))
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
      await exportPerDiemXlsx(filtered, {
        sheetName: L('Spesen', 'Per Diem'),
        filename: `spesenbericht_${stamp}`,
        locale,
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'per-diem.export' },
        extra: { rowCount: filtered.length, employeeFilter, statusFilter: filter, search },
        message: 'Per-diem export failed',
      })
      toast.error(err?.message ?? L('Export fehlgeschlagen.', 'Export failed.'))
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
        subtitle: L(
          `Stand ${format(new Date(), 'dd.MM.yyyy')}`,
          `As of ${format(new Date(), 'yyyy-MM-dd')}`,
        ),
        filename: `spesenbericht_${stamp}`,
        locale,
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'per-diem.export' },
        extra: { rowCount: filtered.length, employeeFilter, statusFilter: filter, search },
        message: 'Per-diem export failed',
      })
      toast.error(err?.message ?? L('Export fehlgeschlagen.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const selectedEmployeeName =
    employeeFilter === 'all'
      ? L('Alle Mitarbeiter', 'All employees')
      : (employeeOptions.find((e) => e.id === employeeFilter)?.name ?? '—')

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} tintColor="#0064E0" />}
        >
          <PageHeader
            showBack
            title={L('Spesen', 'Per Diem')}
            subtitle={L('Verpflegungsmehraufwand', 'Travel allowance')}
          />

          {/* YTD card */}
          <View
            style={{
              backgroundColor: '#0064E0',
              borderRadius: 28,
              padding: 24,
              marginBottom: 16,
            }}
          >
            <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {L('Jahresbetrag (genehmigt)', 'Year-to-date (approved)')}
            </Text>
            <Text
              style={{ fontSize: 36, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5, marginTop: 6 }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              €{safeNumber(ytdTotal)}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
              {L(
                'Summe aller dieses Jahr genehmigten Spesen.',
                'Sum of all approved per-diems issued this year.',
              )}
            </Text>
          </View>

          {canApprove && (
            <>
              {/* 3 stats tiles */}
              <View className="flex-row gap-3 mb-4">
                <StatTile
                  label={L('Summe', 'Total')}
                  value={`€${safeNumber(stats.totalAmount, 0)}`}
                  color="#0064E0"
                />
                <StatTile
                  label={L('Offen', 'Pending')}
                  value={String(stats.pending)}
                  color="#D97706"
                />
                <StatTile
                  label={L('Genehmigt', 'Approved')}
                  value={String(stats.approved)}
                  color="#059669"
                />
              </View>

              {/* Export chips */}
              <View className="flex-row flex-wrap gap-2 mb-4">
                <ExportChip
                  icon={<Download size={14} color="#0064E0" />}
                  label="CSV"
                  onPress={onCsv}
                  loading={busy === 'csv'}
                  disabled={busy !== null}
                />
                <ExportChip
                  icon={<FileSpreadsheet size={14} color="#0064E0" />}
                  label="Excel"
                  onPress={onExcel}
                  loading={busy === 'xlsx'}
                  disabled={busy !== null}
                />
                <ExportChip
                  icon={<FileText size={14} color="#0064E0" />}
                  label="PDF"
                  onPress={onPdf}
                  loading={busy === 'pdf'}
                  disabled={busy !== null}
                />
              </View>

              {/* Search + employee filter */}
              <View className="flex-row gap-2 mb-4">
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    height: 44,
                  }}
                >
                  <Search size={16} color="#94A3B8" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={L('Suchen…', 'Search…')}
                    placeholderTextColor="#94A3B8"
                    style={{ flex: 1, marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#0F172A' }}
                    autoCapitalize="none"
                  />
                </View>
                <Pressable
                  onPress={() => setEmployeePickerOpen((v) => !v)}
                  style={({ pressed }: { pressed: boolean }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: employeeFilter === 'all' ? '#E5E7EB' : '#0064E0',
                    backgroundColor: employeeFilter === 'all' ? '#FFFFFF' : '#EFF6FF',
                    height: 44,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <UsersIcon size={14} color={employeeFilter === 'all' ? '#475569' : '#0064E0'} />
                  <Text
                    className="ml-1.5"
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: employeeFilter === 'all' ? '#475569' : '#0064E0',
                    }}
                  >
                    {employeeFilter === 'all' ? L('Alle', 'All') : (selectedEmployeeName ?? '—').split(' ')[0]}
                  </Text>
                </Pressable>
              </View>

              {employeePickerOpen && (
                <View className="flex-row flex-wrap gap-2 mb-4">
                  <FilterPill
                    label={L('Alle Mitarbeiter', 'All employees')}
                    active={employeeFilter === 'all'}
                    onPress={() => {
                      setEmployeeFilter('all')
                      setEmployeePickerOpen(false)
                    }}
                  />
                  {employeeOptions.map((e) => (
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
              )}

              {/* Status filter chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, marginBottom: 12 }}
              >
                {(['all', 'submitted', 'approved', 'rejected'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setFilter(s)}
                    className={`px-4 py-2 rounded-full border-2 ${
                      filter === s
                        ? 'bg-brand border-brand'
                        : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-bold ${
                        filter === s ? 'text-white' : 'text-gray-600 dark:text-slate-400'
                      }`}
                    >
                      {s === 'all'
                        ? L('Alle', 'All')
                        : s === 'submitted'
                          ? L('Eingereicht', 'Submitted')
                          : s === 'approved'
                            ? L('Genehmigt', 'Approved')
                            : L('Abgelehnt', 'Rejected')}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}

          {noMatches ? (
            <Card className="items-center py-10">
              <Wallet size={32} color="#D1D5DB" />
              <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">
                {search.trim() || employeeFilter !== 'all' || filter !== 'all'
                  ? L('Keine passenden Spesenanträge.', 'No matching per-diem claims.')
                  : L('Keine Spesenanträge.', 'No per-diem claims.')}
              </Text>
            </Card>
          ) : null}

          {paginated.map((p) => {
            const s = STATUS_STYLES[p.status] ?? STATUS_STYLES.submitted
            const startLabel = safeFormatDate(p.start_date, 'dd MMM', { locale: dateLocale })
            const endLabel =
              p.end_date && p.end_date !== p.start_date
                ? safeFormatDate(p.end_date, 'dd MMM yyyy', { locale: dateLocale })
                : safeFormatDate(p.created_at, 'yyyy')
            return (
              <Card key={p.id} className="mb-2">
                <View className="flex-row items-start">
                  <View className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand/20 items-center justify-center mr-3 shrink-0">
                    <Euro size={20} color="#0064E0" />
                  </View>
                  <View className="flex-1" style={{ minWidth: 0 }}>
                    <Text
                      className="text-[16px] font-black text-gray-900 dark:text-white"
                      numberOfLines={1}
                    >
                      €{safeNumber(p.amount)}
                    </Text>
                    <Text
                      className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5"
                      numberOfLines={1}
                    >
                      {startLabel}
                      {p.end_date && p.end_date !== p.start_date ? ` – ${endLabel}` : ` ${endLabel}`}
                      {' · '}{Number(p.num_days) || 0} {L('T.', 'd')}
                    </Text>
                    {p.country ? (
                      <Text
                        className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5"
                        numberOfLines={1}
                      >
                        {p.country}
                      </Text>
                    ) : null}
                    {canApprove && p.employee?.full_name ? (
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1" numberOfLines={1}>
                        {p.employee.full_name}
                      </Text>
                    ) : null}
                  </View>
                  <View className={`px-3 py-1 rounded-full ${s.bg}`}>
                    <Text className={`text-[10px] font-black uppercase tracking-widest ${s.text}`}>
                      {p.status === 'submitted'
                        ? L('Eingereicht', 'Submitted')
                        : p.status === 'approved'
                          ? L('Genehmigt', 'Approved')
                          : L('Abgelehnt', 'Rejected')}
                    </Text>
                  </View>
                </View>

                {canApprove && p.status === 'submitted' && (
                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => approve(p)}
                      className="flex-1 flex-row items-center justify-center bg-emerald-50 border border-emerald-200 rounded-xl py-2"
                    >
                      <Check size={16} color="#10B981" />
                      <Text className="text-emerald-700 font-bold text-[12px] ml-1">
                        {L('Genehmigen', 'Approve')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => reject(p)}
                      className="flex-1 flex-row items-center justify-center bg-red-50 border border-red-200 rounded-xl py-2"
                    >
                      <XIcon size={16} color="#DC2626" />
                      <Text className="text-red-700 font-bold text-[12px] ml-1">
                        {L('Ablehnen', 'Reject')}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            )
          })}

          {totalPages > 1 && (
            <View className="flex-row items-center justify-between mt-4 mb-2">
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={({ pressed }: { pressed: boolean }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                  opacity: page === 1 ? 0.4 : pressed ? 0.85 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                })}
              >
                <ChevronLeft size={14} color="#475569" />
                <Text className="text-[12px] font-bold text-gray-600 ml-1">
                  {L('Zurück', 'Prev')}
                </Text>
              </Pressable>
              <Text className="text-[12px] font-black text-gray-700">
                {page} / {totalPages}
              </Text>
              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={({ pressed }: { pressed: boolean }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#FFFFFF',
                  opacity: page === totalPages ? 0.4 : pressed ? 0.85 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                })}
              >
                <Text className="text-[12px] font-bold text-gray-600 mr-1">
                  {L('Weiter', 'Next')}
                </Text>
                <ChevronRight size={14} color="#475569" />
              </Pressable>
            </View>
          )}
        </ScrollView>

        {(isEmployee || canApprove) && (
          <Pressable
            onPress={() => setSheetOpen(true)}
            className="absolute bottom-24 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center shadow-xl"
          >
            <Plus size={28} color="#fff" />
          </Pressable>
        )}

        <PerDiemSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={submit} />
      </Screen>
    </View>
  )
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        padding: 12,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Text
        className="text-[9px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{ fontSize: 18, fontWeight: '900', color, letterSpacing: -0.5, marginTop: 6 }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
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
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          backgroundColor: '#FFFFFF',
          marginRight: 8,
          marginBottom: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon}
        <Text style={{ fontSize: 12, fontWeight: '900', color: '#374151', marginLeft: 6 }}>
          {loading ? '…' : label}
        </Text>
      </View>
    </Pressable>
  )
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? '#0064E0' : '#E5E7EB',
        backgroundColor: active ? '#0064E0' : '#FFFFFF',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: '700',
          color: active ? '#FFFFFF' : '#475569',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
