/**
 * Conversations list hook — mirrors the webapp's hooks/chat/useConversations.
 *
 * Returns the user's conversations with members, last message, and
 * unread count. Subscribes to realtime on chat_conversations,
 * chat_messages (INSERT only), and chat_members (insert/update/delete
 * filtered to the current user) so the list refreshes when:
 *   - a new conversation is created
 *   - someone sends a message
 *   - the current user is added to a chat
 *   - last_read_at on the user's chat_members row changes
 *
 * Also includes a 15-second polling fallback in case realtime drops
 * (mobile background, network blip).
 */

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { ChatConversation, ChatMember, ChatMessage } from '@/lib/types'

type ConvRow = ChatConversation & {
  members?: (ChatMember & { profile?: any })[]
  messages?: ChatMessage[]
}

export function useConversations() {
  const supabase = getSupabase()
  const { session, profile } = useUser()
  const myId = session?.user?.id ?? null
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchConversations = useCallback(
    async (silent = false) => {
      if (!myId) return
      if (!silent) setLoading(true)

      const { data, error } = await supabase
        .from('chat_conversations')
        .select(
          `
          *,
          members:chat_members(*, profile:profiles(id, full_name, avatar_url, role, email)),
          messages:chat_messages(*)
        `,
        )
        .order('updated_at', { ascending: false })

      if (error) {
        console.warn('[useConversations] fetch failed', error.message)
        setLoading(false)
        return
      }

      const mine = ((data ?? []) as ConvRow[]).filter((c) =>
        c.members?.some((m) => m.user_id === myId),
      )

      const enriched = await Promise.all(
        mine.map(async (c) => {
          let unread = 0
          try {
            const { data: count } = await supabase.rpc('get_unread_count', {
              p_conversation_id: c.id,
              p_user_id: myId,
            })
            unread = (count as number) || 0
          } catch {
            // RPC missing — compute client-side from last_read_at.
            const myMember = c.members?.find((m) => m.user_id === myId)
            const since = myMember?.last_read_at
            if (since) {
              unread = (c.messages ?? []).filter(
                (m) =>
                  new Date(m.created_at).getTime() > new Date(since).getTime() &&
                  m.sender_id !== myId,
              ).length
            }
          }
          const sorted = [...(c.messages ?? [])].sort(
            (a, b) =>
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          )
          return {
            ...c,
            unread_count: unread,
            last_message: sorted[0],
          } as ChatConversation
        }),
      )
      setConversations(enriched)
      setLoading(false)
    },
    [supabase, myId],
  )

  useEffect(() => {
    if (!myId) return
    fetchConversations()

    const channel = supabase
      .channel(uniqueChannelName(`chat-conversations:${myId}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => fetchConversations(true),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        () => fetchConversations(true),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${myId}`,
        },
        () => fetchConversations(true),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${myId}`,
        },
        () => fetchConversations(true),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'chat_members',
          filter: `user_id=eq.${myId}`,
        },
        () => fetchConversations(true),
      )
      .subscribe()

    // Belt-and-suspenders fallback poll.
    const poll = setInterval(() => fetchConversations(true), 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [supabase, myId, fetchConversations])

  /**
   * Find an existing 1-on-1 chat between the current user and `otherId`,
   * or create a new one. The web uses the same pattern and relies on
   * RLS to keep the membership rows scoped correctly.
   */
  const getOrCreateDm = useCallback(
    async (otherId: string): Promise<string> => {
      if (!myId || !profile?.organization_id) throw new Error('Not authenticated')

      // Look for an existing 1-on-1 conversation.
      // We list all my conversations and find one where the only other
      // member is `otherId` AND it's not a group chat.
      const existing = conversations.find((c) => {
        if (c.is_group) return false
        const memberIds = (c.members ?? []).map((m) => m.user_id)
        return (
          memberIds.length === 2 &&
          memberIds.includes(myId) &&
          memberIds.includes(otherId)
        )
      })
      if (existing) return existing.id

      // Create.
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({
          organization_id: profile.organization_id,
          is_group: false,
          created_by: myId,
        } as any)
        .select('id')
        .single()
      if (convErr || !newConv) throw convErr ?? new Error('Failed to create chat')

      const id = (newConv as any).id as string
      const { error: memErr } = await supabase.from('chat_members').insert([
        { conversation_id: id, user_id: myId, role: 'admin' },
        { conversation_id: id, user_id: otherId, role: 'member' },
      ] as any)
      if (memErr) throw memErr

      return id
    },
    [supabase, myId, profile?.organization_id, conversations],
  )

  const createGroup = useCallback(
    async (name: string, memberIds: string[]): Promise<string> => {
      if (!myId || !profile?.organization_id) throw new Error('Not authenticated')
      const { data: newConv, error: convErr } = await supabase
        .from('chat_conversations')
        .insert({
          organization_id: profile.organization_id,
          is_group: true,
          name,
          created_by: myId,
        } as any)
        .select('id')
        .single()
      if (convErr || !newConv) throw convErr ?? new Error('Failed to create group')
      const id = (newConv as any).id as string
      const uniqueMembers = Array.from(new Set([myId, ...memberIds]))
      const rows = uniqueMembers.map((uid) => ({
        conversation_id: id,
        user_id: uid,
        role: uid === myId ? 'admin' : 'member',
      }))
      const { error: memErr } = await supabase.from('chat_members').insert(rows as any)
      if (memErr) throw memErr
      return id
    },
    [supabase, myId, profile?.organization_id],
  )

  return { conversations, loading, refresh: fetchConversations, getOrCreateDm, createGroup }
}
