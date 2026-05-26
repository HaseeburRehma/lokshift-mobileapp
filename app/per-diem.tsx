/**
 * Per Diem tab.
 * Employee view: list of own claims with status badges + floating "submit"
 *   button to open the PerDiemSheet.
 * Manager view: list of every claim in the org with status filter chips
 *   and approve/reject actions on submitted rows.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl } from 'react-native'
import { Plus, Check, X as XIcon, Euro, Wallet } from 'lucide-react-native'
import { format, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { PerDiemSheet } from '@/components/PerDiemSheet'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { usePerDiem } from '@/hooks/usePerDiem'
import { canApproveTimes } from '@/lib/rbac/permissions'
import type { PerDiem, PerDiemStatus } from '@/lib/types'

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

  const approve = async (p: PerDiem) => {
    try { await updateStatus(p, 'approved'); toast.success(L('Genehmigt', 'Approved')) }
    catch (err: any) { toast.error(err?.message ?? t('common.error')) }
  }
  const reject = async (p: PerDiem) => {
    try { await updateStatus(p, 'rejected'); toast.success(L('Abgelehnt', 'Rejected')) }
    catch (err: any) { toast.error(err?.message ?? t('common.error')) }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchItems} tintColor="#0064E0" />}
      >
        <PageHeader
          showBack
          title={L('Spesen', 'Per Diem')}
          subtitle={L('Verpflegungsmehraufwand', 'Travel allowance')}
        />

        {/* YTD card */}
        <Card className="mb-4" style={{ backgroundColor: '#0064E0' } as any}>
          <Text className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">
            {L('Jahresbetrag (genehmigt)', 'Year-to-date (approved)')}
          </Text>
          <Text className="text-[32px] font-black text-white">€{ytdTotal.toFixed(2)}</Text>
        </Card>

        {/* Manager filter chips */}
        {canApprove && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
            {(['all', 'submitted', 'approved', 'rejected'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setFilter(s)}
                className={`px-4 py-2 rounded-full border-2 ${filter === s ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
              >
                <Text className={`text-[12px] font-bold ${filter === s ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
                  {s === 'all' ? L('Alle', 'All')
                   : s === 'submitted' ? L('Eingereicht', 'Submitted')
                   : s === 'approved' ? L('Genehmigt', 'Approved')
                   : L('Abgelehnt', 'Rejected')}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {items.length === 0 && !loading ? (
          <Card className="items-center py-10">
            <Wallet size={32} color="#D1D5DB" />
            <Text className="text-[14px] text-gray-400 dark:text-slate-500 mt-3">
              {L('Keine Spesenanträge.', 'No per-diem claims.')}
            </Text>
          </Card>
        ) : null}

        {items.map((p) => {
          const s = STATUS_STYLES[p.status]
          return (
            <Card key={p.id} className="mb-2">
              <View className="flex-row items-start">
                <View className="w-12 h-12 rounded-2xl bg-brand/10 dark:bg-brand/20 items-center justify-center mr-3">
                  <Euro size={20} color="#0064E0" />
                </View>
                <View className="flex-1">
                  <Text className="text-[16px] font-black text-gray-900 dark:text-white">
                    €{Number(p.amount).toFixed(2)}
                  </Text>
                  <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-0.5">
                    {p.start_date ? format(parseISO(p.start_date), 'dd MMM', { locale: dateLocale }) : '—'}
                    {p.end_date && p.end_date !== p.start_date
                      ? ` – ${format(parseISO(p.end_date), 'dd MMM yyyy', { locale: dateLocale })}`
                      : ` ${format(parseISO(p.created_at), 'yyyy')}`}
                    {' · '}{p.num_days} {L('T.', 'd')}
                  </Text>
                  {p.country && (
                    <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">{p.country}</Text>
                  )}
                  {canApprove && p.employee?.full_name && (
                    <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">{p.employee.full_name}</Text>
                  )}
                </View>
                <View className={`px-3 py-1 rounded-full ${s.bg}`}>
                  <Text className={`text-[10px] font-black uppercase tracking-widest ${s.text}`}>
                    {p.status === 'submitted' ? L('Eingereicht', 'Submitted')
                     : p.status === 'approved' ? L('Genehmigt', 'Approved')
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
