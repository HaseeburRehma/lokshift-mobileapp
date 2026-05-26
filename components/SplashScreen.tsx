/**
 * Mobile equivalent of the webapp's SplashScreen — three-phase animation:
 *   phase 1 (0-800ms):    white background, no logo
 *   phase 2 (800-1600ms): blue background, logo at small size (80px)
 *   phase 3 (1600-2500ms): logo expands to wide (200px)
 *
 * After ~2.5s `onComplete` is called and the splash unmounts.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, View } from 'react-native'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<1 | 2 | 3>(1)
  const widthAnim = useRef(new Animated.Value(80)).current
  const bgAnim = useRef(new Animated.Value(0)).current  // 0 = white, 1 = blue

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase(2)
      Animated.timing(bgAnim, { toValue: 1, duration: 500, useNativeDriver: false }).start()
    }, 800)

    const t2 = setTimeout(() => {
      setPhase(3)
      Animated.timing(widthAnim, { toValue: 200, duration: 700, useNativeDriver: false }).start()
    }, 1600)

    const t3 = setTimeout(() => onComplete(), 2500)

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
    }
  }, [onComplete, bgAnim, widthAnim])

  const backgroundColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#0064E0'],
  })

  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}>
      {phase >= 2 && (
        <Animated.View style={{ width: widthAnim, height: 64, overflow: 'hidden' }}>
          <Image
            source={require('../assets/logo-1.png')}
            resizeMode="contain"
            style={{ width: '100%', height: '100%' }}
          />
        </Animated.View>
      )}
      <View style={{ width: 0, height: 0 }} />
    </Animated.View>
  )
}
