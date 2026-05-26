/**
 * Tiny AsyncStorage-backed cache for the data hooks.
 *
 * Pattern:
 *   const cached = await readCache<MyType[]>('plans:org-123')
 *   if (cached) setState(cached)             // instant hydrate
 *   const fresh = await fetchFromSupabase()  // network refresh
 *   setState(fresh)
 *   await writeCache('plans:org-123', fresh) // persist for next launch
 *
 * Keys are namespaced per organisation so multiple-org users don't cross
 * the streams. Cache entries include a timestamp so screens that care
 * can display a "Letzte Aktualisierung" hint.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

interface CacheEntry<T> {
  v: 1
  ts: number
  data: T
}

const KEY_PREFIX = 'lokshift.cache:'

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || parsed.v !== 1) return null
    return parsed.data
  } catch {
    return null
  }
}

export async function readCacheWithMeta<T>(
  key: string,
): Promise<{ data: T; ts: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (!parsed || parsed.v !== 1) return null
    return { data: parsed.data, ts: parsed.ts }
  } catch {
    return null
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { v: 1, ts: Date.now(), data }
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(entry))
  } catch {
    // Disk full / quota exceeded — non-fatal. The next fetch still works.
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_PREFIX + key)
  } catch {}
}

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const ours = keys.filter((k) => k.startsWith(KEY_PREFIX))
    if (ours.length > 0) await AsyncStorage.multiRemove(ours)
  } catch {}
}
