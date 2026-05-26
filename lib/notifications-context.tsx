/**
 * Notifications context — single source of truth for the in-app feed.
 *
 * Why a context (and not a hook): the old `useNotifications` hook ran
 * its own fetch + Supabase realtime subscription per instance. The
 * moment two components called it (NotificationsScreen + the AppHeader
 * unread badge), Supabase's `.channel(name)` returned the existing
 * channel and adding new `.on()` callbacks after `.subscribe()` threw:
 *
 *     Error: cannot add `postgres_changes` callbacks for
 *     realtime:mobile-notifications-... after `subscribe()`.
 *
 * The fix is to centralise: one subscription per user, all consumers
 * read from shared state. Mounted at the root layout below
 * UserProvider so the session is available. Cheaper too — one websocket
 * channel instead of N.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import type { NotificationRow } from '@/lib/types'

interface NotificationsContextValue {
  notifications: NotificationRow[]
  unreadCount: number
  loading: boolean
  markAllAsRead: () => Promise<void>
  markAsRead: (id: string) => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase()
  const { session } = useUser()
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)

  const myId = session?.user?.id

  const fetch = useCallback(async () => {
    if (!myId) {
      setNotifications([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', myId)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      console.warn('[NotificationsContext] fetch failed:', error.message)
    } else {
      setNotifications((data ?? []) as NotificationRow[])
    }
    setLoading(false)
  }, [supabase, myId])

  // Subscribe once per user — re-fires only when myId changes (login/logout).
  useEffect(() => {
    if (!myId) {
      setNotifications([])
      setLoading(false)
      return
    }
    fetch()
    const channel = supabase
      .channel(uniqueChannelName(`notifications-${myId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        (payload: any) => {
          setNotifications((prev) => {
            if (prev.some((n) => n.id === (payload.new as any).id)) return prev
            return [payload.new as NotificationRow, ...prev]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        (payload: any) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === (payload.new as any).id ? (payload.new as NotificationRow) : n)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` },
        (payload: any) => {
          setNotifications((prev) => prev.filter((n) => n.id !== (payload.old as any).id))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, myId, fetch])

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic — flip is_read locally first, then write.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    if (error) {
      console.warn('[NotificationsContext] markAsRead failed:', error.message)
    }
  }, [supabase])

  const markAllAsRead = useCallback(async () => {
    if (!myId) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', myId)
      .eq('is_read', false)
    if (error) console.warn('[NotificationsContext] markAllAsRead failed:', error.message)
  }, [supabase, myId])

  const deleteNotification = useCallback(async (id: string) => {
    const previous = notifications
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) {
      console.warn('[NotificationsContext] delete failed:', error.message)
      setNotifications(previous)
    }
  }, [supabase, notifications])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  )

  const value = useMemo<NotificationsContextValue>(
    () => ({ notifications, unreadCount, loading, markAllAsRead, markAsRead, deleteNotification, refetch: fetch }),
    [notifications, unreadCount, loading, markAllAsRead, markAsRead, deleteNotification, fetch],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext)
  if (!ctx) {
    // Safe fallback so callers don't crash if the provider is missing
    // (e.g. preview tools or sub-trees that don't sit under the root).
    return {
      notifications: [],
      unreadCount: 0,
      loading: false,
      markAllAsRead: async () => {},
      markAsRead: async () => {},
      deleteNotification: async () => {},
      refetch: async () => {},
    }
  }
  return ctx
}
