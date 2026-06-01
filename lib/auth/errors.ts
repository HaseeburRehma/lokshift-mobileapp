/**
 * Translate Supabase auth errors into user-friendly toast messages.
 *
 * Supabase exposes the raw text from gotrue ("Invalid login credentials",
 * "Email rate limit exceeded", etc.). Surfacing those directly is bad UX
 * AND a small security leak — distinct messages for "user doesn't exist"
 * vs "wrong password" enable account enumeration. We collapse the
 * common cases into a single localized message.
 */

import type { Locale } from '@/lib/i18n'

interface AuthErrorLike {
  message?: string | null
  status?: number | null
  name?: string | null
  code?: string | null
}

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'email_not_confirmed'
  | 'user_disabled'
  | 'network'
  | 'unknown'

export function classifyAuthError(err: AuthErrorLike | null | undefined): AuthErrorKind {
  if (!err) return 'unknown'
  const status = err.status ?? 0
  const msg = (err.message ?? '').toLowerCase()
  const code = (err.code ?? '').toLowerCase()

  // Network / fetch failure (Supabase wraps the original `TypeError`).
  if (msg.includes('failed to fetch') || msg.includes('network') || err.name === 'TypeError') {
    return 'network'
  }
  // Rate limited — gotrue returns 429.
  if (status === 429 || msg.includes('rate limit') || code.includes('rate_limited')) {
    return 'rate_limited'
  }
  // Email not confirmed.
  if (
    msg.includes('email not confirmed') ||
    msg.includes('confirm your email') ||
    code === 'email_not_confirmed'
  ) {
    return 'email_not_confirmed'
  }
  // Deactivated / banned.
  if (msg.includes('user disabled') || msg.includes('user banned') || code === 'user_disabled') {
    return 'user_disabled'
  }
  // The catch-all for wrong creds — also covers "user not found" so we
  // don't accidentally enable account enumeration.
  if (
    status === 400 ||
    status === 401 ||
    msg.includes('invalid login credentials') ||
    msg.includes('invalid email or password') ||
    code === 'invalid_credentials'
  ) {
    return 'invalid_credentials'
  }
  return 'unknown'
}

export function authErrorMessage(kind: AuthErrorKind, locale: Locale): string {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  switch (kind) {
    case 'invalid_credentials':
      return L('E-Mail oder Passwort ist falsch.', 'Email or password is incorrect.')
    case 'rate_limited':
      return L(
        'Zu viele Versuche. Bitte einen Moment warten.',
        'Too many attempts. Please wait a moment.',
      )
    case 'email_not_confirmed':
      return L(
        'Bitte bestätigen Sie zunächst Ihre E-Mail-Adresse.',
        'Please confirm your email address first.',
      )
    case 'user_disabled':
      return L(
        'Dieses Konto ist deaktiviert. Bitte wenden Sie sich an Ihre Disposition.',
        'This account is disabled. Please contact your administrator.',
      )
    case 'network':
      return L(
        'Keine Internetverbindung. Bitte erneut versuchen.',
        'No internet connection. Please try again.',
      )
    default:
      return L(
        'Anmeldung fehlgeschlagen. Bitte erneut versuchen.',
        'Sign-in failed. Please try again.',
      )
  }
}
