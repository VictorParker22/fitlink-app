import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../../constants/theme';

interface HeroSpotlightProps {
  onExploreCoachesPress: () => void;
}

export default function HeroSpotlight({ onExploreCoachesPress }: HeroSpotlightProps) {
  return (
    <View style={s.container}>
      <Image
        source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800' }}
        style={s.bgImage}
        cachePolicy="memory-disk"
        transition={300}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.2)', 'rgba(12,12,14,0.95)'] as const}
        style={s.gradient}
      />

      <View style={s.content}>
        <View style={s.badge}>
          <Ionicons name="sparkles" size={12} color="#FFD700" />
          <Text style={s.badgeText}>FITLINK MARKETPLACE // 1-ON-1 COACHING</Text>
        </View>

        <Text style={s.headline}>Train With Elite Coaches</Text>
        <Text style={s.subhead}>
          Get custom workout prescriptions, video form reviews, and dynamic nutrition tracking tailored to your goals.
        </Text>

        <View style={s.pillRow}>
          <View style={s.pill}>
            <Ionicons name="barbell-outline" size={12} color="#4D94FF" />
            <Text style={s.pillText}>Custom Plans</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="chatbubbles-outline" size={12} color="#22C55E" />
            <Text style={s.pillText}>Direct 1:1 Access</Text>
          </View>
          <View style={s.pill}>
            <Ionicons name="trophy-outline" size={12} color="#FFD700" />
            <Text style={s.pillText}>XP Pass Track</Text>
          </View>
        </View>

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
          <Text style={s.ctaText}>BROWSE COACH PLANS →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    height: 280,
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    backgroundColor: '#0C0C0E',
    justifyContent: 'flex-end',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    padding: 16,
    zIndex: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFD700',
    letterSpacing: 1.2,
  },
  headline: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subhead: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 16,
    marginBottom: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(20,20,24,0.85)',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
  },
  ctaBtn: {
    height: 42,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 1,
  },
});
