/**
 * Web-app URL resolver.
 *
 * Reads EXPO_PUBLIC_WEBAPP_URL from runtime (`expo-constants` extras)
 * first, then build-time env, finally falls back to the production
 * deployment. The placeholder string shipped in `.env.example`
 * (`your-vercel-deployment.vercel.app`) is treated as "not set" so it
 * never leaks into a clickable link.
 *
 * Single source so every screen, hook and helper resolves the same URL.
 */

import Constants from 'expo-constants'

const FALLBACK_URL = 'https://lokshift.de'

function isUsable(raw: string | null | undefined): raw is string {
  if (!raw) return false
  const trimmed = raw.trim()
  if (!trimmed) return false
  if (trimmed.includes('your-vercel-deployment')) return false
  if (!/^https?:\/\//.test(trimmed)) return false
  return true
}

/** Resolved web-app base URL — guaranteed to be a real https:// origin. */
export function getWebappUrl(): string {
  const fromExtras = (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_WEBAPP_URL
  if (isUsable(fromExtras)) return fromExtras
  const fromEnv = process.env.EXPO_PUBLIC_WEBAPP_URL
  if (isUsable(fromEnv)) return fromEnv
  return FALLBACK_URL
}

/** Join a path to the resolved base URL with a single slash. */
export function webappPath(path: string): string {
  const base = getWebappUrl().replace(/\/+$/, '')
  const tail = path.startsWith('/') ? path : `/${path}`
  return `${base}${tail}`
}
