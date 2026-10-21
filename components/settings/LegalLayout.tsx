/**
 * Mobile port of the webapp's components/legal/LegalLayout.tsx.
 *
 *   - white sticky bar: "← Zurück / Back" · "LokShift" · other-language link
 *   - gray-50 page, `text-3xl font-black text-gray-900` title, gray-500
 *     subtitle, gray-400 "Stand" line
 *   - prose sections: 20px extrabold gray-900 headings, 15px gray-700 body
 *     at 1.7 line-height, disc lists, underlined brand-blue links
 *   - footer: company block + E-Mail · Impressum · Datenschutz · AGB
 *
 * The web serves DE and EN as separate URLs (/datenschutz ↔ /privacy-policy,
 * /agb ↔ /terms); here each screen holds both texts and the header link
 * flips between them locally.
 */

import React from 'react'
import { View, Text, Pressable, ScrollView, Linking } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'

import { useSafeBack } from '@/lib/use-safe-back'

const BRAND = '#0064E0'
const GRAY_200 = '#E5E7EB'
const GRAY_400 = '#9CA3AF'
const GRAY_500 = '#6B7280'
const GRAY_600 = '#4B5563'
const GRAY_700 = '#374151'
const GRAY_900 = '#111827'

const SAFE_URL = /^(https:|mailto:|tel:)/i

export function openLegalUrl(url: string) {
  if (!SAFE_URL.test(url)) return
  Linking.openURL(url).catch(() => {})
}

export function LegalLayout({
  title,
  subtitle,
  lastUpdated,
  otherLocaleLabel,
  onOtherLocale,
  children,
}: {
  title: string
  subtitle?: string
  lastUpdated?: string
  otherLocaleLabel?: string
  onOtherLocale?: () => void
  children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')

  const goLegal = (path: '/legal/impressum' | '/legal/datenschutz' | '/legal/agb') => {
    router.replace(path as any)
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header bar */}
      <View style={{ paddingTop: insets.top, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: GRAY_200 }}>
        <View
          style={{
            height: 56,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            onPress={goBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Zurück / Back"
            style={{ flexDirection: 'row', alignItems: 'center', width: 112 }}
          >
            <ArrowLeft size={16} color={GRAY_600} />
            <Text style={{ marginLeft: 8, fontSize: 13, fontWeight: '500', color: GRAY_600 }} numberOfLines={1}>
              Zurück / Back
            </Text>
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: '700', color: BRAND }}>LokShift</Text>
          {otherLocaleLabel && onOtherLocale ? (
            <Pressable
              onPress={onOtherLocale}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              style={{ width: 112, alignItems: 'flex-end' }}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: BRAND }}>{otherLocaleLabel}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 112 }} />
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: insets.bottom + 48 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
        <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '900', color: GRAY_900, marginBottom: 8 }}>{title}</Text>
        {subtitle ? (
          <Text style={{ fontSize: 17, lineHeight: 25, color: GRAY_500, marginBottom: 8 }}>{subtitle}</Text>
        ) : null}
        {lastUpdated ? (
          <Text style={{ fontSize: 14, color: GRAY_400, marginBottom: 8 }}>{lastUpdated}</Text>
        ) : null}

        <View style={{ marginTop: 8 }}>{children}</View>

        {/* Footer */}
        <View style={{ marginTop: 56, paddingTop: 28, borderTopWidth: 1, borderTopColor: GRAY_200 }}>
          <Text style={{ fontSize: 14, lineHeight: 21, color: GRAY_500, marginBottom: 8 }}>
            <Text style={{ fontWeight: '700', color: GRAY_700 }}>Rhein Maas Rail GmbH</Text>
            {'\n'}
            Josefstraße 157, 52080 Aachen, Deutschland
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: GRAY_500 }}>
            {'E-Mail: '}
            <Text style={{ color: BRAND }} onPress={() => openLegalUrl('mailto:lokshiftapp@gmail.com')}>
              lokshiftapp@gmail.com
            </Text>
            {' · '}
            <Text style={{ color: BRAND }} onPress={() => goLegal('/legal/impressum')}>
              Impressum
            </Text>
            {' · '}
            <Text style={{ color: BRAND }} onPress={() => goLegal('/legal/datenschutz')}>
              Datenschutz
            </Text>
            {' · '}
            <Text style={{ color: BRAND }} onPress={() => goLegal('/legal/agb')}>
              AGB
            </Text>
          </Text>
        </View>
        </View>
      </ScrollView>
    </View>
  )
}

/** `<section><h2>…</h2>…</section>` */
export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 28 }}>
      <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '800', color: GRAY_900, marginBottom: 12 }}>{title}</Text>
      {children}
    </View>
  )
}

/** `<p>` — 15px gray-700, line-height 1.7. Accepts nested <LegalLink>. */
export function LegalP({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: 15, lineHeight: 25, color: GRAY_700, marginBottom: 12 }}>{children}</Text>
}

/** `<ul class="list-disc">` */
export function LegalList({ items }: { items: string[] }) {
  return (
    <View style={{ marginTop: 4, marginBottom: 12, paddingLeft: 6 }}>
      {items.map((item, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
          <Text style={{ fontSize: 15, lineHeight: 25, color: GRAY_700, width: 16 }}>{'•'}</Text>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 25, color: GRAY_700 }}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

/** Inline underlined brand-blue link — must be rendered inside a <Text>. */
export function LegalLink({ children, url, onPress }: { children: string; url?: string; onPress?: () => void }) {
  return (
    <Text
      style={{ color: BRAND, textDecorationLine: 'underline' }}
      onPress={() => {
        if (onPress) onPress()
        else if (url) openLegalUrl(url)
      }}
    >
      {children}
    </Text>
  )
}
