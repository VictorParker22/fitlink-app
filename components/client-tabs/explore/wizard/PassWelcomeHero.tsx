import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { FontFamily, Spacing, Radius } from '../../../../constants/theme';

interface PassWelcomeHeroProps {
  planName: string;
  coachName?: string;
  level: number;
  xp: number;
  trackNodeCount: number;
}

/**
 * A premium welcome hero that appears at the top of the Pass page
 * when the user has just subscribed. Features staggered fade-in animations,
 * a glowing accent border, and achievement-style stats.
 */
export default function PassWelcomeHero({
  planName,
  coachName,
  level,
  xp,
  trackNodeCount,
}: PassWelcomeHeroProps) {
  // Animation values
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const badgeFade = useRef(new Animated.Value(0)).current;
  const statsFade = useRef(new Animated.Value(0)).current;
  const glowPulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Staggered entrance sequence
    Animated.sequence([
      // Phase 1: Main card fades in
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideUp, { toValue: 0, duration: 600, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      ]),
      // Phase 2: Badge appears
      Animated.timing(badgeFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      // Phase 3: Stats appear
      Animated.timing(statsFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Continuous glow pulse on the border
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 0.8, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 0.3, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[s.container, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
      <LinearGradient
        colors={['rgba(255,215,0,0.08)', 'rgba(255,107,53,0.04)', 'rgba(0,0,0,0)']}
        style={s.gradientBg}
      />

      {/* Glowing border accent */}
      <Animated.View style={[s.glowBorder, { opacity: glowPulse }]} />

      {/* Welcome Tag */}
      <View style={s.tagRow}>
        <View style={s.tag}>
          <Ionicons name="diamond" size={10} color="#FFD700" />
          <Text style={s.tagText}>WELCOME TO YOUR JOURNEY</Text>
        </View>
      </View>

      {/* Plan Name */}
      <Text style={s.planName}>{planName}</Text>
      {coachName ? (
        <Text style={s.coachLine}>Coached by {coachName}</Text>
      ) : null}

      {/* Animated Badge */}
      <Animated.View style={[s.badgeContainer, { opacity: badgeFade }]}>
        <LinearGradient
          colors={['#FFD700', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.badge}
        >
          <Ionicons name="shield-checkmark" size={16} color="#000" />
          <Text style={s.badgeText}>ACTIVE MEMBER</Text>
        </LinearGradient>
      </Animated.View>

      {/* Stats Row */}
      <Animated.View style={[s.statsRow, { opacity: statsFade }]}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{level}</Text>
          <Text style={s.statLabel}>LEVEL</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{xp}</Text>
          <Text style={s.statLabel}>XP</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{trackNodeCount}</Text>
          <Text style={s.statLabel}>REWARDS</Text>
        </View>
      </Animated.View>

      {/* Motivational line */}
      <Text style={s.motivational}>
        Complete workouts & log meals to earn XP and unlock rewards along your journey.
      </Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#0C0C0E',
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    padding: 24,
    marginBottom: Spacing.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  gradientBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  glowBorder: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: Radius['2xl'],
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  tagRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  tagText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFD700',
    letterSpacing: 2,
  },
  planName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  coachLine: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    gap: 6,
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#000',
    letterSpacing: 1.5,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.xl,
    paddingVertical: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  motivational: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
