/**
 * Safety net for the rollout order (database migration → webapp → app):
 * if this app version reaches a phone before the server update is live,
 * the new columns/tables are missing and many screens would fail. One
 * cheap probe after sign-in detects that case and shows a clear notice
 * with "retry" instead of broken screens. Network errors never block —
 * only Postgres/PostgREST "column/table does not exist" codes do.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { RefreshCw } from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { captureError } from '@/lib/monitoring'

const MISSING_SCHEMA = /^(42703|42P01|PGRST204|PGRST205)$/

async function schemaMissing(): Promise<boolean> {
  const supabase = getSupabase()
  const probes = await Promise.all([
    supabase.from('time_entries').select('submitted_at').limit(1),
    supabase.from('time_entry_corrections').select('id').limit(1),
  ])
  return probes.some((r: { error: { code?: string } | null }) => !!r.error && MISSING_SCHEMA.test(String(r.error.code ?? "")))
}

export function ServerUpdateGate({ children }: { children: React.ReactNode }) {
  const { session, ready, signOut } = useUser()
  const [missing, setMissing] = useState(false)
  const [checking, setChecking] = useState(false)

  const check = useCallback(async () => {
    setChecking(true)
    try {
      const m = await schemaMissing()
      setMissing(m)
      if (m) captureError(new Error('Server schema outdated for this app version'), { tags: { area: 'server-update-gate' } })
    } catch {
      // Offline or transient: never block the app for that.
      setMissing(false)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (session && ready) void check()
    if (!session) setMissing(false)
  }, [session, ready, check])

  if (!missing) return <>{children}</>

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 20, fontWeight: '900', color: '#0F172A', textAlign: 'center' }}>Server-Update ausstehend</Text>
      <Text style={{ marginTop: 10, fontSize: 14, lineHeight: 20, color: '#64748B', textAlign: 'center' }}>
        Diese App-Version braucht ein Update auf dem Server, das gerade eingespielt wird. Bitte versuchen Sie es in einigen Minuten erneut.
      </Text>
      <Pressable onPress={check} disabled={checking} style={{ marginTop: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, backgroundColor: '#0064E0', paddingHorizontal: 20, paddingVertical: 12, opacity: checking ? 0.6 : 1 }}>
          {checking ? <ActivityIndicator color="#FFFFFF" /> : <RefreshCw size={16} color="#FFFFFF" />}
          <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>Erneut prüfen</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => void signOut()} style={{ marginTop: 16 }} hitSlop={8}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748B' }}>Abmelden</Text>
      </Pressable>
    </View>
  )
}
