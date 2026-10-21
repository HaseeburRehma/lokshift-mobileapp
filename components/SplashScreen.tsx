/**
 * Mobile equivalent of the webapp's SplashScreen — three-phase animation:
 *   phase 1 (0-800ms):    white background, no logo
 *   phase 2 (800-1600ms): blue background, logo box 80px wide
 *   phase 3 (1600-2500ms): logo box widens to 200px (left-anchored, like
 *                          the webapp's `object-left` reveal)
 *
 * After ~2.5s `onComplete` is called and the splash unmounts. The timers
 * start once on mount; a parent re-render must not restart them.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Animated, Easing } from 'react-native'

interface SplashScreenProps {
  onComplete: () => void
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [phase, setPhase] = useState<1 | 2 | 3>(1)
  const widthAnim = useRef(new Animated.Value(80)).current
  const bgAnim = useRef(new Animated.Value(0)).current // 0 = white, 1 = blue
  const logoOpacity = useRef(new Animated.Value(0)).current
  const done = useRef(onComplete)
  done.current = onComplete

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase(2)
      Animated.parallel([
        Animated.timing(bgAnim, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 300, useNativeDriver: false }),
      ]).start()
    }, 800)

    const t2 = setTimeout(() => {
      setPhase(3)
      Animated.timing(widthAnim, { toValue: 200, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start()
    }, 1600)

    const t3 = setTimeout(() => done.current(), 2500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [bgAnim, widthAnim, logoOpacity])

  const backgroundColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', '#0064E0'],
  })

  return (
    <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}>
      {phase >= 2 && (
        <Animated.View style={{ width: widthAnim, height: 80, overflow: 'hidden', justifyContent: 'center', opacity: logoOpacity }}>
          <Animated.Image
            source={require('../assets/logo-1.png')}
            resizeMode="contain"
            // Grows with the box, anchored left (webapp: object-contain object-left).
            style={{ width: widthAnim, height: 42, alignSelf: 'flex-start' }}
          />
        </Animated.View>
      )}
    </Animated.View>
  )
}
