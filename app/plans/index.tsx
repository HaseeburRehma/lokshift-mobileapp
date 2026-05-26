/**
 * Plans list — grouped by date, tap to open detail screen.
 * Managerial users see every plan in the org; employees see only their own.
 *
 * Admin/dispatcher get an export bar at the top (CSV · Excel · PDF ·
 * Mehrere) mirroring the web Pläne & Termine page.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import {
  Calendar,
  MapPin,
  Briefcase,
  ArrowRight,
  Plus,
  Download,
  FileSpreadsheet,
  FileText,
  CalendarDays,
} from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'
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

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil((((t.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
}

export default function PlansScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, isAdmin, isDispatcher } = useUser()
  const { plans, grouped, loading, fetchPlans } = usePlans()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const router = useRouter()
  const showCreate = canCreatePlans(role)
  const showExports = isAdmin || isDispatcher

  const [busy, setBusy] = useState<'csv' | 'xlsx' | 'pdf' | null>(null)
  const stamp = format(new Date(), 'yyyy-MM-dd')

  const guardEmpty = (): boolean => {
    if (plans.length === 0) {
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
      const rows = plans.map((p) => {
        const start = new Date(p.start_time)
        const end = new Date(p.end_time)
        const hours = (end.getTime() - start.getTime()) / 3_600_000
        return [
          p.employee?.full_name ?? '',
          p.customer?.name ?? '',
          p.location ?? '',
          p.route ?? '',
          format(start, 'dd.MM.yyyy'),
          `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`,
          Number(hours.toFixed(2)),
          `KW ${isoWeek(start)}`,
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
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const onExcel = async () => {
    if (guardEmpty()) return
    setBusy('xlsx')
    try {
      await exportPlansXlsx(plans, {
        sheetName: L('Einsatzpläne', 'Plans'),
        filename: `plans_${stamp}`,
        locale,
        showEmployee: true,
      })
    } catch (err: any) {
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  const onPdf = async () => {
    if (guardEmpty()) return
    setBusy('pdf')
    try {
      await exportPlansPdf(plans, {
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
      toast.error(err?.message ?? L('Fehler beim Export.', 'Export failed.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: showCreate ? 120 : 32 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchPlans} tintColor="#0064E0" />}
        >
          <PageHeader
            showBack
            title={L('Pläne & Termine', 'Plans & Schedules')}
            subtitle={L('Schichten und Einsätze verwalten', 'Manage shifts & assignments')}
          />

          {showExports && (
            <View className="flex-row flex-wrap gap-2 mb-5">
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
              <ExportChip
                icon={<CalendarDays size={14} color="#0064E0" />}
                label={L('Mehrere', 'Bulk')}
                onPress={() => router.push('/plans/bulk' as any)}
                disabled={busy !== null}
              />
            </View>
          )}

          {grouped.length === 0 && !loading ? (
            <Card className="items-center py-10">
              <Calendar size={32} color="#D1D5DB" />
              <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">{L('Keine Pläne.', 'No plans.')}</Text>
            </Card>
          ) : null}

          {grouped.map((group) => (
            <View key={group.date} className="mb-5">
              <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
                {format(parseISO(group.date), 'EEEE, dd. MMMM yyyy', { locale: dateLocale })}
              </Text>
              {group.items.map((p) => (
                <Pressable key={p.id} onPress={() => router.push(`/plans/${p.id}` as any)}>
                  <Card className="mb-2 flex-row items-center">
                    <View className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand/20 items-center justify-center mr-3">
                      <Briefcase size={20} color="#0064E0" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                        {p.customer?.name ?? '—'}
                      </Text>
                      <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
                        {format(parseISO(p.start_time), 'HH:mm')} – {format(parseISO(p.end_time), 'HH:mm')}
                      </Text>
                      {p.location && (
                        <View className="flex-row items-center mt-1">
                          <MapPin size={11} color="#9CA3AF" />
                          <Text className="text-[11px] text-gray-400 dark:text-slate-500 ml-1">{p.location}</Text>
                        </View>
                      )}
                      {(isAdmin || isDispatcher) && p.employee?.full_name && (
                        <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{p.employee.full_name}</Text>
                      )}
                    </View>
                    <View className="items-end ml-2">
                      <StatusBadge status={p.status} />
                      <ArrowRight size={16} color="#D1D5DB" style={{ marginTop: 8 }} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>

        {showCreate && (
          <Pressable
            onPress={() => router.push('/plans/new' as any)}
            className="absolute bottom-24 right-6 w-16 h-16 rounded-full bg-brand items-center justify-center shadow-xl"
          >
            <Plus size={28} color="#fff" />
          </Pressable>
        )}
      </Screen>
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
