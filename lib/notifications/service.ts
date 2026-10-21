/**
 * Notifications from the app — same API as the webapp's
 * lib/notifications/service.ts. Every call goes to the webapp route
 * /api/notifications/dispatch (Bearer token), which writes the in-app row
 * and sends email + push server-side. If the route is unreachable the
 * in-app row is written directly so the message is never lost.
 */

import { getSupabase } from '@/lib/supabase/client'
import { webappPath } from '@/lib/webapp-url'

export type NotificationModule =
  | 'plans'
  | 'customers'
  | 'calendar'
  | 'shifts'
  | 'time_entries'
  | 'corrections'
  | 'personnel'
  | 'bonuses'
  | 'per_diem'
  | 'absence'
  | 'system'
  | 'chat'

export interface CreateNotificationParams {
  userId: string
  title: string
  message: string
  module: NotificationModule
  moduleId?: string
  link?: string
  skipEmail?: boolean
  skipPush?: boolean
}

interface DispatchBody {
  recipients: string[] | 'managers'
  title: string
  message: string
  module: NotificationModule
  moduleId?: string
  link?: string
  email?: boolean
  push?: boolean
}

const DISPATCH_TIMEOUT_MS = 8000

/** Active admins + dispatchers of the caller's organisation (caller excluded). */
async function managerIdsOfMyOrg(): Promise<string[]> {
  const supabase = getSupabase()
  const { data: auth } = await supabase.auth.getSession()
  const me = auth?.session?.user?.id
  if (!me) return []
  const { data: mine } = await supabase.from('profiles').select('organization_id').eq('id', me).maybeSingle()
  const org = (mine as { organization_id?: string } | null)?.organization_id
  if (!org) return []
  const { data } = await supabase.from('profiles').select('id, role, is_active').eq('organization_id', org)
  return ((data ?? []) as Array<{ id: string; role: string | null; is_active: boolean | null }>)
    .filter((p) => ['admin', 'administrator', 'dispatcher'].includes(String(p.role ?? '').toLowerCase()) && p.is_active !== false && p.id !== me)
    .map((p) => p.id)
}

/** In-app rows only — used when the webapp route is unreachable. */
async function fallbackInsert(body: DispatchBody) {
  const recipients = body.recipients === 'managers' ? await managerIdsOfMyOrg() : body.recipients
  if (recipients.length === 0) return
  await getSupabase().from('notifications').insert(
    recipients.map((uid) => ({
      user_id: uid,
      title: body.title,
      message: body.message,
      module_type: body.module,
      module_id: body.moduleId ?? null,
      link: body.link ?? null,
      is_read: false,
    })) as any,
  )
}

async function writeFallback(body: DispatchBody) {
  try {
    await fallbackInsert(body)
  } catch (err) {
    console.warn('[notifications] fallback insert failed', err)
  }
}

/**
 * Sends via the webapp (in-app + email + push). Never hangs longer than
 * DISPATCH_TIMEOUT_MS. If the route is unreachable, times out or fails on
 * the server side (404/5xx), the in-app row is written directly so the
 * message isn't lost. Rejections by policy (401/403/429) are not bypassed.
 */
async function post(body: DispatchBody): Promise<{ success: boolean }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DISPATCH_TIMEOUT_MS)
  try {
    const { data } = await getSupabase().auth.getSession()
    const token = data?.session?.access_token
    if (!token) return { success: false }
    const res = await fetch(webappPath('/api/notifications/dispatch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (res.ok) return { success: true }
    console.warn('[notifications] dispatch failed', res.status)
    if (res.status === 404 || res.status >= 500) await writeFallback(body)
    return { success: false }
  } catch (e) {
    console.warn('[notifications] dispatch unreachable, writing in-app row only', e)
    await writeFallback(body)
    return { success: false }
  } finally {
    clearTimeout(timer)
  }
}

export function sendNotification(p: CreateNotificationParams) {
  return post({
    recipients: [p.userId],
    title: p.title,
    message: p.message,
    module: p.module,
    moduleId: p.moduleId,
    link: p.link,
    email: !p.skipEmail,
    push: !p.skipPush,
  })
}

export function sendNotificationToMany(userIds: string[], p: Omit<CreateNotificationParams, 'userId'>) {
  if (userIds.length === 0) return Promise.resolve({ success: true })
  return post({
    recipients: userIds,
    title: p.title,
    message: p.message,
    module: p.module,
    moduleId: p.moduleId,
    link: p.link,
    email: !p.skipEmail,
    push: !p.skipPush,
  })
}

/** All admins + dispatchers of the caller's organisation (caller excluded). */
export function notifyManagers(p: Omit<CreateNotificationParams, 'userId'>) {
  return post({
    recipients: 'managers',
    title: p.title,
    message: p.message,
    module: p.module,
    moduleId: p.moduleId,
    link: p.link,
    email: !p.skipEmail,
    push: !p.skipPush,
  })
}
