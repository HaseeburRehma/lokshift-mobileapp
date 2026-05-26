/**
 * Online-presence hook. Subscribes to a single Supabase presence
 * channel scoped to the user's organisation so every member who has
 * the app open appears in `onlineUserIds`. Tracks the current user's
 * presence automatically on mount.
 *
 * Mirrors the webapp's hooks/chat/usePresence — the channel name and
 * payload shape match so a web tab + a mobile install both show up to
 * each other.
 */

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'

export function usePresence() {
  const supabase = getSupabase()
  const { session, profile } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!orgId || !myId) return
    const channel = supabase.channel(uniqueChannelName(`presence-org:${orgId}`), {
      config: { presence: { key: myId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, unknown>
        setOnlineUserIds(new Set(Object.keys(state)))
      })
      .on('presence', { event: 'join' }, ({ key }: any) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev)
          next.add(key)
          return next
        })
      })
      .on('presence', { event: 'leave' }, ({ key }: any) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: myId, at: Date.now() })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, orgId, myId])

  const isOnline = (userId: string) => onlineUserIds.has(userId)
  return { onlineUserIds, isOnline }
}
