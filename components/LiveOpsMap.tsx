/**
 * react-native-maps wrapper for the Live Operations dashboard.
 *
 * On native (iOS / Android) renders `MapView` with two layers:
 *   - active pins (green / amber by break state)
 *   - upcoming pins (gray)
 * On web, the sibling `LiveOpsMap.web.tsx` renders a placeholder card
 * — Metro's platform-extension resolution picks the right file
 * automatically.
 */

import React, { useEffect, useRef } from 'react'
import { View, Text, Platform } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { MapPin as MapPinIcon } from 'lucide-react-native'

export interface LiveMapPin {
  id: string
  latitude: number
  longitude: number
  title: string
  description?: string
  color: string
}

export interface LiveOpsMapProps {
  activePins: LiveMapPin[]
  upcomingPins: LiveMapPin[]
  initialRegion: {
    latitude: number
    longitude: number
    latitudeDelta: number
    longitudeDelta: number
  }
  emptyLabel: string
  height?: number
}

export function LiveOpsMap({
  activePins,
  upcomingPins,
  initialRegion,
  emptyLabel,
  height = 280,
}: LiveOpsMapProps) {
  const mapRef = useRef<MapView | null>(null)
  const isEmpty = activePins.length === 0 && upcomingPins.length === 0

  // Recenter when the first pin appears / changes.
  useEffect(() => {
    if (!mapRef.current) return
    if (isEmpty) return
    mapRef.current.animateToRegion(
      {
        latitude: initialRegion.latitude,
        longitude: initialRegion.longitude,
        latitudeDelta: initialRegion.latitudeDelta,
        longitudeDelta: initialRegion.longitudeDelta,
      },
      450,
    )
  }, [initialRegion.latitude, initialRegion.longitude, isEmpty])

  return (
    <View
      style={{
        height,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#E2E8F0',
        marginBottom: 14,
      }}
    >
      <MapView
        ref={(r) => {
          mapRef.current = r
        }}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
      >
        {upcomingPins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title}
            description={p.description}
            pinColor={Platform.OS === 'ios' ? 'gray' : undefined}
          >
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                backgroundColor: p.color,
                borderColor: '#fff',
                borderWidth: 2,
                opacity: 0.7,
              }}
            />
          </Marker>
        ))}
        {activePins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            title={p.title}
            description={p.description}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                backgroundColor: p.color,
                borderColor: '#fff',
                borderWidth: 3,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            />
          </Marker>
        ))}
      </MapView>

      {isEmpty && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15,23,42,0.35)',
          }}
          pointerEvents="none"
        >
          <View
            style={{
              backgroundColor: '#fff',
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              alignItems: 'center',
            }}
          >
            <MapPinIcon size={18} color="#0064E0" />
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 6 }}
            >
              {emptyLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}
