/**
 * Customer detail + edit. Default view mirrors the webapp's
 * CustomerDetails sheet (initials hero, status, stats grid, contact
 * details, operational notes) plus the web list's row actions
 * (Bearbeiten · Deaktivieren|Aktivieren · Datensatz entfernen).
 *
 * "Bearbeiten" (or opening with ?edit=1 from the list) swaps in the
 * shared CustomerForm, titled like the web CustomerForm dialog.
 *
 *   - activate / deactivate toggle (soft, recommended)
 *   - hard delete (Alert-guarded; fails on FK if referenced by plans/times)
 *   - usage stats (#plans + worked hours) so the admin sees whether
 *     the row is safe to delete
 */

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Alert, ScrollView, Linking } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Trash2,
  Power,
  PowerOff,
  Pencil,
  MapPin,
  User,
  Mail,
  Phone,
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { CustomerForm } from '@/components/forms/CustomerForm'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'
import type { Customer } from '@/lib/types'
import { captureError } from '@/lib/monitoring'

export default function EditCustomerScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>()
  const router = useRouter()
  const goBack = useSafeBack('/customers')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const hr = L('Std.', 'h')
  const { role } = useUser()
  const { customers, updateCustomer, toggleArchive, deleteCustomer, getStats, loading } =
    useCustomers()
  const openedInEdit = edit === '1'
  const [mode, setMode] = useState<'details' | 'edit'>(openedInEdit ? 'edit' : 'details')
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState<{ plans: number; hours: number } | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  // getStats is re-created on every render of the hook; keep it in a ref
  // so the stats effect only re-runs when the customer id changes (a
  // function dep here re-fetched in an endless render loop).
  const getStatsRef = useRef(getStats)
  getStatsRef.current = getStats

  const customer: Customer | undefined = customers.find((c) => c.id === id)
  const customerId = customer?.id

  useEffect(() => {
    if (!loading && !customer) router.replace('/customers')
  }, [loading, customer, router])

  useEffect(() => {
    if (!customerId) return
    let cancelled = false
    setLoadingStats(true)
    getStatsRef
      .current(customerId)
      .then((s) => {
        if (!cancelled) setStats(s)
      })
      .catch(() => {
        if (!cancelled) setStats(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingStats(false)
      })
    return () => {
      cancelled = true
    }
  }, [customerId])

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
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
      <Screen background="#F8FAFC" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-slate-400">{t('common.loading')}</Text>
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
          ? L('Kunde deaktiviert', 'Customer deactivated')
          : L('Kunde aktiviert', 'Customer activated'),
      )
    } catch (err: any) {
      captureError(err, { tags: { action: 'customer.archive' } })
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
      L('Datensatz entfernen', 'Remove record'),
      L(
        `${customer.name} endgültig entfernen?\n\n${usageNote}`.trim(),
        `Permanently remove ${customer.name}?\n\n${usageNote}`.trim(),
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Entfernen', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            try {
              await deleteCustomer(customer.id)
              toast.success(L('Kundenprofil entfernt', 'Customer profile removed'))
              router.replace('/customers')
            } catch (err: any) {
              captureError(err, { tags: { action: 'customer.delete' } })
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setBusy(false)
            }
          },
        },
      ],
    )
  }

  // ── Edit mode — web CustomerForm dialog ───────────────────────────
  if (mode === 'edit') {
    return (
      <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
        <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
          <PageHeader
            title={L('Kunde bearbeiten', 'Edit Customer')}
            subtitle={customer.name}
            showBack
            onBack={openedInEdit ? goBack : () => setMode('details')}
          />
        </View>

        <CustomerForm
          initial={customer}
          submitting={saving}
          submitLabel={
            saving
              ? L('Wird gespeichert…', 'Processing...')
              : L('Datensatz aktualisieren', 'Update Record')
          }
          onSubmit={async (input) => {
            if (!input.name) {
              toast.error(L('Kundenname ist erforderlich', 'Customer name is required'))
              return
            }
            setSaving(true)
            try {
              await updateCustomer(customer.id, input)
              toast.success(L('Kunde aktualisiert', 'Customer updated'))
              router.replace('/customers')
            } catch (err: any) {
              captureError(err, { tags: { action: 'customer.update' } })
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setSaving(false)
            }
          }}
        />
      </Screen>
    )
  }

  // ── Details mode — web CustomerDetails sheet ──────────────────────
  const initials = (customer.name ?? '').substring(0, 2).toUpperCase()
  const address = customer.address ?? ''

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}>
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
          style={{ marginLeft: -8, marginBottom: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>

        {/* Hero */}
        <View className="flex-row items-center justify-between">
          <View
            className="w-16 h-16 rounded-2xl bg-blue-600 items-center justify-center"
            style={{ shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 }}
          >
            <Text className="text-[24px] font-black text-white">{initials || '—'}</Text>
          </View>
          <Pressable
            onPress={() => setMode('edit')}
            hitSlop={8}
            className="w-10 h-10 rounded-xl border border-slate-200 bg-white items-center justify-center"
          >
            <Pencil size={16} color="#94A3B8" />
          </Pressable>
        </View>

        <Text className="text-[30px] font-black tracking-tight text-slate-900 mt-6" style={{ lineHeight: 34 }}>
          {customer.name ?? '—'}
        </Text>
        <View
          className={`flex-row items-center self-start px-3 py-1 rounded-lg mt-3 ${
            customer.is_active ? 'bg-emerald-50' : 'bg-red-50'
          }`}
        >
          {customer.is_active ? (
            <CheckCircle2 size={12} color="#059669" />
          ) : (
            <AlertCircle size={12} color="#EF4444" />
          )}
          <Text
            className={`text-[10px] font-black uppercase ml-2 ${
              customer.is_active ? 'text-emerald-600' : 'text-red-500'
            }`}
            style={{ letterSpacing: 1.5 }}
          >
            {customer.is_active
              ? L('Status: Aktiv', 'Status: Active Mission')
              : L('Status: Inaktiv', 'Status: Inactive')}
          </Text>
        </View>

        {/* Stats grid */}
        <View className="flex-row mt-8" style={{ gap: 12 }}>
          <Card style={{ flex: 1, borderColor: '#E2E8F0' }}>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {L('Schichten gesamt', 'Total shifts')}
            </Text>
            <Text className="text-[24px] font-black text-slate-900 mt-2">
              {loadingStats ? '...' : stats ? String(stats.plans) : '—'}
            </Text>
          </Card>
          <Card style={{ flex: 1, borderColor: '#E2E8F0' }}>
            <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {L('Stunden gesamt', 'Total hours')}
            </Text>
            <Text className="text-[24px] font-black text-emerald-600 mt-2">
              {loadingStats ? '...' : stats ? stats.hours.toFixed(1) : '—'}
              <Text className="text-[12px] text-emerald-600" style={{ opacity: 0.6 }}>
                {' '}
                {hr}
              </Text>
            </Text>
          </Card>
        </View>

        {/* Contact details */}
        <Text
          className="text-[10px] font-black uppercase text-slate-400 mt-8 mb-3"
          style={{ letterSpacing: 2 }}
        >
          {L('Kontaktdaten', 'Contact information')}
        </Text>
        <Card style={{ borderColor: '#E2E8F0', gap: 20 }}>
          <View className="flex-row items-start">
            <View className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center mr-4">
              <MapPin size={20} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {L('Einsatzadresse', 'Operational address')}
              </Text>
              <Text className="text-[14px] font-bold text-slate-900" style={{ lineHeight: 21 }}>
                {address || L('Keine Adresse hinterlegt', 'No address logged')}
              </Text>
              {address ? (
                <Pressable
                  onPress={() =>
                    Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`).catch(() => {})
                  }
                  hitSlop={8}
                  className="flex-row items-center mt-2 self-start"
                >
                  <Text className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                    {L('Auf Karte anzeigen', 'View on map')}
                  </Text>
                  <ExternalLink size={12} color="#2563EB" style={{ marginLeft: 6 }} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center mr-4">
              <User size={20} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {L('Hauptansprechpartner', 'Key contact person')}
              </Text>
              <Text className="text-[14px] font-bold text-slate-900">
                {customer.contact_person || L('Nicht angegeben', 'Not specified')}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center mr-4">
              <Mail size={20} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {L('Primäre E-Mail', 'Primary email')}
              </Text>
              <Text className="text-[14px] font-bold text-blue-600">
                {customer.email || L('Keine E-Mail hinterlegt', 'No email logged')}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center mr-4">
              <Phone size={20} color="#94A3B8" />
            </View>
            <View className="flex-1">
              <Text className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                {L('Telefon', 'Secondary contact')}
              </Text>
              <Text className="text-[14px] font-bold text-slate-900">
                {customer.phone || L('Keine Telefonnummer hinterlegt', 'No phone logged')}
              </Text>
            </View>
          </View>
        </Card>

        {/* Operational notes */}
        <View className="flex-row items-center mt-8 mb-3">
          <FileText size={16} color="#94A3B8" />
          <Text
            className="text-[10px] font-black uppercase text-slate-400 ml-2"
            style={{ letterSpacing: 2 }}
          >
            {L('Betriebliche Notizen', 'Operational notes')}
          </Text>
        </View>
        <Card style={{ borderColor: '#E2E8F0' }}>
          <Text className="text-[12px] font-semibold text-slate-500 italic" style={{ lineHeight: 19 }}>
            {customer.notes ||
              L(
                'Keine einsatzspezifischen Notizen für diesen Kunden hinterlegt.',
                'No mission-specific notes recorded for this customer account.',
              )}
          </Text>
        </Card>

        {/* Actions — same as the web list's context menu */}
        <View className="mt-8" style={{ gap: 10 }}>
          <Button
            label={L('Bearbeiten', 'Edit')}
            leftIcon={<Pencil size={18} color="#fff" />}
            onPress={() => setMode('edit')}
            disabled={busy}
          />
          <Pressable
            onPress={onArchive}
            disabled={busy}
            className={`flex-row items-center justify-center h-12 rounded-2xl border bg-white ${
              customer.is_active ? 'border-amber-200' : 'border-emerald-200'
            } ${busy ? 'opacity-50' : ''}`}
          >
            {customer.is_active ? (
              <PowerOff size={18} color="#D97706" />
            ) : (
              <Power size={18} color="#059669" />
            )}
            <Text
              className={`text-[15px] font-bold ml-2 ${
                customer.is_active ? 'text-amber-600' : 'text-emerald-600'
              }`}
            >
              {customer.is_active ? L('Deaktivieren', 'Deactivate') : L('Aktivieren', 'Activate')}
            </Text>
          </Pressable>
          <Pressable
            onPress={onDelete}
            disabled={busy}
            className={`flex-row items-center justify-center h-12 rounded-2xl border border-red-100 bg-red-50 ${
              busy ? 'opacity-50' : ''
            }`}
          >
            <Trash2 size={18} color="#EF4444" />
            <Text className="text-[15px] font-bold text-red-500 ml-2">
              {L('Datensatz entfernen', 'Remove Record')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  )
}
