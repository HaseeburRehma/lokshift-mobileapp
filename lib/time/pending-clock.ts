/**
 * Offline-safe clock actions (write-behind with the original tap time).
 *
 * Drivers often have no network (tunnels, rural lines). A clock-in or
 * clock-out is stored on the device first — with the exact time of the tap —
 * and then sent. If sending fails for network reasons it stays queued and is
 * retried later (app returns to foreground, next load, exponential backoff),
 * always with the original time. Both writes are idempotent:
 *   - clock-in uses a client-generated id → a retry after a lost response
 *     hits the primary key and counts as success;
 *   - clock-out only touches the row while end_time IS NULL → a retry never
 *     moves an already recorded end.
 * Rejections by the server (RLS, triggers, one-open-shift rule) are not
 * retried; they are surfaced to the user.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getSupabase } from '@/lib/supabase/client'

const KEY = 'lokshift.pendingClock.v1'

export type PendingClock =
  | { kind: 'clock_in'; id: string; at: string; payload: Record<string, unknown>; attempts: number; nextAt: number }
  | { kind: 'clock_out'; id: string; at: string; totalBreakSeconds: number; attempts: number; nextAt: number }

/** RFC 4122 v4 id without native crypto (Hermes has no getRandomValues). */
export function newEntryId(): string {
  const h = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-'
    else if (i === 14) s += '4'
    else if (i === 19) s += h[(Math.random() * 4) | 8]
    else s += h[(Math.random() * 16) | 0]
  }
  return s
}

async function readAll(): Promise<PendingClock[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as PendingClock[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

async function writeAll(list: PendingClock[]) {
  try {
    if (list.length) await AsyncStorage.setItem(KEY, JSON.stringify(list))
    else await AsyncStorage.removeItem(KEY)
  } catch {
    // Storage full/unavailable: the action was attempted online already.
  }
}

export async function enqueue(op: PendingClock) {
  const list = (await readAll()).filter((p) => !(p.kind === op.kind && p.id === op.id))
  list.push(op)
  await writeAll(list)
}

export async function dequeue(kind: PendingClock['kind'], id: string) {
  await writeAll((await readAll()).filter((p) => !(p.kind === kind && p.id === id)))
}

export async function pendingClockOps(): Promise<PendingClock[]> {
  return readAll()
}

/** Postgres / PostgREST answered → the server decided; otherwise network. */
export function isNetworkError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST')) return false
  return /network|fetch|timeout|abort|offline|failed to fetch/i.test(String(error.message ?? '')) || code === ''
}

export async function sendClockIn(op: Extract<PendingClock, { kind: 'clock_in' }>) {
  const { data, error } = await getSupabase()
    .from('time_entries')
    .insert({ ...op.payload, id: op.id, start_time: op.at } as any)
    .select('*')
    .single()
  // Same id already stored (response was lost the first time) → success.
  if (error && error.code === '23505' && /time_entries_pkey/.test(String(error.message))) {
    const { data: existing } = await getSupabase().from('time_entries').select('*').eq('id', op.id).maybeSingle()
    return { data: existing, error: null }
  }
  return { data, error }
}

export async function sendClockOut(op: Extract<PendingClock, { kind: 'clock_out' }>, select: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('time_entries')
    .update({
      end_time: op.at,
      is_on_break: false,
      current_break_start: null,
      total_break_seconds: op.totalBreakSeconds,
      break_minutes: Math.round(op.totalBreakSeconds / 60),
    } as any)
    .eq('id', op.id)
    .is('end_time', null)
    .select(select)
    .maybeSingle()
  if (!error && !data) {
    // Already ended earlier (retry after a lost response) → return the row as it is.
    const { data: row, error: e2 } = await supabase.from('time_entries').select(select).eq('id', op.id).maybeSingle()
    return { data: row, error: e2 }
  }
  return { data, error }
}

/** Backoff: 5 s, 10 s, 20 s … capped at 5 min, with jitter. */
export function nextAttemptAt(attempts: number): number {
  const base = Math.min(300_000, 5_000 * 2 ** attempts)
  return Date.now() + base + Math.floor(Math.random() * 1000)
}
