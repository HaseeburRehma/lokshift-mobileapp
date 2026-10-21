/**
 * Betriebsstellen list — admin/dispatcher only. Mirrors the webapp's
 * /dashboard/settings/betriebsstellen: settings breadcrumb, title +
 * description, "Neue Betriebsstelle", search + "Inaktive anzeigen" +
 * count, and the table rendered as one card per row (Kürzel, Name, Art,
 * Adresse / Telefon, Status, Aktionen) with 50-row pagination.
 */

import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Building2,
  Plus,
  Phone,
  Search,
  X,
  Check,
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
import { useOperationalLocations } from '@/hooks/useOperationalLocations'
import type { OperationalLocation, OperationalLocationType } from '@/lib/types'
import { useSafeBack } from '@/lib/use-safe-back'
import { searchLocations } from '@/lib/operational-locations/parse'

const MONO_FONT = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })

/** Same page size as the web table. */
const PAGE_SIZE = 50

// Labels as on the web (TYPE_OPTIONS); English for the EN locale.
const TYPE_LABEL: Record<OperationalLocationType, { de: string; en: string }> = {
  depot: { de: 'Depot', en: 'Depot' },
  station: { de: 'Bahnhof', en: 'Station' },
  yard: { de: 'Abstellanlage', en: 'Yard' },
  workshop: { de: 'Werkstatt', en: 'Workshop' },
  office: { de: 'Büro', en: 'Office' },
  other: { de: 'Sonstige', en: 'Other' },
}

