import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Reflects the OS "Reduce Motion" setting, live.
 *
 * Every decorative animation in the app must check this: when it returns
 * true, skip loops/springs/staggers and jump straight to final values
 * (or a plain fade at most).
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (mounted) setReduced(value); })
      .catch(() => { /* default to full motion */ });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      setReduced(value);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
