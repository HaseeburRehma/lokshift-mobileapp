/**
 * Org-wide cache of Betriebsstellen for the pickers — one paged load per
 * organisation, shared by all pickers on a screen (Kundenfeedback 12).
 */

import { getSupabase } from '@/lib/supabase/client'
import type { OperationalLocation } from '@/lib/types'

export type PickerLocation = Pick<OperationalLocation, 'id' | 'organization_id' | 'name' | 'short_code' | 'type' | 'is_active'>

export const locationCache = new Map<string, { at: number; rows: PickerLocation[] }>()
export const LOCATION_CACHE_TTL_MS = 5 * 60_000
const inflight = new Map<string, Promise<PickerLocation[]>>()

async function fetchAll(orgId: string): Promise<PickerLocation[]> {
  const rows: PickerLocation[] = []
  // PostgREST caps responses at 1000 rows — page through.
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await getSupabase()
      .from('operational_locations')
      .select('id, organization_id, name, short_code, type, is_active')
      .eq('organization_id', orgId)
      .order('name')
      .range(from, from + 999)
    if (error) throw error
    rows.push(...((data ?? []) as PickerLocation[]))
    if (!data || data.length < 1000) break
  }
  locationCache.set(orgId, { at: Date.now(), rows })
  return rows
}

/** De-duplicated load: concurrent pickers share one request. */
export function loadAllLocations(orgId: string): Promise<PickerLocation[]> {
  let p = inflight.get(orgId)
  if (!p) {
    p = fetchAll(orgId).finally(() => inflight.delete(orgId))
    inflight.set(orgId, p)
  }
  return p
}

/** Drop the cache after an import or edit so pickers reload. */
export function invalidateLocationCache(orgId?: string) {
  if (orgId) locationCache.delete(orgId)
  else locationCache.clear()
}
