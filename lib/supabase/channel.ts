/**
 * Helper for creating unique Supabase Realtime channel names.
 *
 * Why: `supabase.channel(name)` keeps a registry keyed by name. If the
 * effect that creates a channel re-runs (React StrictMode in dev does
 * this on purpose, and any state-driven re-mount in production does
 * too), the second call returns the SAME channel instance — and that
 * instance is already in the SUBSCRIBED state. Calling `.on()` on it
 * then throws:
 *
 *   "cannot add `postgres_changes` callbacks for realtime:<name>
 *    after `subscribe()`."
 *
 * The fix is trivially "give each mount a unique name". We append a
 * monotonic counter + timestamp so the realtime server sees them as
 * distinct topics, removeChannel() still works, and the cleanup runs
 * cleanly even when two effect cycles overlap briefly.
 */

let counter = 0

/**
 * Produce a unique channel name from a stable base.
 * Example:
 *   uniqueChannelName(`chat-conversations:${userId}`)
 *     → `chat-conversations:abc-123::1748147211948-7`
 */
export function uniqueChannelName(base: string): string {
  counter += 1
  return `${base}::${Date.now()}-${counter}`
}
