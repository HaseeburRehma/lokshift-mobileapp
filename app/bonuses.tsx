/**
 * Holiday Bonus screen — mirrors web /dashboard/holiday-bonus.
 *
 * Employee view: read-only YTD total + history list.
 *
 * Managerial view: hero card + 2 stats tiles + search + employee filter
 * + CSV/Excel/PDF exports + paginated list with inline delete + grant
 * sheet behind a FAB.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native'
import {
  Plus,
  Gift,
  Search,
  Download,
  FileSpreadsheet,
  FileText,
  Trash2,
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
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const canGrant = canApproveTimes(role)
  const dateLocale = locale === 'de' ? deLocale : enUS

  const { items, loading, fetchItems, grantBonus, deleteBonus, ytdTotal } = useHolidayBonus()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)

  const stamp = format(new Date(), 'yyyy-MM-dd')

  const localize = (key: string) => bonusTypeLabel(key as any, locale)

  // Employee options for the filter
  const employeeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const b of items) {
      if (b.employee_id && b.employee?.full_name) {
        map.set(b.employee_id, b.employee.full_name)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((b) => {
      if (employeeFilter !== 'all' && b.employee_id !== employeeFilter) return false
      if (!q) return true
      const name = b.employee?.full_name?.toLowerCase() ?? ''
      const notes = b.notes?.toLowerCase() ?? ''
      return name.includes(q) || notes.includes(q) || String(b.amount).includes(q)
    })
  }, [items, employeeFilter, search])

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

  const filteredTotal = useMemo(
    () => filtered.reduce((s, b) => s + (Number(b.amount) || 0), 0),
    [filtered],
  )

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
          ? ['Mitarbeiter', 'Art', 'Betrag €', 'Notizen', 'Auszahlungsdatum']
          : ['Employee', 'Type', 'Amount €', 'Notes', 'Date Paid']
      const rows = filtered.map((b) => [
        b.employee?.full_name ?? b.employee_id,
        localize(b.bonus_type),
        safeNumber(b.amount),
        (b.notes ?? '').replace(/[,;]/g, ' '),
        safeFormatDate(b.created_at, 'dd.MM.yyyy'),
      ])
      await exportCsv({
        headers,
        rows,
        filename: `urlaubsgeld_${stamp}`,
        dialogTitle: L('Urlaubsgeld', 'Holiday Bonus'),
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'bonuses.export' },
        extra: { rowCount: filtered.length, employeeFilter, search },
        message: 'Holiday bonus export failed',
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
      await exportHolidayBonusXlsx(filtered, {
        sheetName: L('Urlaubsgeld', 'Holiday Bonus'),
        filename: `urlaubsgeld_${stamp}`,
        locale,
        bonusTypeLabel: localize,
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'bonuses.export' },
        extra: { rowCount: filtered.length, employeeFilter, search },
        message: 'Holiday bonus export failed',
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
      await exportHolidayBonusPdf(filtered, {
        title: L('Urlaubsgeld-Bericht', 'Holiday Bonus Report'),
        subtitle: L(
          `Stand ${format(new Date(), 'dd.MM.yyyy')}`,
          `As of ${format(new Date(), 'yyyy-MM-dd')}`,
        ),
        filename: `urlaubsgeld_${stamp}`,
        locale,
        bonusTypeLabel: localize,
      })
    } catch (err: any) {
      captureError(err, {
        tags: { area: 'bonuses.export' },
        extra: { rowCount: filtered.length, employeeFilter, search },
        message: 'Holiday bonus export failed',
      })
      toast.error(err?.message ?? L('Export fehlgeschlagen.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const confirmDelete = (id: string, amount: number, employeeName?: string) => {
    const amt = safeNumber(amount)
    Alert.alert(
      L('Bonus löschen?', 'Delete bonus?'),
      L(
        `€${amt}${employeeName ? ` · ${employeeName}` : ''} — kann nicht rückgängig gemacht werden.`,
        `€${amt}${employeeName ? ` · ${employeeName}` : ''} — this cannot be undone.`,
      ),
      [
        { text: L('Abbrechen', 'Cancel'), style: 'cancel' },
        {
          text: L('Löschen', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBonus(id)
              toast.success(L('Bonus gelöscht', 'Bonus deleted'))
            } catch (err: any) {
              captureError(err, {
                tags: { area: 'bonuses.delete' },
                extra: { bonusId: id },
                message: 'Holiday bonus delete failed',
              })
              toast.error(err?.message ?? L('Löschen fehlgeschlagen', 'Delete failed'))
            }
          },
        },
      ],
    )
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
            title={L('Urlaubsgeld', 'Holiday Bonus')}
            subtitle={L('Urlaubsgeld & Sonderzahlungen', 'Holiday & special payments')}
          />

          <View
            style={{
              backgroundColor: '#0064E0',
              borderRadius: 28,
              padding: 24,
              marginBottom: 16,
            }}
          >
            <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>
              {L('Jahresbetrag', 'Year-to-date')} {new Date().getFullYear()}
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
                'Summe aller dieses Jahr ausgezahlten Bonuszahlungen.',
                'Sum of all bonus payments issued this year.',
              )}
            </Text>
          </View>

          {canGrant && (
            <>
              <View className="flex-row gap-3 mb-4">
                <StatTile
                  label={L('Im Filter', 'In filter')}
                  value={`€${safeNumber(filteredTotal)}`}
                  color="#0064E0"
                />
                <StatTile
                  label={L('Einträge', 'Entries')}
                  value={String(filtered.length)}
                  color="#0F172A"
                />
              </View>

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
            </>
          )}

          {noMatches ? (
            <Card className="items-center py-10">
              <Gift size={32} color="#D1D5DB" />
              <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">
                {search.trim() || employeeFilter !== 'all'
                  ? L('Keine passenden Bonuszahlungen.', 'No matching bonus payments.')
                  : L('Keine Bonuszahlungen.', 'No bonus payments yet.')}
              </Text>
            </Card>
          ) : null}

          {paginated.map((b) => (
            <Card key={b.id} className="mb-2 flex-row items-center">
              <View className="w-12 h-12 rounded-2xl bg-emerald-50 items-center justify-center mr-3 shrink-0">
                <Gift size={20} color="#10B981" />
              </View>
              <View className="flex-1" style={{ minWidth: 0 }}>
                <Text
                  className="text-[16px] font-black text-gray-900 dark:text-white"
                  numberOfLines={1}
                >
                  €{safeNumber(b.amount)}
                </Text>
                <Text
                  className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5"
                  numberOfLines={1}
                >
                  {localize(b.bonus_type)}
                  {' · '}
                  {safeFormatDate(b.created_at, 'dd MMM yyyy', { locale: dateLocale })}
                </Text>
                {b.notes ? (
                  <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5" numberOfLines={2}>
                    {b.notes}
                  </Text>
                ) : null}
                {canGrant && b.employee?.full_name ? (
                  <Text
                    className="text-[11px] text-gray-500 dark:text-slate-400 mt-1"
                    numberOfLines={1}
                  >
                    {b.employee.full_name}
                  </Text>
                ) : null}
              </View>
              {canGrant && (
                <Pressable
                  onPress={() =>
                    confirmDelete(b.id, Number(b.amount) || 0, b.employee?.full_name ?? undefined)
                  }
                  style={({ pressed }: { pressed: boolean }) => ({
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    backgroundColor: '#FEE2E2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: pressed ? 0.7 : 1,
                    marginLeft: 8,
                  })}
                  accessibilityLabel={L('Löschen', 'Delete')}
                >
                  <Trash2 size={16} color="#DC2626" />
                </Pressable>
              )}
            </Card>
          ))}

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

        {canGrant && (
          <Pressable
            onPress={() => setSheetOpen(true)}
            className="absolute bottom-24 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center shadow-xl"
          >
            <Plus size={28} color="#fff" />
          </Pressable>
        )}

        <HolidayBonusSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSubmit={grantBonus} />
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
        padding: 14,
        backgroundColor: '#FFFFFF',
      }}
    >
      <Text
        className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500"
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{ fontSize: 22, fontWeight: '900', color, letterSpacing: -0.5, marginTop: 6 }}
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
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {icon}
      <Text className="text-[12px] font-black text-gray-700 dark:text-white ml-1.5">
        {loading ? '…' : label}
      </Text>
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
