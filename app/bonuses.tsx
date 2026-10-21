/**
 * Sonderzahlungen (Kundenfeedback Punkt 6, formerly "Urlaubsgeld") —
 * phone replica of the webapp's app/dashboard/holiday-bonus/page.tsx.
 *
 * Employee view: blue "Summe {Jahr}" hero + own payments (read-only).
 *
 * Admin / dispatch: header + Excel / PDF (+ CSV) + "Sonderzahlung anlegen",
 * stat tiles (Summe · Anzahl Zahlungen · Empfänger), search + employee
 * filter, one card per table row (Mitarbeiter, Bezeichnung, Art,
 * Abrechnung, Betrag, Bemerkung, edit / delete with inline confirm),
 * pagination and the create / edit sheet.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Plus,
  Gift,
  Search,
  Download,
  FileText,
  Trash2,
  Pencil,
  Users as UsersIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react-native'
import { format } from 'date-fns'

import { Screen } from '@/components/Screen'
import { safeFormatDate, safeNumber } from '@/lib/safe-format'
import { formatEuro } from '@/lib/time/format'
import { paymentPeriodLabel } from '@/lib/special-payments'
import type { HolidayBonus } from '@/lib/types'
import { captureError } from '@/lib/monitoring'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/Button'
import { HolidayBonusSheet, bonusTypeLabel } from '@/components/HolidayBonusSheet'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useHolidayBonus } from '@/hooks/useHolidayBonus'
import { canApproveTimes } from '@/lib/rbac/permissions'
import { exportHolidayBonusPdf } from '@/lib/pdf/reports'
import { exportHolidayBonusXlsx } from '@/lib/excel/reports'
import { exportCsv } from '@/lib/csv/exportCsv'

const ITEMS_PER_PAGE = 10

export default function HolidayBonusScreen() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const canGrant = canApproveTimes(role)

  const { items, loading, fetchItems, createPayment, updatePayment, deletePayment, ytdTotal } = useHolidayBonus()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<HolidayBonus | null>(null)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  const stamp = format(new Date(), 'yyyy-MM-dd')
  const year = new Date().getFullYear()

  const localize = (key: string) => bonusTypeLabel(key as any, locale)

  // Employee options for the filter
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of items) {
      if (b.employee_id && b.employee?.full_name) map.set(b.employee_id, b.employee.full_name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((b) => {
      if (employeeFilter !== 'all' && b.employee_id !== employeeFilter) return false
      if (!q) return true
      return [b.employee?.full_name, b.title, b.notes, localize(b.bonus_type), String(b.amount)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, employeeFilter, search, locale])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = useMemo(
    () => filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [filtered, page],
  )

  useEffect(() => {
    setPage(1)
  }, [search, employeeFilter])

  // Snap page back into range when the underlying list shrinks (e.g.
  // another admin deletes a row, or the filter narrows the set).
  useEffect(() => {
    if (page > totalPages) setPage(Math.max(1, totalPages))
  }, [page, totalPages])

  const recipients = useMemo(() => new Set(items.map((b) => b.employee_id)).size, [items])

  const exportError = (err: any) => {
    captureError(err, {
      tags: { area: 'bonuses.export' },
      extra: { rowCount: filtered.length, employeeFilter, search },
      message: 'Special payment export failed',
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
          ? ['Mitarbeiter', 'Art', 'Bezeichnung', 'Betrag €', 'Abrechnung', 'Bemerkung', 'Angelegt am']
          : ['Employee', 'Type', 'Title', 'Amount €', 'Billing', 'Note', 'Created']
      const rows = filtered.map((b) => [
        b.employee?.full_name ?? b.employee_id,
        localize(b.bonus_type),
        (b.title ?? '').replace(/[,;]/g, ' '),
        safeNumber(b.amount),
        paymentPeriodLabel(b, locale).replace(/[,;]/g, ' '),
        (b.notes ?? '').replace(/[,;]/g, ' '),
        safeFormatDate(b.created_at, 'dd.MM.yyyy'),
      ])
      await exportCsv({ headers, rows, filename: `sonderzahlungen_${stamp}`, dialogTitle: L('Sonderzahlungen', 'Special payments') })
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
      await exportHolidayBonusXlsx(filtered, {
        sheetName: L('Sonderzahlungen', 'Special payments'),
        filename: `sonderzahlungen_${stamp}`,
        locale,
        bonusTypeLabel: localize,
      })
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
      await exportHolidayBonusPdf(filtered, {
        title: L('Sonderzahlungen', 'Special payments'),
        subtitle: L(`Stand ${format(new Date(), 'dd.MM.yyyy')}`, `As of ${format(new Date(), 'yyyy-MM-dd')}`),
        filename: `sonderzahlungen_${stamp}`,
        locale,
        bonusTypeLabel: localize,
      })
    } catch (err: any) {
      exportError(err)
    } finally {
      setBusy(null)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setSheetOpen(true)
  }
  const openEdit = (b: HolidayBonus) => {
    setConfirmDelete(null)
    setEditing(b)
    setSheetOpen(true)
  }

  const selectedEmployeeName =
    employeeFilter === 'all'
      ? L('Alle Mitarbeiter', 'All employees')
      : (employeeOptions.find((e) => e.id === employeeFilter)?.name ?? '—')

  const emptyCard = (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        paddingVertical: 44,
        alignItems: 'center',
      }}
    >
      <Gift size={24} color="#D1D5DB" />
      <Text style={{ fontSize: 14, color: '#9CA3AF', marginTop: 8, textAlign: 'center' }}>
        {search.trim() || employeeFilter !== 'all'
          ? L('Keine passenden Sonderzahlungen.', 'No matching special payments.')
          : L('Keine Sonderzahlungen vorhanden.', 'No special payments yet.')}
      </Text>
    </View>
  )

  const renderRow = (b: HolidayBonus, showEmployee: boolean) => {
    const confirming = confirmDelete === b.id
    const body = (
      <View
        style={{
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E5E7EB',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
            {showEmployee ? (
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 2 }}>
                {b.employee?.full_name ?? '—'}
              </Text>
            ) : null}
            <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: '600', color: showEmployee ? '#374151' : '#111827' }}>
              {b.title || localize(b.bonus_type)}
            </Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#059669', fontVariant: ['tabular-nums'] }}>
            {formatEuro(b.amount, locale)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', marginTop: 12 }}>
          <View style={{ width: '40%', paddingRight: 8 }}>
            <Text style={labelStyle}>{L('Art', 'Type')}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{localize(b.bonus_type)}</Text>
          </View>
          <View style={{ width: '60%' }}>
            <Text style={labelStyle}>{L('Abrechnung', 'Billing')}</Text>
            <Text numberOfLines={2} style={{ fontSize: 13, color: '#4B5563', marginTop: 2 }}>{paymentPeriodLabel(b, locale)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={labelStyle}>{L('Bemerkung', 'Note')}</Text>
          <Text numberOfLines={2} style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{b.notes || '—'}</Text>
        </View>

        {canGrant ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginTop: 12,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: '#F9FAFB',
              gap: 8,
            }}
          >
            {confirming ? (
              <>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B7280' }}>{L('Löschen?', 'Delete?')}</Text>
                <Pressable
                  onPress={() => {
                    setConfirmDelete(null)
                    void deletePayment(b.id)
                  }}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#EF4444' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>{L('Ja', 'Yes')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmDelete(null)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#4B5563' }}>{L('Nein', 'No')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => openEdit(b)}
                  accessibilityLabel={L('Bearbeiten', 'Edit')}
                  hitSlop={6}
                  style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Pencil size={15} color="#2563EB" />
                </Pressable>
                <Pressable
                  onPress={() => setConfirmDelete(b.id)}
                  accessibilityLabel={L('Löschen', 'Delete')}
                  hitSlop={6}
                  style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={15} color="#EF4444" />
                </Pressable>
              </>
            )}
          </View>
        ) : null}
      </View>
    )
    return <View key={b.id}>{body}</View>
  }

  // ─── Employee view ─────────────────────────────────────────
  if (!canGrant) {
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
              title={L('Sonderzahlungen', 'Special payments')}
              subtitle={L('Ihre zusätzlichen Zahlungen und Vereinbarungen', 'Your additional payments and agreements')}
            />

            <View style={{ backgroundColor: '#0064E0', borderRadius: 16, paddingVertical: 28, paddingHorizontal: 20, alignItems: 'center', marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                {L(`Summe ${year}`, `Total ${year}`)}
              </Text>
              <Text
                style={{ fontSize: 44, fontWeight: '700', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatEuro(ytdTotal, locale)}
              </Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 10, textAlign: 'center' }}>
                {L('Die Zahlungen erscheinen auch in Ihrem ', 'Payments also appear in your ')}
                <Text onPress={() => router.push('/reports/monthly')} style={{ fontWeight: '700', textDecorationLine: 'underline', color: 'rgba(255,255,255,0.85)' }}>
                  {L('Monatsnachweis', 'monthly statement')}
                </Text>
                {'.'}
              </Text>
            </View>

            {loading && items.length === 0 ? (
              <ActivityIndicator size="small" color="#D1D5DB" style={{ marginTop: 12 }} />
            ) : items.length === 0 ? (
              emptyCard
            ) : (
              <View style={{ gap: 10 }}>{items.map((b) => renderRow(b, false))}</View>
            )}
          </ScrollView>
        </Screen>
      </View>
    )
  }

  // ─── Admin / Dispatcher view ───────────────────────────────
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
            title={L('Sonderzahlungen', 'Special payments')}
            subtitle={L(
              'Urlaubsgeld, Prämien und weitere Zahlungen – erscheinen automatisch im Monatsnachweis',
              'Holiday pay, bonuses and other payments – shown automatically in the monthly statement',
            )}
          />

          {/* Header actions — web: Excel · PDF (outline) + "Sonderzahlung anlegen" */}
          <View style={{ marginTop: -8, marginBottom: 24, gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <OutlineButton label="Excel" onPress={onExcel} loading={busy === 'xlsx'} disabled={busy !== null} icon={<Download size={14} color="#4B5563" />} />
              <OutlineButton label="PDF" onPress={onPdf} loading={busy === 'pdf'} disabled={busy !== null} icon={<Download size={14} color="#4B5563" />} />
              <OutlineButton label="CSV" onPress={onCsv} loading={busy === 'csv'} disabled={busy !== null} icon={<FileText size={14} color="#4B5563" />} />
            </View>
            <Button
              label={L('Sonderzahlung anlegen', 'Add special payment')}
              onPress={openCreate}
              leftIcon={<Plus size={18} color="#fff" />}
            />
          </View>

          {/* Stat tiles */}
          <View style={{ gap: 12, marginBottom: 24 }}>
            <View style={{ backgroundColor: '#0064E0', borderRadius: 16, padding: 20 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                {L(`Summe ${year}`, `Total ${year}`)}
              </Text>
              <Text
                style={{ fontSize: 30, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatEuro(ytdTotal, locale)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile label={L('Anzahl Zahlungen', 'Number of payments')} value={String(items.length)} />
              <StatTile label={L('Empfänger', 'Recipients')} value={String(recipients)} />
            </View>
          </View>

          {/* Search + employee filter */}
          <View style={{ gap: 10, marginBottom: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E7EB',
                borderRadius: 12,
                paddingHorizontal: 12,
                height: 42,
              }}
            >
              <Search size={16} color="#9CA3AF" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={L('Suche nach Name, Bezeichnung, Bemerkung …', 'Search name, title, note …')}
                placeholderTextColor="#9CA3AF"
                style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#111827' }}
                autoCapitalize="none"
              />
            </View>
            <Pressable onPress={() => setEmployeePickerOpen((v) => !v)}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: employeeFilter === 'all' ? '#E5E7EB' : '#0064E0',
                  backgroundColor: employeeFilter === 'all' ? '#FFFFFF' : '#EFF6FF',
                  height: 42,
                }}
              >
                <UsersIcon size={16} color={employeeFilter === 'all' ? '#9CA3AF' : '#0064E0'} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '600', color: employeeFilter === 'all' ? '#374151' : '#0064E0' }}
                >
                  {selectedEmployeeName}
                </Text>
                <ChevronDown size={16} color="#9CA3AF" />
              </View>
            </Pressable>
            {employeePickerOpen ? (
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
          </View>

          {loading && items.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#D1D5DB" />
            </View>
          ) : filtered.length === 0 ? (
            emptyCard
          ) : (
            <>
              <View style={{ gap: 10 }}>{paginated.map((b) => renderRow(b, true))}</View>
              {totalPages > 1 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                  <PageArrow dir="prev" disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280' }}>{`${page} / ${totalPages}`}</Text>
                  <PageArrow dir="next" disabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))} />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        <HolidayBonusSheet
          open={sheetOpen}
          initial={editing}
          onClose={() => {
            setSheetOpen(false)
            setEditing(null)
          }}
          onSubmit={(data) => (editing ? updatePayment(editing.id, data) : createPayment(data))}
        />
      </Screen>
    </View>
  )
}

const labelStyle = {
  fontSize: 10,
  fontWeight: '600' as const,
  color: '#9CA3AF',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 18, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 12, fontWeight: '500', color: '#9CA3AF', marginBottom: 4 }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
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
          height: 36,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#E5E7EB',
          backgroundColor: '#FFFFFF',
          opacity: disabled && !loading ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color="#4B5563" /> : icon}
        <Text style={{ fontSize: 12, fontWeight: '500', color: '#374151', marginLeft: 6 }}>{label}</Text>
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
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {dir === 'prev' ? <ChevronLeft size={16} color="#4B5563" /> : <ChevronRight size={16} color="#4B5563" />}
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
          borderColor: active ? '#0064E0' : '#E5E7EB',
          backgroundColor: active ? '#0064E0' : '#FFFFFF',
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFFFFF' : '#475569' }}>{label}</Text>
      </View>
    </Pressable>
  )
}
