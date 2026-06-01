/**
 * Top-level React Error Boundary — catches render-time exceptions
 * anywhere below it and shows a graceful fallback instead of the RN
 * red box. Reports the error through `lib/monitoring` (Sentry by
 * default) so issues surface in the client's dashboard automatically.
 *
 * Render errors caught:
 *   - Bad data shape from Supabase (e.g. a null where a string was
 *     expected) that slipped past the safe-format helpers
 *   - A child component throwing in `useEffect` cleanup
 *   - A library mismatch after an OTA update
 *
 * NOT caught (React rules):
 *   - Errors inside async handlers (use try/catch + `captureError`)
 *   - Errors inside setTimeout/promises (same)
 *   - Server-side rendered errors (we don't SSR on mobile)
 *   - Errors in this boundary itself (use a higher-level boundary if
 *     desired; for our app the top-level RN red-box is the last resort)
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'

import { captureError } from '@/lib/monitoring'

interface Props {
  children: React.ReactNode
  /** Optional name to tag the boundary for analytics — defaults to "root". */
  boundary?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    captureError(error, {
      tags: { boundary: this.props.boundary ?? 'root' },
      extra: { componentStack: info.componentStack ?? null },
      message: 'React render-tree crash',
    })
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundColor: '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 18,
          }}
        >
          <Text style={{ fontSize: 28 }}>⚠︎</Text>
        </View>
        <Text
          style={{
            fontSize: 22,
            fontWeight: '900',
            color: '#0F172A',
            textAlign: 'center',
            marginBottom: 6,
          }}
        >
          Etwas ist schiefgelaufen
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#475569',
            textAlign: 'center',
            marginBottom: 24,
            maxWidth: 320,
            lineHeight: 20,
          }}
        >
          Der Fehler wurde an das LokShift-Team gemeldet. Sie können diese Seite neu laden oder die App neu starten.
        </Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => ({
            backgroundColor: '#0064E0',
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 16,
            opacity: pressed ? 0.85 : 1,
          })}
          accessibilityLabel="Erneut versuchen"
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 14 }}>
            Erneut versuchen
          </Text>
        </Pressable>
        {__DEV__ && (
          <Text
            style={{
              marginTop: 24,
              fontSize: 11,
              color: '#94A3B8',
              fontFamily: 'Courier',
              textAlign: 'center',
              maxWidth: 320,
            }}
            numberOfLines={4}
          >
            {String(this.state.error?.message ?? this.state.error)}
          </Text>
        )}
      </View>
    )
  }
}
