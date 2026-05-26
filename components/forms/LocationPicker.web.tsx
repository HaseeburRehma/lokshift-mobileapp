/**
 * Web fallback for LocationPicker. react-native-maps depends on native
 * codegen modules that don't exist in react-native-web, so on web we
 * show a pair of lat/lng inputs plus a "Mein Standort" button that
 * uses the browser's navigator.geolocation API. Visual contract
 * matches the native version closely enough that the parent form
 * doesn't care which one rendered.
 *
 * Metro's platform-extension resolution picks this file on web; the
 * native .tsx is used on iOS/Android.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, TextInput } from 'react-native'
import { MapPin, Crosshair, X } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'

interface Props {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number | null, lng: number | null) => void
  height?: number
  label?: string
}

function parseCoord(raw: string): number | null {
  if (raw === '') return null
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function LocationPicker({ latitude, longitude, onChange, label }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [busy, setBusy] = useState(false)
  const hasPin = latitude != null && longitude != null

  const useMyLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude)
        setBusy(false)
      },
      () => setBusy(false),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 },
    )
  }

  const clear = () => onChange(null, null)

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, marginLeft: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MapPin size={14} color="#6B7280" />
          <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1.5 text-gray-500 dark:text-slate-400">
            {label ?? L('Standort', 'Location')}
          </Text>
        </View>
        {hasPin && (
          <Pressable onPress={clear} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <X size={12} color="#94A3B8" />
            <Text className="text-[11px] font-bold text-gray-500 dark:text-slate-400">
              {L('Entfernen', 'Clear')}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1 ml-1">
            {L('Breitengrad', 'Latitude')}
          </Text>
          <TextInput
            value={latitude == null ? '' : String(latitude)}
            onChangeText={(v) => onChange(parseCoord(v), longitude)}
            placeholder="51.1657"
            keyboardType="numeric"
            style={{
              height: 44,
              borderWidth: 2,
              borderColor: '#E5E7EB',
              borderRadius: 12,
              paddingHorizontal: 12,
              fontSize: 14,
              color: '#111827',
            }}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 mb-1 ml-1">
            {L('Längengrad', 'Longitude')}
          </Text>
          <TextInput
            value={longitude == null ? '' : String(longitude)}
            onChangeText={(v) => onChange(latitude, parseCoord(v))}
            placeholder="10.4515"
            keyboardType="numeric"
            style={{
              height: 44,
              borderWidth: 2,
              borderColor: '#E5E7EB',
              borderRadius: 12,
              paddingHorizontal: 12,
              fontSize: 14,
              color: '#111827',
            }}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Pressable
          onPress={useMyLocation}
          disabled={busy}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: '#0064E0',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Crosshair size={14} color="#0064E0" />
          <Text className="text-[12px] font-bold text-brand">
            {busy ? L('Standort…', 'Locating…') : L('Mein Standort', 'My location')}
          </Text>
        </Pressable>
        <Text className="text-[10px] text-gray-400 dark:text-slate-500">
          {L('Karte nur auf Mobilgerät verfügbar', 'Map only available on mobile')}
        </Text>
      </View>
    </View>
  )
}
