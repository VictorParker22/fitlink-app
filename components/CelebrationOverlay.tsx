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
import { FontFamily } from '../constants/theme';
import { ClientRoute } from '../types/routes';

interface CelebrationOverlayProps {
  celebration: CelebrationData | null;
  onDismiss: () => void;
}

const PARTICLES = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  x: Math.sin(i * 0.7) * 150,
  y: -Math.cos(i * 0.5) * 170 - (i % 3) * 20,
  color: ['#FFD700', '#4D94FF', '#FF6B6B', '#22C55E', '#FFFFFF'][i % 5],
  size: 5 + (i % 3) * 3,
}));

export default function CelebrationOverlay({ celebration, onDismiss }: CelebrationOverlayProps) {
  const router = useRouter();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (celebration) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      opacity.value = withTiming(1, { duration: 250 });
      scale.value = withSequence(
        withSpring(1.05, { damping: 12, stiffness: 180 }),
        withSpring(1, { damping: 14, stiffness: 200 })
      );
    } else {
      opacity.value = withTiming(0, { duration: 200 });
      scale.value = withTiming(0, { duration: 200 });
    }
  }, [celebration]);

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
      params: { prefill: `Hey coach! I just unlocked a milestone: ${celebration.title} ⚡` },
    });
  };

  return (
    <Modal transparent animationType="fade" visible={!!celebration} onRequestClose={onDismiss}>
      <Animated.View style={[st.backdrop, backdropAnimStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onDismiss} />

        {/* Particles */}
        <View style={st.particleContainer} pointerEvents="none">
          {PARTICLES.map((p) => (
            <Particle key={p.id} x={p.x} y={p.y} color={p.color} size={p.size} active={!!celebration} />
          ))}
        </View>

        <Animated.View style={[st.card, cardAnimStyle]}>
          <View style={st.cardInner}>
            <Text style={st.headerTag}>ACHIEVEMENT UNLOCKED // MILESTONE</Text>

            {/* Badge Pill */}
            {celebration.badgeText && (
              <View style={st.badge}>
                <Text style={st.badgeText}>{celebration.badgeText.toUpperCase()}</Text>
              </View>
            )}

            {/* Icon Box */}
            <View style={st.iconBox}>
              <Ionicons name={celebration.icon as any || 'trophy-outline'} size={36} color="#FFD700" />
            </View>

            {/* Title & Subtitle */}
            <Text style={st.title}>{celebration.title.toUpperCase()}</Text>
            <Text style={st.subtitle}>{celebration.subtitle}</Text>

            {/* CTA Buttons */}
            <View style={st.btnCol}>
              <TouchableOpacity style={st.shareBtn} activeOpacity={0.85} onPress={handleShareWithCoach}>
                <Text style={st.shareBtnText}>SHARE WITH COACH →</Text>
              </TouchableOpacity>

              <TouchableOpacity style={st.dismissBtn} activeOpacity={0.8} onPress={onDismiss}>
                <Text style={st.dismissBtnText}>ACKNOWLEDGE</Text>
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  cardInner: {
    padding: 24,
    alignItems: 'center',
  },
  headerTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#1A1500',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EAB308',
    marginBottom: 16,
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#EAB308',
    letterSpacing: 1.5,
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: '#16140A',
    borderWidth: 1,
    borderColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  btnCol: {
    width: '100%',
    gap: 10,
  },
  shareBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1.5,
  },
  dismissBtn: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
});
