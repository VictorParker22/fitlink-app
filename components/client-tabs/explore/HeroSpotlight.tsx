import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface HeroSpotlightProps {
  onExploreCoachesPress: () => void;
}

export default function HeroSpotlight({ onExploreCoachesPress }: HeroSpotlightProps) {
  // §15 Alive — pulsing live indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={s.container}>
      {/* Background photo */}
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=900' }}
        style={s.bgImage}
        cachePolicy="memory-disk"
        transition={400}
      />

      {/* Heavy black-to-transparent gradient from bottom */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.98)']}
        locations={[0, 0.45, 1]}
        style={s.gradient}
      />

      <View style={s.content}>
        {/* §1 Micro label */}
        <View style={s.liveRow}>
          {/* §15 Pulsing dot */}
          <Animated.View style={[s.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={s.liveLabel}>Coaching marketplace</Text>
        </View>

        {/* §1 Hero headline: tight tracked — the statement IS the design */}
        <Text style={s.headline}>Train with{'\n'}elite coaches.</Text>

        {/* §11 Three feature pills — compact, readable */}
        <View style={s.pillRow}>
          <View style={s.pill}>
            <Ionicons name="barbell-outline" size={11} color={CoachColors.accent} />
            <Text style={s.pillText}>Custom plans</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="chatbubbles-outline" size={11} color={CoachColors.accent} />
            <Text style={s.pillText}>Direct access</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="trophy-outline" size={11} color={CoachColors.accent} />
            <Text style={s.pillText}>XP pass track</Text>
          </View>
        </View>

        {/* §14 CTA: 44pt, full-width */}
        <TouchableOpacity
          style={s.ctaBtn}
          activeOpacity={0.88}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onExploreCoachesPress();
          }}
          accessibilityRole="button"
          accessibilityLabel="Browse all coach plans"
        >
          <Text style={s.ctaText}>Browse coach plans</Text>
          <Ionicons name="arrow-forward" size={16} color={CoachColors.onAccent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  // Full-bleed card — no horizontal margin, edge-to-edge feel
  container: {
    height: 360,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
    justifyContent: 'flex-end',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },

  content: {
    padding: 20,
    zIndex: 2,
  },

  // §1 Micro → hero → pills → CTA
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  // §15 Alive element
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CoachColors.accent,
  },
  liveLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // §1 Hero: 32px, tight — this is THE statement
  headline: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
    letterSpacing: -0.8,
    lineHeight: 36,
    marginBottom: 12,
  },

  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  // §11 Feature pills: Layer 2 tint, subtle border
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: CoachColors.surfaceRaised,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  pillText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textPrimary,
  },

  // §14 CTA: 44pt, full-width, flexRow for icon
  ctaBtn: {
    height: 44,
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    color: CoachColors.onAccent,
    letterSpacing: 0.2,
  },
});
