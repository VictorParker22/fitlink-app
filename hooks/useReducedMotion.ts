/**
 * useReducedMotion
 *
 * Reads the system Reduce Motion accessibility setting and subscribes
 * to changes. Returns `true` when the user has Reduce Motion enabled.
 *
 * HIG §17 — Required implementation:
 *   When true → stop Animated.loop, replace slides with crossfades,
 *   disable parallax and auto-playing animations.
 *   Simple opacity transitions remain allowed.
 *
 * Usage:
 *   const reduced = useReducedMotion();
 *   if (!reduced) loopAnim.start();
 */

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Read current value
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);

    // Subscribe to runtime changes (user can toggle in Settings without restart)
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );

    return () => subscription.remove();
  }, []);

  return reduced;
}
