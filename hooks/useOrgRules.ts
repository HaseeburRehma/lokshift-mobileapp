/**
 * Organisation-wide calculation rules (Spesen rates + surcharge windows),
 * loaded once per organisation and shared by every screen.
 */

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { resolveSpesenRates, DEFAULT_SPESEN_RATES, type SpesenRates } from '@/lib/spesen'
import { resolveSurchargeRules, DEFAULT_SURCHARGE_RULES, type SurchargeRules } from '@/lib/time/zuschlag'

interface Rules {
  spesenRates: SpesenRates
  surchargeRules: SurchargeRules
}

const cache = new Map<string, Rules>()
const inflight = new Map<string, Promise<Rules>>()

async function load(orgId: string): Promise<Rules> {
  const { data } = await getSupabase()
    .from('organizations')
    .select('settings, spesen_rate_partial, spesen_rate_full')
    .eq('id', orgId)
    .maybeSingle()
  const rules: Rules = {
    spesenRates: resolveSpesenRates(data as any),
    surchargeRules: resolveSurchargeRules((data as any)?.settings ?? null),
  }
  cache.set(orgId, rules)
  return rules
}

export function useOrgRules(): Rules {
  const { profile } = useUser()
  const orgId = profile?.organization_id ?? null
  const [rules, setRules] = useState<Rules>(
    (orgId && cache.get(orgId)) || { spesenRates: DEFAULT_SPESEN_RATES, surchargeRules: DEFAULT_SURCHARGE_RULES },
  )

  useEffect(() => {
    if (!orgId) return
    const cached = cache.get(orgId)
    if (cached) {
      setRules(cached)
      return
    }
    let p = inflight.get(orgId)
    if (!p) {
      p = load(orgId).finally(() => inflight.delete(orgId))
      inflight.set(orgId, p)
    }
    let alive = true
    p.then((r) => alive && setRules(r)).catch(() => {})
    return () => {
      alive = false
    }
  }, [orgId])

  return rules
}