export default function OperationalLocationsScreen() {
  const router = useRouter()
  const goBack = useSafeBack()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { locations, loading, fetchLocations, toggleArchive, deleteLocation } = useOperationalLocations()
  const [showInactive, setShowInactive] = useState(true)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await fetchLocations()
    } finally {
      setRefreshing(false)
    }
  }, [fetchLocations])

  const sorted = useMemo(() => {
    return [...locations].sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
      return (a.name ?? '').localeCompare(b.name ?? '')
    })
  }, [locations])

  // Search by name, part of the name or code — same ranking as the pickers.
  const filtered = useMemo(() => {
    const base = showInactive ? sorted : sorted.filter((l) => l.is_active)
    return query.trim() ? searchLocations(base, query, base.length) : base
  }, [sorted, query, showInactive])

  if (!canCreatePlans(role)) {
    return (
      <Screen background="#F8FAFC" className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-slate-400 text-center">
          {L(
            'Nur Admins oder Disponenten können Betriebsstellen verwalten.',
            'Only admins or dispatchers can manage operational locations.',
          )}
        </Text>
      </Screen>
    )
  }

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pages - 1)
  const shown = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const goToPage = (p: number) => {
    setPage(p)
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }

  const onToggle = async (loc: OperationalLocation) => {
    setBusyId(loc.id)
    try {
      await toggleArchive(loc.id, loc.is_active)
      toast.success(
        loc.is_active
          ? L('Betriebsstelle deaktiviert', 'Location deactivated')
          : L('Betriebsstelle aktiviert', 'Location activated'),
      )
    } catch (err: any) {
      toast.error(err?.message ?? L('Betriebsstelle konnte nicht aktualisiert werden', 'Location could not be updated'))
    } finally {
      setBusyId(null)
    }
  }

  const onDelete = (loc: OperationalLocation) => {
    Alert.alert(
      L('Betriebsstelle löschen', 'Delete location'),
      L(
        `Betriebsstelle „${loc.name}" wirklich löschen? Bestehende Einsätze verlieren die Verknüpfung, bleiben aber erhalten.`,
        `Really delete location "${loc.name}"? Existing shifts lose the link but are kept.`,
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: t('times.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusyId(loc.id)
            try {
              await deleteLocation(loc.id)
              toast.success(L('Betriebsstelle gelöscht', 'Location deleted'))
            } catch (err: any) {
              toast.error(err?.message ?? L('Betriebsstelle konnte nicht gelöscht werden', 'Location could not be deleted'))
            } finally {
              setBusyId(null)
            }
          },
        },
      ],
    )
  }

  const openCreate = () => router.push('/operational-locations/new')

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
      >
        {/* Breadcrumb back to settings, as on the web */}
        <Pressable
          onPress={goBack}
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 24 }}
          className="flex-row items-center self-start mb-4"
          style={{ minHeight: 32 }}
        >
          <ChevronLeft size={16} color="#94A3B8" />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {L('Einstellungen', 'Settings')}
          </Text>
        </Pressable>

        <PageHeader
          title={L('Betriebsstellen', 'Operational locations')}
          subtitle={L(
            'Verwalten Sie die Start- und Zielorte Ihrer Schichten — Depots, Bahnhöfe, Werkstätten und weitere feste Standorte.',
            'Manage the start and end locations of your shifts — depots, stations, workshops and other fixed sites.',
          )}
        />

        <Button
          label={L('Neue Betriebsstelle', 'New location')}
          leftIcon={<Plus size={18} color="#fff" />}
          onPress={openCreate}
          style={{ marginBottom: 16 }}
        />

        {/* Search + inactive toggle + count */}
        <View className="flex-row items-center h-12 rounded-xl border border-slate-100 bg-slate-50 px-4">
          <Search size={16} color="#94A3B8" />
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v)
              setPage(0)
            }}
            placeholder={L('Suchen nach Name, Namensteil oder Kürzel …', 'Search by name, part of name or code …')}
            placeholderTextColor="#94A3B8"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700', color: '#334155' }}
          />
          {query ? (
            <Pressable
              onPress={() => {
                setQuery('')
                setPage(0)
              }}
              hitSlop={10}
            >
              <X size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
        <View className="flex-row items-center justify-between mt-3 mb-4">
          <Pressable
            onPress={() => {
              setShowInactive((s) => !s)
              setPage(0)
            }}
            hitSlop={8}
            className="flex-row items-center"
          >
            <View
              className={`w-5 h-5 rounded-md border items-center justify-center ${
                showInactive ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
              }`}
            >
              {showInactive ? <Check size={14} color="#fff" /> : null}
            </View>
            <Text className="text-[14px] font-semibold text-slate-600 ml-2">
              {L('Inaktive anzeigen', 'Show inactive')}
            </Text>
          </Pressable>
          <Text className="text-[12px] font-bold text-slate-400">
            {L(
              `${filtered.length} von ${locations.length}`,
              `${filtered.length} of ${locations.length}`,
            )}
          </Text>
        </View>

        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#0064E0" />
            <Text
              className="text-[10px] font-black uppercase text-slate-400 mt-4"
              style={{ letterSpacing: 2.5 }}
            >
              {L('Lade Betriebsstellen…', 'Loading locations…')}
            </Text>
          </View>
        ) : locations.length === 0 ? (
          <View
            className="items-center py-14 px-6 rounded-[32px] border border-dashed border-slate-200"
            style={{ backgroundColor: 'rgba(248,250,252,0.5)' }}
          >
            <Building2 size={32} color="#CBD5E1" />
            <Text className="text-[15px] font-bold text-slate-900 text-center mt-4">
              {L('Noch keine Betriebsstellen angelegt', 'No operational locations yet')}
            </Text>
            <Text className="text-[12px] font-semibold text-slate-400 text-center mt-1">
              {L(
                'Importieren Sie das Betriebsstellenverzeichnis (PDF/CSV/Excel) oder legen Sie Standorte einzeln an.',
                'Import the location directory (PDF/CSV/Excel) or create locations one by one.',
              )}
            </Text>
            <Pressable
              onPress={openCreate}
              className="flex-row items-center mt-4 h-10 px-5 rounded-xl border border-blue-200 bg-white"
            >
              <Plus size={14} color="#1D4ED8" />
              <Text className="text-[12px] font-bold text-blue-700 ml-2">
                {L('Einzeln anlegen', 'Create individually')}
              </Text>
            </Pressable>
          </View>
        ) : shown.length === 0 ? (
          <Card style={{ borderColor: '#E2E8F0' }}>
            <Text className="text-[14px] font-semibold text-slate-400 text-center py-4">
              {L(`Keine Treffer für „${query}“.`, `No matches for "${query}".`)}
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 12 }}>
            {shown.map((loc) => {
              const busy = busyId === loc.id
              const phone = loc.phone_number ?? ''
              const typeLabel = TYPE_LABEL[loc.type]
              return (
                <Pressable key={loc.id} onPress={() => router.push(`/operational-locations/${loc.id}`)}>
                  <Card style={{ borderColor: '#E2E8F0', padding: 0 }}>
                    <View style={{ padding: 16, opacity: loc.is_active ? 1 : 0.6 }}>
                      <View className="flex-row items-start justify-between">
                        <Text className="text-[15px] font-bold text-slate-900 flex-1 pr-3">
                          {loc.name ?? '—'}
                        </Text>
                        <View
                          className={`rounded-md border px-2 py-0.5 ${
                            loc.is_active ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <Text
                            className={`text-[10px] font-black uppercase tracking-wider ${
                              loc.is_active ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                          >
                            {loc.is_active ? L('Aktiv', 'Active') : L('Inaktiv', 'Inactive')}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row flex-wrap mt-3" style={{ rowGap: 10 }}>
                        <View style={{ width: '50%' }}>
                          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {L('Kürzel', 'Code')}
                          </Text>
                          <Text
                            className="text-[13px] font-black text-slate-700 mt-0.5"
                            style={{ fontFamily: MONO_FONT }}
                          >
                            {loc.short_code || '—'}
                          </Text>
                        </View>
                        <View style={{ width: '50%' }}>
                          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {L('Art', 'Type')}
                          </Text>
                          <Text className="text-[13px] font-bold text-slate-900 mt-0.5">
                            {typeLabel ? L(typeLabel.de, typeLabel.en) : String(loc.type ?? '—')}
                          </Text>
                        </View>
                        <View style={{ width: '100%' }}>
                          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {L('Adresse / Telefon', 'Address / Phone')}
                          </Text>
                          <Text className="text-[13px] font-bold text-slate-900 mt-0.5">
                            {loc.address || '—'}
                          </Text>
                          {phone ? (
                            <Pressable
                              onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {})}
                              hitSlop={8}
                              className="flex-row items-center self-start mt-1"
                            >
                              <Phone size={12} color="#047857" />
                              <Text className="text-[12px] font-semibold text-emerald-700 ml-1">{phone}</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {/* Aktionen */}
                    <View className="flex-row border-t border-slate-100">
                      <Pressable
                        onPress={() => onToggle(loc)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1"
                      >
                        {loc.is_active ? (
                          <PowerOff size={16} color={busy ? '#CBD5E1' : '#64748B'} />
                        ) : (
                          <Power size={16} color={busy ? '#CBD5E1' : '#64748B'} />
                        )}
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-1 text-center"
                          numberOfLines={2}
                        >
                          {loc.is_active ? L('Deaktivieren', 'Deactivate') : L('Aktivieren', 'Activate')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => router.push(`/operational-locations/${loc.id}`)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1 border-l border-slate-100"
                      >
                        <Pencil size={16} color="#2563EB" />
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider text-blue-600 mt-1 text-center"
                          numberOfLines={2}
                        >
                          {L('Bearbeiten', 'Edit')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDelete(loc)}
                        disabled={busy}
                        hitSlop={8}
                        className="flex-1 items-center py-3 px-1 border-l border-slate-100"
                      >
                        <Trash2 size={16} color={busy ? '#CBD5E1' : '#EF4444'} />
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider text-red-500 mt-1 text-center"
                          numberOfLines={2}
                        >
                          {L('Löschen', 'Delete')}
                        </Text>
                      </Pressable>
                    </View>
                  </Card>
                </Pressable>
              )
            })}
          </View>
        )}

        {!loading && pages > 1 ? (
          <View className="flex-row items-center justify-end mt-4" style={{ gap: 8 }}>
            <Button
              label={L('Zurück', 'Back')}
              variant="secondary"
              size="sm"
              disabled={currentPage === 0}
              onPress={() => goToPage(currentPage - 1)}
            />
            <Text className="text-[12px] font-bold text-slate-500">
              {L(`Seite ${currentPage + 1} von ${pages}`, `Page ${currentPage + 1} of ${pages}`)}
            </Text>
            <Button
              label={L('Weiter', 'Next')}
              variant="secondary"
              size="sm"
              disabled={currentPage >= pages - 1}
              onPress={() => goToPage(currentPage + 1)}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}
