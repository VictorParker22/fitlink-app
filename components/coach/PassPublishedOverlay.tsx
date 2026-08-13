import React, { useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { playChime } from '../../lib/sounds';

/**
 * Shown once, right after a coach publishes a pass — a lime confetti burst
 * over a spring-in "It's live" card. Kept in the coach design language: one
 * accent, no emoji, and copy that states what actually happened (how many
 * athletes were told, where the pass lives now).
 *
 * Rendered as an absolutely-positioned overlay inside the screen — NOT a
 * native Modal — so dismissing and navigating can never wedge each other.
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

export default function PassPublishedOverlay({
  planName,
  offersSent,
  onDone,
}: {
  planName: string;
  offersSent: number;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        x0: Math.random() * width,
        drift: (Math.random() - 0.5) * 140,
        size: 5 + Math.random() * 6,
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        delay: Math.random() * 0.3,
        spins: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
        fall: height * (0.55 + Math.random() * 0.5),
        rot0: Math.random() * 360,
      })),
    [width, height]
  );

  const progress = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.82)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playChime();
    Animated.parallel([
      // Gravity-ish: the burst accelerates as it falls.
      Animated.timing(progress, {
        toValue: 1,
        duration: 2000,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }),
    ]).start();
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, s.root]} pointerEvents="auto">
      {/* Confetti */}
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

      {/* Card */}
      <Animated.View style={[s.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
        <View style={s.checkCircle}>
          <Ionicons name="checkmark" size={30} color={CoachColors.onAccent} />
        </View>
        <Text style={s.eyebrow}>It's live</Text>
        <Text style={s.planName} numberOfLines={2}>{planName}</Text>
        <Text style={s.sub}>
          {offersSent > 0
            ? `${offersSent} athlete${offersSent === 1 ? '' : 's'} just got a message from you — watch your inbox for replies.`
            : 'Athletes can take it from your Passes tab whenever you offer it.'}
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.85}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    backgroundColor: 'rgba(16,18,16,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
    paddingHorizontal: 32,
  },
  card: {
    alignItems: 'center',
    width: '100%',
  },
  checkCircle: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 22,
  },
  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  planName: {
    fontFamily: CoachFonts.headingBold, fontSize: 26, color: CoachColors.textPrimary,
    textAlign: 'center', lineHeight: 32,
  },
  sub: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary,
    textAlign: 'center', lineHeight: 21, marginTop: 12,
  },
  doneBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 15, paddingHorizontal: 48, marginTop: 28,
  },
  doneBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
});
