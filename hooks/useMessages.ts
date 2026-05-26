/**
 * Messages hook for a single conversation. Mirrors the webapp's
 * hooks/chat/useMessages with two adjustments for mobile:
 *   - no browser-notification fallback (RN uses expo-notifications for
 *     OS push instead — wired separately)
 *   - the broadcast channel uses the same name so an open thread on
 *     web and a thread on mobile sync instantly
 *
 * Behavior:
 *   - fetches messages once on mount, ordered ascending
 *   - marks the conversation as read on open and on each incoming
 *     message
 *   - dedupes optimistic vs real messages by replacing the temp id
 *   - falls back to a 10-second poll if realtime drops
 *   - fans out in-app notifications to other members on send
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { ChatMessage, ChatAttachmentType } from '@/lib/types'

export interface SendAttachment {
  url: string
  type: ChatAttachmentType
  name: string
}

export function useMessages(conversationId: string | null) {
  const supabase = getSupabase()
  const { session, profile } = useUser()
  const myId = session?.user?.id ?? null
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const myIdRef = useRef(myId)
  myIdRef.current = myId

  const markAsRead = useCallback(async () => {
    if (!conversationId || !myIdRef.current) return
    await supabase
      .from('chat_members')
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq('conversation_id', conversationId)
      .eq('user_id', myIdRef.current)
  }, [supabase, conversationId])

  const addOrReplace = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      // Replace optimistic copy from same sender if present.
      const idx = prev.findIndex(
        (m) => m.id.startsWith('optimistic-') && m.sender_id === msg.sender_id,
      )
      if (idx !== -1) {
        const next = [...prev]
        next[idx] = { ...next[idx], ...msg }
        return next
      }
      return [...prev, msg]
    })
  }, [])

  const hydrateSender = useCallback(
    (msgId: string, senderId: string) => {
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .eq('id', senderId)
        .single()
        .then(({ data }: any) => {
          if (data) {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, sender: data } : m)),
            )
          }
        })
    },
    [supabase],
  )

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }
    setLoading(true)

    let cancelled = false

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(
          '*, sender:profiles!sender_id(id, full_name, avatar_url, role)',
        )
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
      if (cancelled) return
      if (error) {
        console.warn('[useMessages] fetch failed', error.message)
      } else {
        setMessages((data ?? []) as ChatMessage[])
      }
      setLoading(false)
      markAsRead()
    }

    fetchMessages()

    const dbChannel = supabase
      .channel(uniqueChannelName(`chat-db:${conversationId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload: any) => {
          const m = payload.new as ChatMessage
          if (m.conversation_id !== conversationId) return
          addOrReplace(m)
          hydrateSender(m.id, m.sender_id)
          markAsRead()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
        (payload: any) => {
          const m = payload.new as ChatMessage
          if (m.conversation_id !== conversationId) return
          setMessages((prev) =>
            prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)),
          )
        },
      )
      .subscribe()

    const broadcast = supabase
      .channel(uniqueChannelName(`chat-broadcast:${conversationId}`))
      .on('broadcast', { event: 'new_message' }, (payload: any) => {
        const m = payload.payload as ChatMessage
        if (!m?.id) return
        addOrReplace(m)
        hydrateSender(m.id, m.sender_id)
        markAsRead()
      })
      .subscribe()

    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select(
          '*, sender:profiles!sender_id(id, full_name, avatar_url, role)',
        )
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
      if (!data || cancelled) return
      setMessages((prev) => {
        if (data.length !== prev.length) return data as ChatMessage[]
        const lastNew = data[data.length - 1] as ChatMessage
        const lastPrev = prev[prev.length - 1]
        if (lastNew?.id !== lastPrev?.id) return data as ChatMessage[]
        return prev
      })
    }, 10_000)

    return () => {
      cancelled = true
      supabase.removeChannel(dbChannel)
      supabase.removeChannel(broadcast)
      clearInterval(poll)
    }
  }, [supabase, conversationId, addOrReplace, hydrateSender, markAsRead])

  const sendMessage = useCallback(
    async (content: string, attachment?: SendAttachment) => {
      if (!conversationId || !myIdRef.current) return

      const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimistic: ChatMessage = {
        id: optimisticId,
        conversation_id: conversationId,
        sender_id: myIdRef.current,
        content: content || null,
        attachment_url: attachment?.url ?? null,
        attachment_type: attachment?.type ?? null,
        attachment_name: attachment?.name ?? null,
        is_deleted: false,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimistic])

      const insertPayload: Record<string, unknown> = {
        conversation_id: conversationId,
        sender_id: myIdRef.current,
        content: content || null,
      }
      if (attachment) {
        insertPayload.attachment_url = attachment.url
        insertPayload.attachment_type = attachment.type
        insertPayload.attachment_name = attachment.name
      }

      const { data: inserted, error } = await supabase
        .from('chat_messages')
        .insert(insertPayload as any)
        .select('*')
        .single()

      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        throw error
      }

      if (inserted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId ? { ...m, id: (inserted as any).id } : m,
          ),
        )

        // Broadcast to peers.
        const bc = supabase.channel(uniqueChannelName(`chat-broadcast:${conversationId}`))
        await bc.subscribe()
        await bc.send({
          type: 'broadcast',
          event: 'new_message',
          payload: inserted,
        })
        supabase.removeChannel(bc)

        // Fan-out in-app notifications.
        try {
          const { data: members } = await supabase
            .from('chat_members')
            .select('user_id')
            .eq('conversation_id', conversationId)
          const recipients = (members ?? [])
            .map((m: any) => m.user_id)
            .filter((uid: string) => uid !== myIdRef.current)
          if (recipients.length > 0) {
            const senderName = profile?.full_name ?? profile?.email ?? 'Mitarbeiter'
            const body =
              content && content.trim()
                ? content.length > 80
                  ? `${content.slice(0, 77)}…`
                  : content
                : attachment?.type === 'image'
                ? '📷 Bild'
                : attachment?.type === 'audio'
                ? '🎤 Sprachnachricht'
                : attachment?.type === 'file'
                ? `📎 ${attachment.name}`
                : ''
            await Promise.all(
              recipients.map((uid: string) =>
                supabase
                  .from('notifications')
                  .insert({
                    user_id: uid,
                    title: `💬 Neue Nachricht von ${senderName}`,
                    body,
                    type: 'chat',
                    is_read: false,
                  } as any),
              ),
            )
          }
        } catch (e) {
          console.warn('[useMessages] notification fanout failed (non-fatal):', e)
        }
      }

      // Bump updated_at so the conversation jumps to the top of the list.
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() } as any)
        .eq('id', conversationId)
    },
    [supabase, conversationId, profile?.full_name, profile?.email],
  )

  return { messages, loading, sendMessage, markAsRead }
}
