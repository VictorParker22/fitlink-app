import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import { CoachColors } from '../../constants/coachDesign';

/**
 * ConfettiBurst — the lime confetti fall shared by celebration overlays
 * (pass published, first client added). Self-contained: starts on mount,
 * runs one 2s gravity-eased fall, then sits at opacity 0.
 *
 * Render nothing instead of this component when Reduce Motion is on —
 * callers own that check (see lib/useReducedMotion.ts).
 */

const PARTICLE_COLORS = [
  CoachColors.accent,
  'rgba(198,242,78,0.55)',
  CoachColors.textPrimary,
  CoachColors.textMuted,
];

type Particle = {
  x0: number;
  drift: number;
  size: number;
  color: string;
  delay: number;   // 0…0.3 fraction of the timeline
  spins: number;   // signed full rotations
  fall: number;    // px
  rot0: number;    // deg
};

export default function ConfettiBurst({ count = 30 }: { count?: number }) {
  const { width, height } = useWindowDimensions();

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x0: Math.random() * width,
        drift: (Math.random() - 0.5) * 140,
        size: 5 + Math.random() * 6,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        delay: Math.random() * 0.3,
        spins: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
        fall: height * (0.55 + Math.random() * 0.5),
        rot0: Math.random() * 360,
      })),
    [width, height, count]
  );

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gravity-ish: the burst accelerates as it falls.
    Animated.timing(progress, {
      toValue: 1,
      duration: 2000,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => {
        const start = Math.min(p.delay, 0.3);
        const translateY = progress.interpolate({
          inputRange: [start, 1],
          outputRange: [-40, p.fall],
          extrapolate: 'clamp',
        });
        const translateX = progress.interpolate({
          inputRange: [start, (start + 1) / 2, 1],
          outputRange: [0, p.drift * 0.6, p.drift],
          extrapolate: 'clamp',
        });
        const rotate = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [`${p.rot0}deg`, `${p.rot0 + p.spins * 360}deg`],
        });
        const opacity = progress.interpolate({
          inputRange: [0, start, 0.75, 1],
          outputRange: [0, 1, 1, 0],
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              top: 0,
              left: p.x0,
              width: p.size,
              height: p.size * 1.6,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity,
              transform: [{ translateY }, { translateX }, { rotate }],
            }}
          />
        );
      })}
    </View>
  );
}
