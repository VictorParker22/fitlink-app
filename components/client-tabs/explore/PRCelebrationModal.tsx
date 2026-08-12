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
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';

const { width: W, height: H } = Dimensions.get('window');
const PARTICLE_COUNT = 14;

// Spread angles across the full circle in radians
const PARTICLE_ANGLES = Array.from(
  { length: PARTICLE_COUNT },
  (_, i) => (i / PARTICLE_COUNT) * 2 * Math.PI,
);

// Gold / champagne palette for particle dots
const PARTICLE_COLORS = [
  '#FFD700', '#FFC107', '#FFB300', '#FF8C00',
  '#FFFFFF', '#F9A825', '#FFE082', '#FDD835',
  '#FFCA28', '#FFB74D', '#FFA726', '#FF9800',
  '#C8F135', '#A0E020',
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
            {/* Gold top strip */}
            <View style={s.goldStrip} />

            {/* Trophy */}
            <Animated.Text style={[s.trophy, { transform: [{ scale: trophyScale }] }]}>
              🏆
            </Animated.Text>

            {/* Badge */}
            <View style={s.badge}>
              <Text style={s.badgeText}>NEW PR</Text>
            </View>

            {/* Weight */}
            <Text style={s.weight}>{weight % 1 === 0 ? weight : weight.toFixed(1)}</Text>
            <Text style={s.weightUnit}>kg lifted</Text>

            {/* Exercise name */}
            <Text style={s.exerciseName} numberOfLines={2}>{exerciseName}</Text>

            {/* Motivational line */}
            <Text style={s.sub}>That's your best ever. Keep pushing. 💪</Text>

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
    backgroundColor: '#18171F',
    borderRadius: 24,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingBottom: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    // Elevation for Android
    elevation: 24,
    // Shadow for iOS
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    overflow: 'hidden',
  },
  goldStrip: {
    height: 4,
    width: '140%', // bleed beyond card radius
    backgroundColor: '#FFD700',
    marginBottom: 24,
  },
  trophy: {
    fontSize: 72,
    lineHeight: 84,
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#FFD700',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 20,
  },
  badgeText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#0D0D12',
    letterSpacing: 2,
  },
  weight: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 72,
    color: '#FFFFFF',
    lineHeight: 78,
    textAlign: 'center',
  },
  weightUnit: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    marginTop: 2,
    marginBottom: 16,
  },
  exerciseName: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 0.5,
  },
});
