/**
 * useSafeBack — wraps `router.back()` with an empty-stack guard.
 *
 * When a screen is opened via deep link (push notification, app
 * shortcut, share intent, etc.), expo-router's navigation stack has
 * no prior route and `router.back()` throws:
 *   "The action 'GO_BACK' was not handled by any navigator."
 *
 * The hook returns a function that pops the stack when possible and
 * otherwise navigates to a sensible default (the home tab unless the
 * caller overrides).
 */

import { useCallback } from 'react'
import { useRouter } from 'expo-router'

export function useSafeBack(fallback: string = '/(tabs)/home') {
  const router = useRouter()
  return useCallback(() => {
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace(fallback as any)
    }
  }, [router, fallback])
}
