/**
 * CSV writer — used by the Plans list (and any other "download CSV"
 * surfaces). Writes a BOM-prefixed UTF-8 CSV to the cache dir and hands
 * it to the native share sheet, matching the PDF/Excel flow.
 */

import * as FileSystem from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { format } from 'date-fns'

type Cell = string | number | null | undefined

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return '""'
  const str = String(value).replace(/"/g, '""')
  return `"${str}"`
}

export interface CsvExportOpts {
  headers: string[]
  rows: Cell[][]
  filename: string
  dialogTitle?: string
}

export async function exportCsv(opts: CsvExportOpts): Promise<string> {
  const lines: string[] = []
  lines.push(opts.headers.map(escapeCell).join(','))
  for (const r of opts.rows) lines.push(r.map(escapeCell).join(','))
  // UTF-8 BOM so Excel auto-detects encoding when opening the file.
  const csv = '﻿' + lines.join('\n')

  const stamp = format(new Date(), 'yyyy-MM-dd')
  const filename = `${opts.filename}_${stamp}.csv`
  const targetDir = (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  if (!targetDir) throw new Error('No writable directory available')
  const uri = `${targetDir}${filename}`

  await (FileSystem as any).writeAsStringAsync(uri, csv, {
    encoding: (FileSystem as any).EncodingType?.UTF8 ?? 'utf8',
  })

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        dialogTitle: opts.dialogTitle ?? 'CSV',
        UTI: 'public.comma-separated-values-text',
      })
    }
  } catch {
    // Best-effort: even without share sheet, the file exists at `uri`.
  }
  return uri
}
