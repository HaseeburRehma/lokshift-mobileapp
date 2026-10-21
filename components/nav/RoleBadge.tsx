/**
 * Small role pill used in the chat list, thread header and contact
 * picker — mirrors the webapp's components/chat/RoleBadge.tsx
 * (Verwalter red, Disponent blue, Mitarbeiter grey).
 */

import React from 'react'
import { View, Text } from 'react-native'

import { useTranslation } from '@/lib/i18n'

export function RoleBadge({ role }: { role?: string | null }) {
  const { locale } = useTranslation()
  if (!role) return null
  const r = String(role).toLowerCase()
  const isAdmin = r === 'admin'
  const isDispatch = r === 'dispatcher' || r === 'disponent' || r === 'manager'
  const label = isAdmin
    ? locale === 'de' ? 'Verwalter' : 'Administrator'
    : isDispatch
      ? locale === 'de' ? 'Disponent' : 'Dispatcher'
      : locale === 'de' ? 'Mitarbeiter' : 'Employee'
  const bg = isAdmin ? '#FEE2E2' : isDispatch ? '#DBEAFE' : '#F3F4F6'
  const fg = isAdmin ? '#B91C1C' : isDispatch ? '#1D4ED8' : '#374151'
  return (
    <View style={{ borderRadius: 999, backgroundColor: bg, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: fg, letterSpacing: 0.8, textTransform: 'uppercase' }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}
