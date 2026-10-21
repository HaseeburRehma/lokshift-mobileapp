/**
 * Personnel documents (Kundenfeedback Punkt 11) — same logic as the
 * webapp's usePersonnelDocuments. Records live in `qualifications`, files
 * in the private bucket `personnel-files` (<org>/<employee>/<file>).
 * Admin/dispatch manage; employees read their own non-confidential ones
 * (enforced by RLS).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as WebBrowser from 'expo-web-browser'
import { getSupabase } from '@/lib/supabase/client'
import { uniqueChannelName } from '@/lib/supabase/channel'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import { toast } from '@/components/Toast'
import { personnelFilePath, type PersonnelDocument } from '@/lib/personnel/documents'
import { dbErrorMessage } from '@/lib/times/entry-status'

const BUCKET = 'personnel-files'
export const MAX_FILE_BYTES = 20 * 1024 * 1024

export interface DocumentInput {
  user_id: string
  name: string
  doc_type: string
  issuer: string | null
  reference: string | null
  issued_at: string | null
  expires_at: string | null
  remark: string | null
  reminder_days: number[]
  is_confidential: boolean
  is_required: boolean
}

/** A file picked with expo-document-picker (or a web File). */
export interface PickedFile {
  uri: string
  name: string
  mimeType: string | null
  size: number | null
  /** Web only — the browser File object. */
  file?: File | null
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = (() => {
  const t = new Uint8Array(256)
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i
  return t
})()

/** Base64 → bytes without relying on atob/Buffer (Hermes-safe). */
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(len)
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean.charCodeAt(i)]
    const b = B64_LOOKUP[clean.charCodeAt(i + 1)]
    const c = B64_LOOKUP[clean.charCodeAt(i + 2)]
    const d = B64_LOOKUP[clean.charCodeAt(i + 3)]
    out[p++] = (a << 2) | (b >> 4)
    if (i + 2 < clean.length) out[p++] = ((b & 15) << 4) | (c >> 2)
    if (i + 3 < clean.length) out[p++] = ((c & 3) << 6) | d
  }
  return out.subarray(0, p)
}

function guessMime(name: string, given: string | null): string {
  if (given) return given
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  return 'image/jpeg'
}

export function usePersonnelDocuments(opts: { employeeId?: string; includeArchived?: boolean } = {}) {
  const supabase = getSupabase()
  const { profile, session } = useUser()
  const myId = session?.user?.id ?? null
  const orgId = profile?.organization_id ?? null
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const suffix = useRef(Math.random().toString(36).slice(2, 8))
  const [documents, setDocuments] = useState<PersonnelDocument[]>([])
  const [loading, setLoading] = useState(true)

  const fetchDocs = useCallback(async () => {
    if (!orgId) {
      setLoading(false)
      return
    }
    let q = supabase
      .from('qualifications')
      .select('*, employee:profiles!user_id(id, full_name)')
      .eq('organization_id', orgId)
      .order('expires_at', { ascending: true, nullsFirst: false })
    if (opts.employeeId) q = q.eq('user_id', opts.employeeId)
    if (!opts.includeArchived) q = q.is('archived_at', null)
    const { data, error } = await q
    if (error) console.warn('[usePersonnelDocuments]', error.message)
    setDocuments((data ?? []) as PersonnelDocument[])
    setLoading(false)
  }, [supabase, orgId, opts.employeeId, opts.includeArchived])

  useEffect(() => {
    fetchDocs()
    if (!orgId) return
    const channel = supabase
      .channel(uniqueChannelName(`personnel-${orgId}-${suffix.current}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'qualifications', filter: `organization_id=eq.${orgId}` }, () => fetchDocs())
      .subscribe()
    return () => {
      try {
        supabase.removeChannel(channel)
      } catch {}
    }
  }, [fetchDocs, orgId, supabase])

  const upload = async (employeeId: string, f: PickedFile, confidential = false) => {
    if (!orgId) throw new Error('no org')
    const path = personnelFilePath(orgId, employeeId, f.name, confidential)
    const contentType = guessMime(f.name, f.mimeType)
    let body: Blob | Uint8Array | File
    if (Platform.OS === 'web' && f.file) body = f.file
    else body = base64ToBytes(await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.Base64 }))
    const { error } = await supabase.storage.from(BUCKET).upload(path, body as any, { contentType, upsert: false })
    if (error) throw error
    return { file_path: path, file_name: f.name }
  }

  const createDocument = async (input: DocumentInput, file?: PickedFile | null, replaces?: PersonnelDocument | null) => {
    if (!orgId) return false
    try {
      // A renewal without a new file must not inherit the old file.
      const fileFields = file ? await upload(input.user_id, file, input.is_confidential) : replaces ? { file_path: null, file_name: null } : {}
      const { data, error } = await supabase
        .from('qualifications')
        .insert({ ...input, ...fileFields, organization_id: orgId, created_by: myId } as any)
        .select('id')
        .single()
      if (error) throw error
      if (replaces) {
        const { error: archErr } = await supabase
          .from('qualifications')
          .update({ archived_at: new Date().toISOString(), replaced_by: (data as { id: string }).id } as any)
          .eq('id', replaces.id)
        if (archErr) throw archErr
      }
      toast.success(replaces ? L('Nachweis erneuert – alte Frist erledigt', 'Document renewed – old deadline closed') : L('Nachweis gespeichert', 'Document saved'))
      await fetchDocs()
      return true
    } catch (err) {
      toast.error(dbErrorMessage(err as any, locale, L('Nachweis konnte nicht gespeichert werden', 'Could not save document')))
      return false
    }
  }

  const updateDocument = async (id: string, input: DocumentInput, file?: PickedFile | null) => {
    try {
      const fileFields = file ? await upload(input.user_id, file, input.is_confidential) : {}
      const { error } = await supabase
        .from('qualifications')
        .update({ ...input, ...fileFields, updated_at: new Date().toISOString() } as any)
        .eq('id', id)
      if (error) throw error
      toast.success(L('Nachweis aktualisiert', 'Document updated'))
      await fetchDocs()
      return true
    } catch (err) {
      toast.error(dbErrorMessage(err as any, locale, L('Änderung konnte nicht gespeichert werden', 'Could not save changes')))
      return false
    }
  }

  const deleteDocument = async (doc: PersonnelDocument) => {
    const { error } = await supabase.from('qualifications').delete().eq('id', doc.id)
    if (error) {
      toast.error(dbErrorMessage(error, locale, L('Löschen fehlgeschlagen', 'Delete failed')))
      return false
    }
    if (doc.file_path) await supabase.storage.from(BUCKET).remove([doc.file_path])
    toast.success(L('Nachweis gelöscht', 'Document deleted'))
    await fetchDocs()
    return true
  }

  /** Short-lived signed link — the bucket is private. */
  const openFile = async (doc: PersonnelDocument) => {
    let url: string | null = null
    if (doc.file_path) {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path, 120)
      if (error || !data?.signedUrl) {
        toast.error(L('Datei konnte nicht geöffnet werden', 'Could not open file'))
        return
      }
      url = data.signedUrl
    } else if (doc.document_url) {
      url = doc.document_url
    }
    if (!url) return
    try {
      await WebBrowser.openBrowserAsync(url)
    } catch {
      toast.error(L('Datei konnte nicht geöffnet werden', 'Could not open file'))
    }
  }

  return { documents, loading, refetch: fetchDocs, createDocument, updateDocument, deleteDocument, openFile }
}
