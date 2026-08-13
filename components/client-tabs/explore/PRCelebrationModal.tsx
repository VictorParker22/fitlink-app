import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableWithoutFeedback,
  Modal,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

const { width: W, height: H } = Dimensions.get('window');
const PARTICLE_COUNT = 14;

// Spread angles across the full circle in radians
const PARTICLE_ANGLES = Array.from(
  { length: PARTICLE_COUNT },
  (_, i) => (i / PARTICLE_COUNT) * 2 * Math.PI,
);

// Lime accent palette for particle dots
const PARTICLE_COLORS = [
  CoachColors.accent,
  CoachColors.textPrimary,
  CoachColors.accent,
  CoachColors.accentSoft,
];

interface PRCelebrationModalProps {
  visible: boolean;
  exerciseName: string;
  weight: number;
  onDismiss: () => void;
}

export default function PRCelebrationModal({
  visible,
  exerciseName,
  weight,
  onDismiss,
}: PRCelebrationModalProps) {
  // ── Card enter animation ──────────────────────────────────────────────────
  const cardScale  = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // ── Trophy pulse ─────────────────────────────────────────────────────────
  const trophyScale = useRef(new Animated.Value(1)).current;

  // ── Particles — one Animated.Value per particle for distance ─────────────
  const particleAnims = useRef(
    PARTICLE_ANGLES.map(() => ({
      dist: new Animated.Value(0),
      opacity: new Animated.Value(1),
    })),
  ).current;

  // ── Auto-dismiss timer ────────────────────────────────────────────────────
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 0.8, duration: 200, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  }, [onDismiss, cardScale, cardOpacity, backdropOpacity]);

  useEffect(() => {
    if (!visible) return;

    // Heavy haptic feedback — this is a big moment for the client
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Follow-up impact to make it feel more physical
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 120);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 300);

    // Reset all animated values
    cardScale.setValue(0);
    cardOpacity.setValue(0);
    backdropOpacity.setValue(0);
    trophyScale.setValue(1);
    particleAnims.forEach(p => { p.dist.setValue(0); p.opacity.setValue(1); });

    // 1. Backdrop fade in
    Animated.timing(backdropOpacity, {
      toValue: 1, duration: 300, useNativeDriver: true,
    }).start();

    // 2. Card spring in
    Animated.parallel([
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 80,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // 3. Trophy pulse loop (starts 200ms in so card is visible first)
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(trophyScale, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(trophyScale, { toValue: 1,    duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const pulseTimeout = setTimeout(() => pulseAnim.start(), 200);

    // 4. Burst particles outward from center, staggered
    const particleAnimations = particleAnims.map((p, i) =>
      Animated.sequence([
        Animated.delay(i * 30),
        Animated.parallel([
          Animated.timing(p.dist, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]),
    );
    Animated.parallel(particleAnimations).start();

    // 5. Auto-dismiss after 3.5s
    dismissTimer.current = setTimeout(() => dismiss(), 3500);

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      clearTimeout(pulseTimeout);
      pulseAnim.stop();
    };
  }, [visible]);

  if (!visible) return null;

  const PARTICLE_RADIUS = W * 0.38; // how far particles travel from center

  return (
    <Modal transparent animationType="none" visible={visible} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={dismiss} accessible accessibilityLabel="Dismiss personal record celebration">
        <View style={s.root}>
          {/* Backdrop */}
          <Animated.View style={[s.backdrop, { opacity: backdropOpacity }]} />

          {/* Particles */}
          {particleAnims.map((p, i) => {
            const angle = PARTICLE_ANGLES[i];
            const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length];
            const size = 6 + (i % 4) * 3; // vary sizes: 6, 9, 12, 15
            const tx = p.dist.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.cos(angle) * PARTICLE_RADIUS],
            });
            const ty = p.dist.interpolate({
              inputRange: [0, 1],
              outputRange: [0, Math.sin(angle) * PARTICLE_RADIUS],
            });
            return (
              <Animated.View
                key={i}
                style={[
                  s.particle,
                  { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
                  { opacity: p.opacity, transform: [{ translateX: tx }, { translateY: ty }] },
                ]}
              />
            );
          })}

          {/* Card */}
          <Animated.View
            style={[
              s.card,
              { opacity: cardOpacity, transform: [{ scale: cardScale }] },
            ]}
          >
            {/* Accent top strip */}
            <View style={s.accentStrip} />

            {/* Trophy */}
            <Animated.View style={[s.trophy, { transform: [{ scale: trophyScale }] }]}>
              <Ionicons name="trophy" size={64} color={CoachColors.accent} />
            </Animated.View>

            {/* Badge */}
            <View style={s.badge}>
              <Text style={s.badgeText}>New PR</Text>
            </View>

            {/* Weight */}
            <Text style={s.weight}>{weight % 1 === 0 ? weight : weight.toFixed(1)}</Text>
            <Text style={s.weightUnit}>kg lifted</Text>

            {/* Exercise name */}
            <Text style={s.exerciseName} numberOfLines={2}>{exerciseName}</Text>

            {/* Motivational line */}
            <Text style={s.sub}>That's your best ever. Keep pushing.</Text>

            {/* Tap-to-dismiss hint */}
            <Text style={s.hint}>Tap anywhere to continue</Text>
          </Animated.View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },

  // Particle dots — positioned absolutely at center, then translated via Animated
  particle: {
    position: 'absolute',
  },

  // Card
  card: {
    width: W * 0.82,
    backgroundColor: CoachColors.surface,
    borderRadius: 24,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 32,
    borderWidth: 1.5,
    borderColor: CoachColors.border,
    // Elevation for Android
    elevation: 24,
    // Shadow for iOS
    shadowColor: CoachColors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    overflow: 'hidden',
  },
  accentStrip: {
    height: 4,
    width: '140%', // bleed beyond card radius
    backgroundColor: CoachColors.accent,
    marginBottom: 24,
  },
  trophy: {
    marginBottom: 8,
  },
  badge: {
    backgroundColor: CoachColors.accent,
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
    marginTop: 12,
  },
  badgeText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  weight: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 72,
    color: CoachColors.textPrimary,
    lineHeight: 78,
    textAlign: 'center',
  },
  weightUnit: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 16,
  },
  exerciseName: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  hint: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 0.5,
  },
});
