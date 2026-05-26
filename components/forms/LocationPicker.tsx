/**
 * Lightweight map-based location picker. Tap the map to place a marker,
 * drag the marker to fine-tune, or hit "Mein Standort" to fall back to
 * the device's current position via expo-location.
 *
 * Designed to be embedded inside a card (no own header / no full-screen
 * presentation). Height is 220 by default; pass `height` to override.
 *
 * Returns `null` for both lat and lng when the user explicitly clears
 * the pin via the "Entfernen" link.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import MapView, { Marker, type LongPressEvent, type MapPressEvent } from 'react-native-maps'
import * as Location from 'expo-location'
import { MapPin, Crosshair, X } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'

interface Props {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number | null, lng: number | null) => void
  height?: number
  /** Optional label shown above the map. */
  label?: string
}

const FALLBACK_REGION = {
  latitude: 51.1657,
  longitude: 10.4515,
  latitudeDelta: 6,
  longitudeDelta: 6,
}

export function LocationPicker({
  latitude,
  longitude,
  onChange,
  height = 220,
  label,
}: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const mapRef = useRef<MapView | null>(null)
  const [busyLocate, setBusyLocate] = useState(false)

  const hasPin = latitude != null && longitude != null

  const initialRegion = useMemo(() => {
    if (hasPin) {
      return {
        latitude: latitude as number,
        longitude: longitude as number,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    }
    return FALLBACK_REGION
  }, [hasPin, latitude, longitude])

  // When the pin gets set externally (e.g. via "Mein Standort"), animate
  // the camera so the user sees the change.
  useEffect(() => {
    if (!hasPin) return
    mapRef.current?.animateToRegion(
      {
        latitude: latitude as number,
        longitude: longitude as number,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      },
      350,
    )
  }, [latitude, longitude, hasPin])

  const onTap = (e: MapPressEvent | LongPressEvent) => {
    const c = e.nativeEvent.coordinate
    onChange(c.latitude, c.longitude)
  }

  const useMyLocation = async () => {
    setBusyLocate(true)
    try {
      const perm = await Location.getForegroundPermissionsAsync()
      let granted = perm.granted
      if (!granted) {
        const req = await Location.requestForegroundPermissionsAsync()
        granted = req.granted
      }
      if (!granted) {
        Alert.alert(
          L('Berechtigung fehlt', 'Permission missing'),
          L(
            'Bitte erlauben Sie den Standort-Zugriff in den Systemeinstellungen.',
            'Please grant location access in system settings.',
          ),
        )
        return
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      onChange(pos.coords.latitude, pos.coords.longitude)
    } catch (err: any) {
      Alert.alert(L('Standort fehlgeschlagen', 'Location failed'), err?.message ?? String(err))
    } finally {
      setBusyLocate(false)
    }
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

      <View
        style={{
          height,
          borderRadius: 16,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}
      >
        <MapView
          ref={(r) => {
            mapRef.current = r
          }}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onPress={onTap}
          onLongPress={onTap}
        >
          {hasPin && (
            <Marker
              draggable
              coordinate={{ latitude: latitude as number, longitude: longitude as number }}
              onDragEnd={(e: any) => {
                const c = e.nativeEvent.coordinate
                onChange(c.latitude, c.longitude)
              }}
            />
          )}
        </MapView>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <Pressable
          onPress={useMyLocation}
          disabled={busyLocate}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: '#0064E0',
            opacity: busyLocate ? 0.6 : 1,
          }}
        >
          <Crosshair size={14} color="#0064E0" />
          <Text className="text-[12px] font-bold text-brand">
            {busyLocate
              ? L('Standort…', 'Locating…')
              : L('Mein Standort', 'My location')}
          </Text>
        </Pressable>
        {hasPin && (
          <Text className="text-[10px] text-gray-500 dark:text-slate-400" numberOfLines={1}>
            {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
          </Text>
        )}
      </View>
      <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5 ml-1">
        {L(
          'Tippen oder ziehen, um die Position zu setzen.',
          'Tap or drag to place the pin.',
        )}
      </Text>
    </View>
  )
}
