/**
 * Avatar upload helper. Uses Supabase Storage's `avatars` bucket — the
 * same bucket the web app writes to — with a per-user path so the
 * existing RLS policy (`folder = auth.uid()`) keeps each user from
 * overwriting anyone else's image.
 *
 * Returns the public URL with a cache-busting query string so the
 * existing avatar shown elsewhere in the app refreshes immediately
 * after upload (Supabase CDNs the file by URL, so the same URL would
 * otherwise show the old image until the cache expires).
 */

import { getSupabase } from '@/lib/supabase/client'

export interface AvatarUploadResult {
  publicUrl: string
  path: string
}

function extFromContentType(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic' || mime === 'image/heif') return 'heic'
  return 'jpg'
}

export async function uploadAvatar(opts: {
  userId: string
  uri: string
  contentType: string
}): Promise<AvatarUploadResult> {
  const supabase = getSupabase()
  const ext = extFromContentType(opts.contentType)
  const stamp = Date.now()
  const path = `${opts.userId}/avatar-${stamp}.${ext}`

  // Read the local URI into binary. RN's fetch handles file:// and the
  // content:// URIs that expo-image-picker returns.
  const res = await fetch(opts.uri)
  if (!res.ok) throw new Error(`Cannot read picked image (${res.status})`)
  const arrayBuffer = await res.arrayBuffer()

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    contentType: opts.contentType || 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  })
  if (error) throw new Error(error.message || 'Avatar upload failed')

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)

  // Append a cache-buster so consumers re-fetch this exact URL.
  const busted = `${publicUrl}?t=${stamp}`
  return { publicUrl: busted, path }
}
