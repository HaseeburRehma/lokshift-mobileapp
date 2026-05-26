/**
 * Lightweight toast — built on the system Alert so we don't need a third-
 * party toast lib for the MVP. Replace with `react-native-toast-message`
 * later if the UX feels too modal.
 */

import { Alert } from 'react-native'

export const toast = {
  success: (msg: string) => Alert.alert('', msg),
  error:   (msg: string) => Alert.alert('!', msg),
  info:    (msg: string) => Alert.alert('', msg),
}
