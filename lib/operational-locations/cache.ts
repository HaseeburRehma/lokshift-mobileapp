/**
 * Betriebsstellen for the pickers — server-side search (billing spec
 * section 9). The RIL100 list has ~24 000 operating points, so the app never
 * downloads the whole list: the database searches name ↔ code in both
 * directions (RPC search_operational_locations, same as the webapp) and only
 * the shown rows are loaded. Before migration 20261125120000 the RPC does not
 * exist; then a plain ilike query plus the shared client ranking is used.
 */

import { getSupabase } from '@/lib/supabase/client'
import type { OperationalLocation } from '@/lib/types'
import { searchLocations } from './parse'

export type PickerLocation = Pick<OperationalLocation, 'id' | 'organization_id' | 'name' | 'short_code' | 'type' | 'is_active'>

const COLS = 'id, organization_id, name, short_code, type, is_active'
const byId = new Map<string, PickerLocation>()

export function rememberLocations(rows: PickerLocation[]): void {
  for (const r of rows) byId.set(r.id, r)
}

export function cachedLocation(id: string | null | undefined): PickerLocation | null {
  return id ? byId.get(id) ?? null : null
}

/** Drop cached rows after an import or edit so pickers show fresh names. */
export function invalidateLocationCache(_orgId?: string) {
  byId.clear()
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || error.code === '42883' || /search_operational_locations/.test(error.message ?? '')
}

function plain(q: string): string {
  return q.replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function searchLocationsRemote(
  orgId: string,
  query: string,
  opts: { limit?: number; includeInactive?: boolean } = {},
): Promise<PickerLocation[]> {
  const sb = getSupabase()
  const limit = Math.min(Math.max(opts.limit ?? 40, 1), 100)
  const q = query.trim()

  if (!q) {
    // No query yet: the organisation's own Betriebsstellen (not imported).
    let own = sb.from('operational_locations').select(COLS).eq('organization_id', orgId)
    if (!opts.includeInactive) own = own.eq('is_active', true)
    const { data, error } = await own.is('source', null).order('name').limit(limit)
    if (!error) {
      rememberLocations((data ?? []) as PickerLocation[])
      return (data ?? []) as PickerLocation[]
    }
    let all = sb.from('operational_locations').select(COLS).eq('organization_id', orgId)
    if (!opts.includeInactive) all = all.eq('is_active', true)
    const res = await all.order('name').limit(limit)
    if (res.error) throw res.error
    rememberLocations((res.data ?? []) as PickerLocation[])
    return (res.data ?? []) as PickerLocation[]
  }

  const { data, error } = await sb.rpc('search_operational_locations', {
    p_query: q,
    p_limit: limit,
    p_include_inactive: !!opts.includeInactive,
  })
  if (!error) {
    rememberLocations((data ?? []) as PickerLocation[])
    return (data ?? []) as PickerLocation[]
  }
  if (!isMissingRpc(error)) throw error

  const p = plain(q)
  if (!p) return []
  let fb = sb.from('operational_locations').select(COLS).eq('organization_id', orgId).or(`name.ilike.*${p}*,short_code.ilike.${p}*`)
  if (!opts.includeInactive) fb = fb.eq('is_active', true)
  const res = await fb.order('name').limit(300)
  if (res.error) throw res.error
  const ranked = searchLocations((res.data ?? []) as PickerLocation[], q, limit)
  rememberLocations(ranked)
  return ranked
}

export async function fetchLocationById(id: string): Promise<PickerLocation | null> {
  const hit = byId.get(id)
  if (hit) return hit
  const { data, error } = await getSupabase().from('operational_locations').select(COLS).eq('id', id).maybeSingle()
  if (error) throw error
  if (data) rememberLocations([data as PickerLocation])
  return (data as PickerLocation | null) ?? null
}
