/**
 * Route-level RBAC guard.
 *
 * Wrap admin-only screens with `<RoleGuard roles={['admin', 'dispatcher']}>`
 * so an employee who deep-links / push-notifications into them sees a
 * friendly notice instead of an empty screen full of buttons that 500
 * on RLS rejection.
 *
 * Server-side RLS is still the real authority — this guard is UI-only.
 * It prevents accidental clicks + makes the "why is this empty?"
 * confusion impossible.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { ShieldAlert } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { useUser } from '@/lib/user-context'
import { normalizeRole } from '@/lib/rbac/permissions'
import type { UserRole } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'

interface RoleGuardProps {
  /** Roles allowed to render the children. Empty = open to all signed-in users. */
  roles: UserRole[]
  /** Optional override for the "not permitted" copy. */
  notPermittedMessage?: { de: string; en: string }
  children: React.ReactNode
}

export function RoleGuard({ roles, notPermittedMessage, children }: RoleGuardProps) {
  const { role, session } = useUser()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  // Auth guard above this in the tree handles the unauthenticated case.
  // Belt-and-suspenders: if there's no session somehow, do not leak the
  // wrapped UI (which would render-and-error against null profile).
  if (!session) return null

  const normalized = normalizeRole(role)
  const allowed = roles.length === 0 || (normalized && roles.includes(normalized))
  if (allowed) return <>{children}</>

  const msg =
    notPermittedMessage ??
    {
      de: 'Diese Funktion ist nur für Admins und Disponenten verfügbar.',
      en: 'This area is restricted to admins and dispatchers.',
    }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen className="px-8 items-center justify-center" noTapToDismiss>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: '#FEF3C7',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <ShieldAlert size={28} color="#D97706" />
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '900',
            color: '#0F172A',
            textAlign: 'center',
            marginBottom: 6,
          }}
        >
          {L('Zugriff verweigert', 'Access denied')}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: '#64748B',
            textAlign: 'center',
            lineHeight: 19,
            maxWidth: 320,
          }}
          numberOfLines={4}
        >
          {L(msg.de, msg.en)}
        </Text>
      </Screen>
    </View>
  )
}
