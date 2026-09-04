import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CoachColors } from '../constants/coachDesign';
import { Motion } from '../constants/motion';
import { useReducedMotion } from '../lib/useReducedMotion';

/**
 * FitLink splash.
 *
 * A flat mark on a lime tile, the wordmark, the audience line, and a
 * DETERMINATE bar that tracks real startup milestones instead of an
 * indeterminate spinner. Drawn rather than bitmapped, so it stays crisp at any
 * density and needs no new asset.
 *
 * Renders in two situations:
 *   1. Over the native bootsplash hand-off (EAS dev client / production).
 *   2. While fonts are still loading, where RootLayout used to `return null`
 *      and the user saw a black frame. Pass fontsReady={false} there — the
 *      wordmark falls back to the system face until Space Grotesk is up.
 */

export const SPLASH_BG = CoachColors.bg;
export const SPLASH_ACCENT = CoachColors.accent;

type Props = {
  /** 0…1. Feed it real milestones: fonts .33 → session .66 → route ready 1. */
  progress?: number;
  /** False before expo-font resolves, so we don't ask for a missing family. */
  fontsReady?: boolean;
  /** Called once the fade-out finishes. */
  onFadeComplete?: () => void;
  /** Flip to true when the app is ready to be seen. */
  done?: boolean;
};

export default function SplashOverlay({
  progress = 0,
  fontsReady = true,
  onFadeComplete,
  done = false,
}: Props) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const markScale = useRef(new Animated.Value(0.94)).current;
  const contentIn = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  // Entrance: the mark settles, then the wordmark and bar arrive under it.
  // Reduce Motion: jump straight to the settled state, no spring/slide.
  useEffect(() => {
    if (reduced) {
      markScale.setValue(1);
      contentIn.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(markScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 14,
        bounciness: 6,
      }),
      Animated.timing(contentIn, {
        toValue: 1,
        duration: 420,
        delay: 120,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [reduced]);

  // Bar follows real progress — never animates ahead of it.
  // Reduce Motion: snap to the value instead of tweening toward it.
  useEffect(() => {
    const clamped = Math.min(Math.max(progress, 0), 1);
    if (reduced) {
      bar.setValue(clamped);
      return;
    }
    Animated.timing(bar, {
      toValue: clamped,
      duration: 320,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [progress, reduced]);

  // Exit: brief pulse on the mark, then fade the whole plate away.
  // Reduce Motion: skip the pulse; fade is the one allowed fallback, at the
  // standard 200ms Reduce Motion crossfade rather than the full-motion timing.
  useEffect(() => {
    if (!done) return;
    if (reduced) {
      bar.setValue(1);
      markScale.setValue(1);
      Animated.timing(opacity, {
        toValue: 0,
        duration: Motion.reduced,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => onFadeComplete?.());
      return;
    }
    Animated.sequence([
      Animated.timing(bar, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.spring(markScale, {
          toValue: 1.05,
          useNativeDriver: true,
          speed: 30,
          bounciness: 10,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 420,
          delay: 90,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => onFadeComplete?.());
  }, [done, reduced]);

  const heading = fontsReady
    ? { fontFamily: 'SpaceGrotesk_700Bold' as const }
    : { fontWeight: '800' as const };
  const body = fontsReady ? { fontFamily: 'Epilogue-Medium' as const } : {};

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.plate, { opacity }]}>
      {/* Soft accent field behind the mark — the only decoration. */}
      <View pointerEvents="none" style={styles.glow} />

      <Animated.View style={[styles.mark, { transform: [{ scale: markScale }] }]}>
        <Svg width={52} height={52} viewBox="0 0 52 52">
          <Path
            d="M13 40V12h24"
            stroke={SPLASH_BG}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Path d="M13 26h17" stroke={SPLASH_BG} strokeWidth={7} strokeLinecap="round" fill="none" />
          <Path
            d="M30 26v14h9"
            stroke={SPLASH_BG}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          opacity: contentIn,
          transform: [
            {
              translateY: contentIn.interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
          alignItems: 'center',
        }}
      >
        <Text style={[styles.wordmark, heading]}>FITLINK</Text>
        <Text style={[styles.audience, body]}>FOR COACHES</Text>
      </Animated.View>

      <Animated.View style={[styles.barTrack, { opacity: contentIn }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: bar.interpolate({
                inputRange: [0, 1],
                outputRange: ['6%', '100%'],
              }),
            },
          ]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 26,
    zIndex: 9999,
  },
  glow: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(198,242,78,0.07)',
  },
  mark: {
    width: 96,
    height: 96,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: SPLASH_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontSize: 29,
    letterSpacing: 5.2,
    color: CoachColors.textPrimary,
  },
  audience: {
    fontSize: 14,
    letterSpacing: 1,
    color: '#6C7266',
    marginTop: 9,
  },
  barTrack: {
    position: 'absolute',
    bottom: 44,
    width: 56,
    height: 3,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: SPLASH_ACCENT,
  },
});
