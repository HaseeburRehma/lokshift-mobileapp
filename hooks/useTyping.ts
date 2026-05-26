/**
 * Typing-indicator hook. Broadcasts "I'm typing" events on a
 * per-conversation Supabase channel; tracks which other users have
 * sent a "typing" event in the last ~3 seconds.
 *
 * Usage:
 *   const { typingUserIds, broadcastTyping } = useTyping(conversationId)
 *   onChangeText: () => broadcastTyping()
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'

const TYPING_WINDOW_MS = 3500

export function useTyping(conversationId: string | null) {
  const supabase = getSupabase()
  const { session } = useUser()
  const myId = session?.user?.id ?? null

  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set())
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastSentRef = useRef(0)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    if (!conversationId || !myId) return
    const channel = supabase.channel(uniqueChannelName(`typing:${conversationId}`))

    channel
      .on('broadcast', { event: 'typing' }, (payload: any) => {
        const uid = payload?.payload?.user_id as string | undefined
        if (!uid || uid === myId) return

        setTypingUserIds((prev) => {
          const next = new Set(prev)
          next.add(uid)
          return next
        })

        // Auto-clear after the window.
        const existing = timersRef.current.get(uid)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          setTypingUserIds((prev) => {
            const next = new Set(prev)
            next.delete(uid)
            return next
          })
          timersRef.current.delete(uid)
        }, TYPING_WINDOW_MS)
        timersRef.current.set(uid, timer)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t))
      timersRef.current.clear()
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [supabase, conversationId, myId])

  const broadcastTyping = useCallback(() => {
    if (!conversationId || !myId || !channelRef.current) return
    const now = Date.now()
    // Throttle: at most once every 1.5s so we don't spam.
    if (now - lastSentRef.current < 1500) return
    lastSentRef.current = now
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: myId },
    })
  }, [conversationId, myId])

  return { typingUserIds, broadcastTyping }
}
