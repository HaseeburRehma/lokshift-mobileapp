/**
 * Chat attachment upload helper. Mirrors the webapp's
 * lib/chat/storage.ts shape (same bucket name `chat-attachments`, same
 * path layout `attachments/{conversationId}/{ts}-{rnd}.{ext}`) so files
 * uploaded from mobile show up in the web chat exactly the same way.
 *
 * RN can't use the browser `File` object; we read the local URI via
 * fetch().arrayBuffer() and upload bytes directly. The contentType is
 * passed explicitly so the storage policy that whitelists audio/* and
 * image/* doesn't reject recordings that come back as
 * application/octet-stream.
 */

import { getSupabase } from '@/lib/supabase/client'
import type { ChatAttachmentType } from '@/lib/types'

export interface ChatAttachmentSource {
  /** Local file URI from expo-image-picker / expo-document-picker / expo-audio. */
  uri: string
  /** Human-readable name shown in the message bubble. */
  name: string
  /** Best-effort MIME type. Falls back to "application/octet-stream". */
  contentType: string
}

export interface ChatAttachmentUploaded {
  url: string
  name: string
  type: ChatAttachmentType
}

function extFromName(name: string): string | null {
  const i = name.lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return null
  return name.slice(i + 1).toLowerCase()
}

function extFromMime(mime: string): string | null {
  if (!mime) return null
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/aac': 'm4a',
    'audio/m4a': 'm4a',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
  }
  return map[mime] ?? mime.split('/')[1] ?? null
}

function categorize(contentType: string): ChatAttachmentType {
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('audio/')) return 'audio'
  return 'file'
}

export async function uploadChatAttachment(
  source: ChatAttachmentSource,
  conversationId: string,
): Promise<ChatAttachmentUploaded> {
  const supabase = getSupabase()
  const ext = extFromName(source.name) ?? extFromMime(source.contentType) ?? 'bin'
  const stamp = Date.now()
  const rnd = Math.random().toString(36).slice(2, 10)
  const path = `attachments/${conversationId}/${stamp}-${rnd}.${ext}`

  // Read the local URI into binary. RN's fetch handles file://, content://
  // and the in-memory URIs that expo-audio returns.
  const res = await fetch(source.uri)
  if (!res.ok) throw new Error(`Cannot read file (${res.status})`)
  const arrayBuffer = await res.arrayBuffer()

  const { error } = await supabase.storage
    .from('chat-attachments')
    .upload(path, arrayBuffer, {
      contentType: source.contentType || 'application/octet-stream',
      upsert: false,
      cacheControl: '3600',
    })
  if (error) {
    throw new Error(error.message || 'Upload failed')
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('chat-attachments').getPublicUrl(path)

  return {
    url: publicUrl,
    name: source.name,
    type: categorize(source.contentType),
  }
}
