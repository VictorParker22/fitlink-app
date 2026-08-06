import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';

interface HeroSpotlightProps {
  onExploreCoachesPress: () => void;
}

// §15 "Alive" — stat ticker pulses on mount
const LIVE_STATS = [
  { value: '1,240+', label: 'Active Athletes' },
  { value: '94%', label: 'Goal Completion' },
  { value: '48h', label: 'Avg Response Time' },
];

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
          <Text style={s.liveLabel}>COACHING MARKETPLACE</Text>
        </View>

        {/* §1 Hero headline: 38px, tight tracked — the statement IS the design */}
        <Text style={s.headline}>Train With{'\n'}Elite Coaches.</Text>

        {/* §7 Social proof stat row — data IS the design */}
        <View style={s.statsRow}>
          {LIVE_STATS.map((stat, i) => (
            <View key={i} style={[s.statItem, i < LIVE_STATS.length - 1 && s.statDivider]}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* §11 Three feature pills — compact, readable */}
        <View style={s.pillRow}>
          <View style={s.pill}>
            <Ionicons name="barbell-outline" size={11} color="#5B7FFF" />
            <Text style={s.pillText}>Custom Plans</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="chatbubbles-outline" size={11} color="#22C55E" />
            <Text style={s.pillText}>Direct Access</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="trophy-outline" size={11} color="#FFD700" />
            <Text style={s.pillText}>XP Pass Track</Text>
          </View>
        </View>

        {/* §14 CTA: 44pt, white, full-width */}
        <TouchableOpacity
          style={s.ctaBtn}
          activeOpacity={0.88}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onExploreCoachesPress();
          }}
          accessibilityRole="button"
          accessibilityLabel="Browse All Coach Plans"
        >
          <Text style={s.ctaText}>Browse Coach Plans</Text>
          <Ionicons name="arrow-forward" size={16} color="#000" />
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
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
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

  // §1 Micro → hero → stats → pills → CTA
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
    backgroundColor: '#22C55E',
  },
  liveLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // §1 Hero: 32px, tight — this is THE statement
  headline: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 36,
    marginBottom: 4,
  },

  // §7 Data IS the design — horizontal stat row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    textAlign: 'center',
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
    backgroundColor: 'rgba(17,17,19,0.9)',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  pillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },

  // §14 CTA: 44pt, white, full-width, flexRow for icon
  ctaBtn: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.2,
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
