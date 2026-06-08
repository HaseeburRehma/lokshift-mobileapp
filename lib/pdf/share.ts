/**
 * Cross-platform PDF rendering + sharing.
 *
 * Native (iOS / Android):
 *   - `expo-print.printToFileAsync` → PDF file on disk → renamed →
 *     handed to the system share sheet via `expo-sharing`.
 *
 * Web:
 *   - `Print.printToFileAsync` is NOT implemented in expo-print on web
 *     — it returns `undefined`, so the previous code crashed with
 *     "Cannot destructure property 'uri' of '(intermediate value)' as
 *     it is undefined". Real browser PDFs need a different path:
 *     open the HTML in a new window, auto-trigger `window.print()`,
 *     and the user's browser shows the native Save-as-PDF dialog.
 *
 * Same call signature on every platform so the report screens don't
 * have to branch on Platform.OS themselves.
 */

import { Platform } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { format } from 'date-fns'

export interface RenderAndShareOpts {
  /** Full HTML document — already wrapped in <!doctype html>…</html>. */
  html: string
  /** Filename without extension. A YYYY-MM-DD stamp is appended. */
  filenameBase: string
  /** Localised dialog title on the share sheet (native only). */
  dialogTitle?: string
}

const PDF_MIME = 'application/pdf'

async function ensureCanShare(): Promise<boolean> {
  try {
    return await Sharing.isAvailableAsync()
  } catch {
    return false
  }
}

/**
 * Render + share a PDF from an HTML document. Returns the resulting
 * file URI on native, or the blob URL on web (the auto-print dialog
 * has already opened).
 */
export async function renderAndSharePdf(opts: RenderAndShareOpts): Promise<string> {
  const stamp = format(new Date(), 'yyyy-MM-dd')
  const filename = `${opts.filenameBase}_${stamp}.pdf`

  if (Platform.OS === 'web') {
    return renderAndPrintWeb(opts.html, filename)
  }

  // Native path — unchanged behaviour.
  const result = await Print.printToFileAsync({ html: opts.html, base64: false })
  // Defensive: expo-print on some platforms might not return the uri
  // (e.g. permission denied silently). Fall back to a helpful error
  // instead of the cryptic destructure crash.
  if (!result || !result.uri) {
    throw new Error(
      'PDF generation failed — the print module returned no file. ' +
        'On web this is expected; the Save-as-PDF dialog opens directly. ' +
        'On native, check that expo-print + expo-sharing are linked.',
    )
  }
  const targetDir =
    (FileSystem as any).cacheDirectory ?? (FileSystem as any).documentDirectory
  const finalUri = targetDir ? `${targetDir}${filename}` : result.uri
  try {
    if (targetDir) {
      await (FileSystem as any).moveAsync({ from: result.uri, to: finalUri })
    }
  } catch {
    // Rename is best-effort; the temp uri also works for sharing.
  }

  if (await ensureCanShare()) {
    await Sharing.shareAsync(finalUri, {
      mimeType: PDF_MIME,
      dialogTitle: opts.dialogTitle ?? 'PDF',
      UTI: 'com.adobe.pdf',
    })
  }
  return finalUri
}

/**
 * Web-only path. Opens the HTML in a new window and triggers
 * `window.print()` so the browser shows its native Save-as-PDF dialog.
 * The user gets a real PDF download via the browser (no external lib).
 */
function renderAndPrintWeb(html: string, filename: string): string {
  // SSR guard — should never run during build, but be defensive.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('PDF export requires a browser window.')
  }

  // Encode title into the HTML so the browser's Save-as-PDF dialog
  // pre-fills with our filename.
  const titledHtml = html.replace(
    /<head>/i,
    `<head><title>${escapeHtmlAttr(filename.replace(/\.pdf$/, ''))}</title>`,
  )

  // Use a Blob URL so the new window has a real document URL — required
  // for window.print() to work on Safari + Chrome's strictest popup
  // blockers. Fall back to data: URL when Blob URL is blocked.
  let url: string
  try {
    const blob = new Blob([titledHtml], { type: 'text/html;charset=utf-8' })
    url = URL.createObjectURL(blob)
  } catch {
    url = `data:text/html;charset=utf-8,${encodeURIComponent(titledHtml)}`
  }

  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    // Popup blocked. Fall back to a same-tab download of the HTML
    // (better than silent failure).
    const a = document.createElement('a')
    a.href = url
    a.download = filename.replace(/\.pdf$/, '.html')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    throw new Error(
      'Browser blocked the print popup. The report was downloaded as HTML instead — open it and use File → Print → Save as PDF.',
    )
  }

  // Auto-fire the print dialog once the new window has loaded the HTML.
  // Some browsers run scripts before the parent has finished writing —
  // wait one frame for safety. The user can also Ctrl/Cmd+P manually.
  try {
    win.addEventListener('load', () => {
      try {
        win.focus()
        win.print()
      } catch {
        // ignore — user can still trigger print manually
      }
    })
  } catch {
    // Same-origin policy might restrict listener attachment — that's
    // fine, the print toolbar is still one keyboard shortcut away.
  }

  // Release the blob URL after a delay so the new window has time to
  // load it but we don't leak memory across many exports.
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }, 60_000)

  return url
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
