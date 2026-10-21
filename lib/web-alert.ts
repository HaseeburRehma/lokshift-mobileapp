/**
 * React Native Web ships `Alert.alert` as a no-op, so every confirmation
 * ("Löschen?", "Trotzdem umverteilen?") silently did nothing in the web
 * build. On web only, map it to the browser's dialogs and call the handler
 * of the chosen button. Native iOS/Android keep the real Alert.
 *
 *   1 button / none → window.alert, then that button's onPress
 *   2 buttons       → window.confirm: OK = the non-cancel button
 *   3+ buttons      → one confirm per option in order; the first accepted
 *                     option runs, otherwise the cancel button
 */

import { Alert, Platform, type AlertButton } from 'react-native'

let installed = false

export function installWebAlert() {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return
  installed = true
  ;(Alert as unknown as { alert: typeof Alert.alert }).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n')
    const list = buttons ?? []
    if (list.length <= 1) {
      window.alert(text)
      list[0]?.onPress?.()
      return
    }
    const cancel = list.find((b) => b.style === 'cancel')
    const options = list.filter((b) => b !== cancel)
    if (options.length === 1) {
      if (window.confirm(text)) options[0].onPress?.()
      else cancel?.onPress?.()
      return
    }
    for (const option of options) {
      if (window.confirm(`${text}\n\n→ ${option.text ?? 'OK'}?`)) {
        option.onPress?.()
        return
      }
    }
    cancel?.onPress?.()
  }
}
