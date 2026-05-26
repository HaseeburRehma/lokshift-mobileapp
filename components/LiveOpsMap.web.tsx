/**
 * Web implementation of LiveOpsMap. Loads Leaflet directly from the
 * CDN — no npm import, no Metro / pnpm resolution involved. That keeps
 * the web bundle small AND sidesteps the bundler issues we hit when
 * react-leaflet was statically imported through pnpm's symlinks.
 *
 * Native still uses LiveOpsMap.tsx with react-native-maps.
 */

import React, { useEffect, useRef } from 'react'
import { View, Text } from 'react-native'
import { MapPin as MapPinIcon } from 'lucide-react-native'

import type { LiveOpsMapProps } from './LiveOpsMap'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

// Minimal global typing — we don't import leaflet's npm types, so
// declare just enough to keep TS happy. Treated as `any` at runtime.
type LeafletNS = {
  map: (el: HTMLElement, opts?: any) => any
  tileLayer: (url: string, opts?: any) => any
  circleMarker: (latlng: [number, number], opts?: any) => any
}

/** Promise that resolves once the Leaflet global is on window. */
function loadLeaflet(): Promise<LeafletNS | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  const w = window as any
  if (w.L) return Promise.resolve(w.L as LeafletNS)

  // CSS — once.
  if (typeof document !== 'undefined') {
    const cssLoaded = Array.from(document.head.querySelectorAll('link')).some(
      (lk) => lk.getAttribute('href') === LEAFLET_CSS,
    )
    if (!cssLoaded) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
  }

  // Reuse an in-flight load promise so multiple maps don't insert
  // multiple <script> tags.
  if (w.__leaflet_loading__) return w.__leaflet_loading__ as Promise<LeafletNS>

  w.__leaflet_loading__ = new Promise<LeafletNS | null>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${LEAFLET_JS}"]`,
    ) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve((window as any).L))
      existing.addEventListener('error', () => reject(new Error('Leaflet failed to load')))
      return
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => resolve((window as any).L)
    script.onerror = () => reject(new Error('Leaflet failed to load'))
    document.head.appendChild(script)
  })
  return w.__leaflet_loading__
}

function deltaToZoom(latitudeDelta: number): number {
  if (latitudeDelta >= 8) return 6
  if (latitudeDelta >= 2) return 8
  if (latitudeDelta >= 0.5) return 11
  if (latitudeDelta >= 0.1) return 13
  return 14
}

export function LiveOpsMap({
  activePins,
  upcomingPins,
  initialRegion,
  emptyLabel,
  height = 280,
}: LiveOpsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const isEmpty = activePins.length === 0 && upcomingPins.length === 0

  // One-time map init.
  useEffect(() => {
    let cancelled = false
    loadLeaflet().then((L) => {
      if (cancelled || !L || !containerRef.current) return
      if (mapRef.current) return // already initialised (Strict-Mode double mount)
      const zoom = deltaToZoom(initialRegion.latitudeDelta)
      const map = L.map(containerRef.current, {
        center: [initialRegion.latitude, initialRegion.longitude],
        zoom,
        scrollWheelZoom: false,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map)
      mapRef.current = map
      drawMarkers(L)
    })
    return () => {
      cancelled = true
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {}
        mapRef.current = null
        markersRef.current = []
      }
    }
    // We deliberately only run init once; re-centring + marker
    // updates happen in the dependent effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-center when the focus pin moves.
  useEffect(() => {
    if (!mapRef.current) return
    const zoom = deltaToZoom(initialRegion.latitudeDelta)
    try {
      mapRef.current.flyTo(
        [initialRegion.latitude, initialRegion.longitude],
        zoom,
        { duration: 0.6 },
      )
    } catch {}
  }, [initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta])

  // Re-draw markers whenever the pin sets change.
  useEffect(() => {
    const w = typeof window !== 'undefined' ? (window as any) : null
    const L: LeafletNS | undefined = w?.L
    if (!L || !mapRef.current) return
    drawMarkers(L)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePins, upcomingPins])

  function drawMarkers(L: LeafletNS) {
    if (!mapRef.current) return
    // Clear previous.
    for (const m of markersRef.current) {
      try {
        mapRef.current.removeLayer(m)
      } catch {}
    }
    markersRef.current = []

    for (const p of upcomingPins) {
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 7,
        color: '#FFFFFF',
        weight: 2,
        fillColor: p.color,
        fillOpacity: 0.7,
      }).addTo(mapRef.current)
      const popupHtml = `<strong>${escapeHtml(p.title)}</strong>${
        p.description ? `<br/><span>${escapeHtml(p.description)}</span>` : ''
      }`
      marker.bindPopup(popupHtml)
      markersRef.current.push(marker)
    }
    for (const p of activePins) {
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius: 10,
        color: '#FFFFFF',
        weight: 3,
        fillColor: p.color,
        fillOpacity: 1,
      }).addTo(mapRef.current)
      const popupHtml = `<strong>${escapeHtml(p.title)}</strong>${
        p.description ? `<br/><span>${escapeHtml(p.description)}</span>` : ''
      }`
      marker.bindPopup(popupHtml)
      markersRef.current.push(marker)
    }
  }

  return (
    <View
      style={{
        height,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#E2E8F0',
        marginBottom: 14,
        position: 'relative',
      }}
    >
      {/* react-native-web flattens View into a <div>. We attach a ref to
          the underlying DOM node so Leaflet can mount inside it. The
          extra inner <div> is intentional — Leaflet writes inline
          width/height styles onto its container which would otherwise
          fight react-native-web's flex layout. */}
      <View
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={containerRef as any}
        style={{ flex: 1 }}
      />

      {isEmpty && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15,23,42,0.25)',
          }}
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
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 6 }}>
              {emptyLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
