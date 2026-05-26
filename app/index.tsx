/**
 * Entry redirect — the root layout's AuthGuard does the real routing.
 * This just gives Expo Router a non-empty default route.
 */

import { Redirect } from 'expo-router'

export default function Index() {
  return <Redirect href="/(tabs)/home" />
}
