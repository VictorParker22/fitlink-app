import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';

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
        colors={[CoachColors.accentSofter, CoachColors.accentSofter, 'rgba(0,0,0,0)']}
        style={s.gradientBg}
      />

      {/* Glowing border accent */}
      <Animated.View style={[s.glowBorder, { opacity: glowPulse }]} />

      {/* Welcome Tag */}
      <View style={s.tagRow}>
        <View style={s.tag}>
          <Ionicons name="diamond" size={10} color={CoachColors.accent} />
          <Text style={s.tagText}>Welcome to your journey</Text>
        </View>
      </View>

      {/* Plan Name */}
      <Text style={s.planName}>{planName}</Text>
      {coachName ? (
        <Text style={s.coachLine}>Coached by {coachName}</Text>
      ) : null}

      {/* Animated Badge */}
      <Animated.View style={[s.badgeContainer, { opacity: badgeFade }]}>
        <View style={s.badge}>
          <Ionicons name="shield-checkmark" size={16} color={CoachColors.onAccent} />
          <Text style={s.badgeText}>Active member</Text>
        </View>
      </Animated.View>

      {/* Stats Row */}
      <Animated.View style={[s.statsRow, { opacity: statsFade }]}>
        <View style={s.statItem}>
          <Text style={s.statValue}>{level}</Text>
          <Text style={s.statLabel}>Level</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{xp}</Text>
          <Text style={s.statLabel}>XP</Text>
        </View>
        <View style={s.statDivider} />
        <View style={s.statItem}>
          <Text style={s.statValue}>{trackNodeCount}</Text>
          <Text style={s.statLabel}>Rewards</Text>
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
    backgroundColor: CoachColors.surface,
    borderRadius: Radius['2xl'],
    borderWidth: 1,
    borderColor: CoachColors.border,
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
    borderColor: CoachColors.accent,
  },
  tagRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  tagText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  planName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  coachLine: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    marginBottom: 16,
  },
  badgeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    gap: 6,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.onAccent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: Radius.xl,
    paddingVertical: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
  },
  statLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: CoachColors.borderMuted,
  },
  motivational: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
