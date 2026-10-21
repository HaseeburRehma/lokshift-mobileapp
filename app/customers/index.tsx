/**
 * Customers list (Kundenverwaltung) — admin/dispatcher only. Mirrors the
 * webapp's /dashboard/customers: eyebrow + title, "Kunde anlegen",
 * search + Alle/Aktiv/Inaktiv filter, and one card per customer with
 * status chip, address / contact / email rows and the web's row actions
 * (Bearbeiten · Deaktivieren|Aktivieren · Datensatz entfernen).
 * Tapping a card opens the detail view.
 */

import React, { useState, useMemo, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  ChevronRight,
  Users,
  User,
  Plus,
  Mail,
  MapPin,
  Search,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useCustomers } from '@/hooks/useCustomers'
import { useSafeBack } from '@/lib/use-safe-back'
import { captureError } from '@/lib/monitoring'
import type { Customer } from '@/lib/types'

type FilterStatus = 'all' | 'active' | 'inactive'

export default function CustomersScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { customers, loading, fetchCustomers, toggleArchive, deleteCustomer } = useCustomers()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchCustomers()
    } finally {
      setRefreshing(false)
    }
  }, [fetchCustomers])

  const sorted = useMemo(() => {
    return [...customers].sort((a, b) => {
      // Active first, then alphabetical.
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [customers])

  // Same matching as the web: name, contact person or email.
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return sorted.filter((c) => {
      const matchesSearch =
        !q ||
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.contact_person ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      if (filterStatus === 'active') return matchesSearch && c.is_active
      if (filterStatus === 'inactive') return matchesSearch && !c.is_active
      return matchesSearch
    })
  }, [sorted, searchTerm, filterStatus])

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Kunden verwalten.',
            'Only admins or dispatchers can manage customers.',
          )}
        </Text>
      </Screen>
    )
  }

  const onToggle = async (c: Customer) => {
    setBusyId(c.id)
    try {
      await toggleArchive(c.id, c.is_active)
      toast.success(
        c.is_active
          ? L('Kunde deaktiviert', 'Customer deactivated')
          : L('Kunde aktiviert', 'Customer activated'),
      )
    } catch (err: any) {
      captureError(err, { tags: { action: 'customer.archive' } })
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = (c: Customer) => {
    Alert.alert(
      L('Datensatz entfernen', 'Remove record'),
      L(`${c.name} endgültig entfernen?`, `Permanently remove ${c.name}?`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Entfernen', 'Remove'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(c.id)
            try {
              await deleteCustomer(c.id)
              toast.success(L('Kundenprofil entfernt', 'Customer profile removed'))
            } catch (err: any) {
              captureError(err, { tags: { action: 'customer.delete' } })
              toast.error(err?.message ?? t('common.error'))
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: L('Alle', 'All') },
    { key: 'active', label: L('Aktiv', 'Active') },
    { key: 'inactive', label: L('Inaktiv', 'Inactive') },
  ]

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        {/* Back + eyebrow sit above the H1 like the web header console. */}
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 24 }}
          style={{ marginLeft: -8, marginBottom: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text
          className="text-[10px] font-black uppercase text-blue-600 mb-1.5"
          style={{ letterSpacing: 2 }}
        >
          {L('Betriebs-CRM', 'Operational CRM')}
        </Text>
        <PageHeader
          title={L('Kundenverwaltung', 'Customer Management')}
          subtitle={L('Einsatzorte und Kundenkontakte verwalten', 'Organize project sites & client contacts')}
        />

        <Button
          label={L('Kunde anlegen', 'Register Account')}
          leftIcon={<Plus size={18} color="#fff" />}
          onPress={() => router.push('/customers/new')}
          style={{ marginBottom: 16 }}
        />

        {/* Filters HUD */}
        <Card style={{ borderColor: '#E2E8F0', padding: 16, marginBottom: 16 }}>
          <View className="flex-row items-center h-12 rounded-xl border border-slate-100 bg-slate-50 px-4">
            <Search size={16} color="#94A3B8" />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={L('Kunden suchen...', 'Search by name, contact or email...')}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700', color: '#334155' }}
            />
          </View>
          <View className="flex-row p-1 bg-slate-100 rounded-xl mt-3">
            {FILTERS.map((f) => {
              const active = filterStatus === f.key
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilterStatus(f.key)}
                  className={`flex-1 items-center py-2 rounded-lg ${active ? 'bg-white' : ''}`}
                  style={
                    active
                      ? { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
                      : undefined
                  }
                >
                  <Text
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: active ? '#0064E0' : '#64748B' }}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </Card>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#0064E0" />
          </View>
        ) : filtered.length === 0 ? (
          <View className="items-center justify-center py-16">
            <View className="w-20 h-20 rounded-full bg-slate-50 border border-dashed border-slate-200 items-center justify-center">
              <Users size={36} color="#CBD5E1" />
            </View>
            <Text
              className="text-[10px] font-black uppercase text-slate-400 text-center mt-5 px-6"
              style={{ letterSpacing: 2.5 }}
            >
              {L('Keine Kunden für Ihre Suche gefunden', 'No customers matched your search')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {filtered.map((c) => {
              const busy = busyId === c.id
              return (
                <Pressable key={c.id} onPress={() => router.push(`/customers/${c.id}`)}>
                  <Card
                    style={{
                      borderColor: '#E2E8F0',
                      padding: 0,
                      ...(c.is_active ? null : { backgroundColor: '#F8FAFC', borderStyle: 'dashed' as const }),
                    }}
                  >
                    <View style={{ padding: 20, opacity: c.is_active ? 1 : 0.6 }}>
                      <View className="flex-row items-start">
                        <View className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 items-center justify-center mr-4">
                          <Users size={24} color="#94A3B8" />
                        </View>
                        <View className="flex-1">
                          <View className="flex-row items-center">
                            <Text
                              className="text-[20px] font-black text-slate-900 tracking-tight flex-shrink"
                              numberOfLines={1}
                            >
                              {c.name ?? '—'}
                            </Text>
                            <ChevronRight size={16} color="#E2E8F0" style={{ marginLeft: 8 }} />
                          </View>
                          <View
                            className={`flex-row items-center self-start mt-1.5 px-2 py-0.5 rounded-full border ${
                              c.is_active ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-100 border-slate-200'
                            }`}
                          >
                            <View
                              className={`w-1 h-1 rounded-full mr-1.5 ${c.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`}
                            />
                            <Text
                              className={`text-[9px] font-black uppercase ${
                                c.is_active ? 'text-emerald-600' : 'text-slate-400'
                              }`}
                              style={{ letterSpacing: 1.5 }}
                            >
                              {c.is_active
                                ? L('AKTIVER KUNDE', 'ACTIVE ACCOUNT')
                                : L('INAKTIV', 'INACTIVE')}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View className="mt-5" style={{ gap: 12 }}>
                        <View className="flex-row items-center">
                          <MapPin size={16} color="#CBD5E1" />
                          <Text className="text-[12px] font-bold text-slate-500 ml-3 flex-1" numberOfLines={1}>
                            {c.address || L('Adresse unbekannt', 'Location Unspecified')}
                          </Text>
                        </View>
                        <View className="flex-row items-center">
                          <User size={16} color="#CBD5E1" />
                          <Text className="text-[12px] font-black text-slate-700 tracking-tight ml-3 flex-1" numberOfLines={1}>
                            {c.contact_person || L('Kein Ansprechpartner', 'No Lead Contact')}
                          </Text>
                        </View>
                        <View className="flex-row items-center">
                          <Mail size={16} color="#CBD5E1" />
                          <Text className="text-[12px] font-bold text-blue-600 ml-3 flex-1" numberOfLines={1}>
                            {c.email || L('Keine E-Mail hinterlegt', 'No Primary Email')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Row actions — the web's context dropdown, laid out as a footer. */}
                    <View className="flex-row border-t border-slate-100">
                      <Pressable
                        onPress={() => router.push(`/customers/${c.id}?edit=1` as any)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1"
                      >
                        <Pencil size={16} color="#475569" />
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider text-slate-600 mt-1 text-center"
                          numberOfLines={2}
                        >
                          {L('Bearbeiten', 'Edit')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onToggle(c)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1 border-l border-slate-100"
                      >
                        {c.is_active ? (
                          <PowerOff size={16} color={busy ? '#CBD5E1' : '#D97706'} />
                        ) : (
                          <Power size={16} color={busy ? '#CBD5E1' : '#059669'} />
                        )}
                        <Text
                          className={`text-[10px] font-black uppercase tracking-wider mt-1 text-center ${
                            c.is_active ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                          numberOfLines={2}
                        >
                          {c.is_active ? L('Deaktivieren', 'Deactivate') : L('Aktivieren', 'Activate')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(c)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1 border-l border-slate-100"
                      >
                        <Trash2 size={16} color={busy ? '#CBD5E1' : '#EF4444'} />
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider text-red-500 mt-1 text-center"
                          numberOfLines={2}
                        >
                          {L('Datensatz entfernen', 'Remove Record')}
                        </Text>
                      </Pressable>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}
