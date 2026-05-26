/**
 * Edit an existing customer. Hosts the same CustomerForm as /new. Adds:
 *   - archive / unarchive toggle (soft, recommended)
 *   - hard delete (Alert-guarded; fails on FK if referenced by plans/times)
 *   - usage stats card (#plans + worked hours) so the admin sees
 *     whether the row is safe to delete
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Trash2, Archive, ArchiveRestore } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'
import type { Customer } from '@/lib/types'

export default function EditCustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/customers')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { customers, updateCustomer, toggleArchive, deleteCustomer, getStats, loading } =
    useCustomers()
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<{ plans: number; hours: number } | null>(null)

  const customer: Customer | undefined = customers.find((c) => c.id === id)

  useEffect(() => {
    if (!loading && !customer) router.replace('/customers')
  }, [loading, customer, router])

  useEffect(() => {
    if (!customer) return
    getStats(customer.id).then(setStats).catch(() => setStats(null))
  }, [customer, getStats])

  if (!canCreatePlans(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Admins oder Disponenten können Kunden bearbeiten.',
            'Only admins or dispatchers can edit customers.',
          )}
        </Text>
      </Screen>
    )
  }

  if (!customer) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const onArchive = async () => {
    setBusy(true)
    try {
      await toggleArchive(customer.id, customer.is_active)
      toast.success(
        customer.is_active
          ? L('Kunde archiviert', 'Customer archived')
          : L('Kunde reaktiviert', 'Customer reactivated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = () => {
    const usageNote =
      stats && (stats.plans > 0 || stats.hours > 0)
        ? L(
            `Achtung: ${stats.plans} Pläne und ${stats.hours.toFixed(
              1,
            )} h sind diesem Kunden zugeordnet. Löschen kann fehlschlagen.`,
            `Note: ${stats.plans} plans and ${stats.hours.toFixed(
              1,
            )} h reference this customer. Delete may fail.`,
          )
        : ''
    Alert.alert(
      L('Kunde löschen', 'Delete customer'),
      L(
        `Wirklich „${customer.name}" endgültig löschen?\n\n${usageNote}`.trim(),
        `Really delete "${customer.name}" permanently?\n\n${usageNote}`.trim(),
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteCustomer(customer.id)
              toast.success(L('Kunde gelöscht', 'Customer deleted'))
              router.replace('/customers')
            } catch (err: any) {
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={onArchive} className="p-2" disabled={busy}>
            {customer.is_active ? (
              <Archive size={22} color={busy ? '#9CA3AF' : '#0064E0'} />
            ) : (
              <ArchiveRestore size={22} color={busy ? '#9CA3AF' : '#10B981'} />
            )}
          </Pressable>
          <Pressable onPress={onDelete} className="p-2 -mr-2" disabled={busy}>
            <Trash2 size={22} color={busy ? '#9CA3AF' : '#DC2626'} />
          </Pressable>
        </View>
      </View>

      <View className="px-5 pb-2">
        <Text className="text-[17px] font-black text-gray-900 dark:text-white">
          {L('Kunde bearbeiten', 'Edit customer')}
        </Text>
      </View>

      <View className="px-5">
        {stats && (
          <Card className="mb-3">
            <View className="flex-row justify-between">
              <View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Einsätze', 'Plans')}
                </Text>
                <Text className="text-[20px] font-black text-gray-900 dark:text-white mt-1">{stats.plans}</Text>
              </View>
              <View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Stunden', 'Hours')}
                </Text>
                <Text className="text-[20px] font-black text-gray-900 dark:text-white mt-1">
                  {stats.hours.toFixed(1)}
                </Text>
              </View>
              <View>
                <Text className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500">
                  {L('Status', 'Status')}
                </Text>
                <Text
                  className="text-[14px] font-black mt-2"
                  style={{ color: customer.is_active ? '#10B981' : '#9CA3AF' }}
                >
                  {customer.is_active ? L('Aktiv', 'Active') : L('Archiviert', 'Archived')}
                </Text>
              </View>
            </View>
          </Card>
        )}
      </View>

      <CustomerForm
        initial={customer}
        submitting={saving}
        submitLabel={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
        onSubmit={async (input) => {
          if (!input.name) {
            toast.error(L('Firmenname ist erforderlich.', 'Company name is required.'))
            return
          }
          setSaving(true)
          try {
            await updateCustomer(customer.id, input)
            toast.success(L('Kunde gespeichert', 'Customer saved'))
            router.replace('/customers')
          } catch (err: any) {
            toast.error(err?.message ?? t('common.error'))
          } finally {
            setSaving(false)
          }
        }}
      />
    </Screen>
  )
}
