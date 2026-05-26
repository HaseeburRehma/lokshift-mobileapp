/**
 * Biometric helpers — capability detection, opt-in flag, and the
 * authentication prompt. Keeps the concrete expo-local-authentication
 * surface in one place so consumers (lock context, settings toggle) can
 * mock or replace it cleanly.
 */

import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'lokshift.biometric.enabled'

export interface BiometricSupport {
  /** True when the device has a fingerprint reader / Face ID hardware. */
  hasHardware: boolean
  /** True when the user has at least one biometric template enrolled. */
  enrolled: boolean
  /** Raw enum values returned by expo-local-authentication. */
  types: LocalAuthentication.AuthenticationType[]
}

export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ])
    return { hasHardware, enrolled, types }
  } catch {
    return { hasHardware: false, enrolled: false, types: [] }
  }
}

/** True when the user has opted-in via the security settings toggle. */
export async function isBiometricEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEY)
  return v === '1'
}

export async function setBiometricEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, value ? '1' : '0')
}

/**
 * Prompt for biometric authentication. Falls back to the device passcode
 * when the user taps "Use code" on iOS (or after a configurable number
 * of failed Face ID attempts).
 */
export async function authenticate(
  promptMessage: string,
  options?: {
    cancelLabel?: string
    fallbackLabel?: string
    disableDeviceFallback?: boolean
  },
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: options?.cancelLabel,
      fallbackLabel: options?.fallbackLabel,
      disableDeviceFallback: options?.disableDeviceFallback ?? false,
    })
    return result.success
  } catch {
    return false
  }
}

/** Human-readable label for the device's primary biometric, used in UI hints. */
export function describeBiometric(
  support: BiometricSupport,
  locale: 'de' | 'en' = 'de',
): string {
  const has = (t: LocalAuthentication.AuthenticationType) => support.types.includes(t)
  if (has(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return locale === 'de' ? 'Face ID' : 'Face ID'
  }
  if (has(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return locale === 'de' ? 'Fingerabdruck' : 'Fingerprint'
  }
  if (has(LocalAuthentication.AuthenticationType.IRIS)) {
    return locale === 'de' ? 'Iris-Scan' : 'Iris scan'
  }
  return locale === 'de' ? 'Biometrie' : 'Biometric'
}
