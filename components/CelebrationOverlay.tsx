import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { CelebrationData } from '../hooks/useCelebrations';
import { useReducedMotion } from '../lib/useReducedMotion';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { ClientRoute } from '../types/routes';

interface CelebrationOverlayProps {
  celebration: CelebrationData | null;
  onDismiss: () => void;
}

// Single-accent confetti: accent at full/partial strength plus neutral text tones
const PARTICLE_COLORS = [
  CoachColors.accent,
  CoachColors.accentSoft,
  CoachColors.textPrimary,
  CoachColors.accent,
  CoachColors.textSecondary,
];

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.sin(i * 0.7) * 150,
  y: -Math.cos(i * 0.5) * 170 - (i % 3) * 20,
  color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  size: 5 + (i % 3) * 3,
}));

export default function CelebrationOverlay({ celebration, onDismiss }: CelebrationOverlayProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (celebration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (reduced) {
        // Reduce Motion: plain fade to final values, no spring pop.
        scale.value = 1;
        opacity.value = withTiming(1, { duration: 200 });
        return;
      }
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSequence(
        withSpring(1.05, { damping: 12, stiffness: 180 }),
        withSpring(1, { damping: 14, stiffness: 200 })
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = reduced ? 0 : withTiming(0, { duration: 200 });
    }
  }, [celebration, reduced]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!celebration) return null;

  const handleShareWithCoach = () => {
    onDismiss();
    router.push({
      pathname: ClientRoute.myMessages as any,
      params: { prefill: `Hey coach! I just unlocked a milestone: ${celebration.title}` },
    });
  };

  return (
    <Modal transparent animationType="fade" visible={!!celebration} onRequestClose={onDismiss}>
      <Animated.View style={[st.backdrop, backdropAnimStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />

        {/* Particles — skipped entirely under Reduce Motion */}
        {!reduced && (
          <View style={st.particleContainer} pointerEvents="none">
            {PARTICLES.map((p) => (
              <Particle key={p.id} x={p.x} y={p.y} color={p.color} size={p.size} active={!!celebration} />
            ))}
          </View>
        )}

        <Animated.View style={[st.card, cardAnimStyle]}>
          <View style={st.cardInner}>
            <Text style={st.headerTag}>Achievement unlocked</Text>

            {/* Badge Pill */}
            {celebration.badgeText && (
              <View style={st.badge}>
                <Text style={st.badgeText}>{celebration.badgeText}</Text>
              </View>
            )}

            {/* Icon Box */}
            <View style={st.iconBox}>
              <Ionicons name={celebration.icon as any || 'trophy-outline'} size={40} color={CoachColors.accent} />
            </View>

            {/* Title & Subtitle */}
            <Text style={st.title}>{celebration.title}</Text>
            <Text style={st.subtitle}>{celebration.subtitle}</Text>

            {/* CTA Buttons */}
            <View style={st.btnCol}>
              <TouchableOpacity style={st.shareBtn} activeOpacity={0.85} onPress={handleShareWithCoach}>
                <Text style={st.shareBtnText}>Share with coach</Text>
              </TouchableOpacity>

              <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={st.dismissBtn} activeOpacity={0.8} onPress={onDismiss}>
                <Text style={st.dismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Particle({ x, y, color, size, active }: { x: number; y: number; color: string; size: number; active: boolean }) {
  const transY = useSharedValue(0);
  const transX = useSharedValue(0);
  const pOpacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      transX.value = withTiming(x, { duration: 800, easing: Easing.out(Easing.cubic) });
      transY.value = withTiming(y, { duration: 800, easing: Easing.out(Easing.cubic) });
      pOpacity.value = withSequence(
        withTiming(1, { duration: 200 }),
        withDelay(400, withTiming(0, { duration: 400 }))
      );
    }
  }, [active]);

  const pStyle = useAnimatedStyle(() => ({
    opacity: pOpacity.value,
    transform: [{ translateX: transX.value }, { translateY: transY.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: 2,
          backgroundColor: color,
        },
        pStyle,
      ]}
    />
  );
}

const st = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  particleContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 24,
    alignItems: 'center',
  },
  headerTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    marginBottom: 16,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  btnCol: {
    width: '100%',
    gap: 10,
  },
  shareBtn: {
    backgroundColor: CoachColors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13.5,
    color: CoachColors.onAccent,
    letterSpacing: 0.5,
  },
  dismissBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
  },
});
