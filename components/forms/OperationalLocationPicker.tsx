/**
 * Betriebsstelle picker with type-ahead search (billing spec section 9):
 * typing a name ("Aachen") lists every matching operating point with name
 * and code, typing a code ("KAW") finds its full name. Searches the ~24 000
 * RIL100 points on the server (same RPC and ranking as the webapp).
 *
 * Used in plans/new + edit, plans/bulk and TimeEntrySheet. An empty string
 * means "no location", so callers can express NULL without a tri-state.
 */

import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, Modal, TextInput, FlatList, ActivityIndicator } from 'react-native'
import { MapPin, Search, X, Check, ChevronDown } from 'lucide-react-native'

import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { cachedLocation, fetchLocationById, searchLocationsRemote, type PickerLocation } from '@/lib/operational-locations/cache'

const TYPE_LABELS: Record<string, [string, string]> = {
  depot: ['Depot', 'Depot'],
  station: ['Bahnhof', 'Station'],
  yard: ['Abstellanlage', 'Yard'],
  workshop: ['Werkstatt', 'Workshop'],
  office: ['Büro', 'Office'],
  other: ['Sonstige', 'Other'],
}

const LIMIT = 40

interface Props {
  /** Empty string means "no location". */
  value: string
  onChange: (id: string) => void
  /** Defaults to "Betriebsstelle" — pass a custom label for start/destination distinction. */
  label?: string
  /** Hides this id (e.g. the other side's selection). */
  excludeId?: string | null
  disabled?: boolean
}

export function OperationalLocationPicker({ value, onChange, label, excludeId, disabled }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerLocation[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selected, setSelected] = useState<PickerLocation | null>(() => cachedLocation(value))

  // The selected location (also when inactive or not in the results).
  useEffect(() => {
    if (!value) { setSelected(null); return }
    const hit = cachedLocation(value)
    if (hit) { setSelected(hit); return }
    let alive = true
    fetchLocationById(value)
      .then((row) => { if (alive) setSelected(row) })
      .catch((e) => console.warn('[OperationalLocationPicker]', e?.message ?? e))
    return () => { alive = false }
  }, [value])

  // Type-ahead: debounced, only the latest answer counts.
  const seq = useRef(0)
  useEffect(() => {
    if (!open || !orgId) return
    const id = ++seq.current
    setSearching(true)
    const timer = setTimeout(() => {
      searchLocationsRemote(orgId, query, { limit: LIMIT })
        .then((rows) => {
          if (id !== seq.current) return
          setResults(rows.filter((l) => l.id !== excludeId))
          setFailed(false)
        })
        .catch((e) => {
          console.warn('[OperationalLocationPicker]', e?.message ?? e)
          if (id === seq.current) { setResults([]); setFailed(true) }
        })
        .finally(() => { if (id === seq.current) setSearching(false) })
    }, query.trim() ? 200 : 0)
    return () => clearTimeout(timer)
  }, [open, orgId, query, excludeId])

  const loading = !orgId

  const pick = (id: string, row?: PickerLocation) => {
    setSelected(row ?? null)
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const typeLabel = (t: string) => (TYPE_LABELS[t] ?? TYPE_LABELS.other)[locale === 'de' ? 0 : 1]

  return (
    <View>
      <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-1.5">
        {label ?? L('Betriebsstelle', 'Location')}
      </Text>
      <Pressable onPress={() => !disabled && setOpen(true)} disabled={disabled}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: 52,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: selected ? '#BFDBFE' : '#F1F5F9',
            backgroundColor: selected ? '#EFF6FF' : '#F9FAFB',
            paddingHorizontal: 14,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <MapPin size={18} color={selected ? '#0064E0' : '#94A3B8'} />
          <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
            {selected ? (
              <>
                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }} numberOfLines={1}>{selected.name}</Text>
                <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                  {selected.short_code ? `${selected.short_code} · ` : ''}{typeLabel(selected.type)}{!selected.is_active ? ` · ${L('archiviert', 'archived')}` : ''}
                </Text>
              </>
            ) : (
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>{loading ? L('Lädt …', 'Loading …') : L('Keine – antippen zum Suchen', 'None – tap to search')}</Text>
            )}
          </View>
          {selected ? (
            <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel={L('Auswahl entfernen', 'Clear selection')}>
              <X size={18} color="#64748B" />
            </Pressable>
          ) : (
            <ChevronDown size={18} color="#94A3B8" />
          )}
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}><X size={24} color="#0064E0" /></Pressable>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>{label ?? L('Betriebsstelle', 'Location')}</Text>
            <View style={{ width: 24 }} />
          </View>
          <View style={{ marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#F1F5F9', borderRadius: 16, paddingHorizontal: 12, height: 50, backgroundColor: '#F9FAFB' }}>
            <Search size={18} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              placeholder={L('Name, Namensteil oder Kürzel …', 'Name, part of name or code …')}
              placeholderTextColor="#9CA3AF"
              style={{ flex: 1, marginLeft: 8, fontSize: 15, color: '#111827' }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}><X size={16} color="#94A3B8" /></Pressable>
            ) : null}
          </View>

          {searching && results.length === 0 ? (
            <ActivityIndicator style={{ marginTop: 30 }} color="#0064E0" />
          ) : (
            <FlatList
              data={results}
              keyExtractor={(l) => l.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
              ListHeaderComponent={
                <Pressable onPress={() => pick('')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#64748B' }}>{L('Keine Betriebsstelle', 'No location')}</Text>
                    {value === '' && <Check size={18} color="#0064E0" />}
                  </View>
                </Pressable>
              }
              ListEmptyComponent={
                <Text style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#94A3B8' }}>
                  {failed
                    ? L('Suche fehlgeschlagen – bitte erneut versuchen.', 'Search failed – please try again.')
                    : query.trim()
                      ? L('Keine Treffer.', 'No matches.')
                      : L('Name oder Kürzel eingeben, z. B. „Aachen“ oder „KAW“.', 'Type a name or code, e.g. “Aachen” or “KAW”.')}
                </Text>
              }
              ListFooterComponent={
                results.length >= LIMIT || (!query.trim() && results.length > 0) ? (
                  <Text style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#94A3B8' }}>
                    {query.trim()
                      ? L('Weitere Treffer – Suche verfeinern.', 'More results – refine your search.')
                      : L('Eigene Betriebsstellen – für alle weiteren Name oder Kürzel eingeben.', 'Your locations – type a name or code for all others.')}
                  </Text>
                ) : null
              }
              renderItem={({ item }) => {
                const on = item.id === value
                return (
                  <Pressable onPress={() => pick(item.id, item)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                      <View style={{ minWidth: 64, marginRight: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '900', color: '#0064E0' }}>{item.short_code ?? '—'}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, fontWeight: on ? '900' : '700', color: '#0F172A' }} numberOfLines={1}>{item.name}</Text>
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>{typeLabel(item.type)}</Text>
                      </View>
                      {on && <Check size={18} color="#0064E0" />}
                    </View>
                  </Pressable>
                )
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  )
}
