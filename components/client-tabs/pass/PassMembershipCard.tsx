import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useReducedMotion } from '../../../lib/useReducedMotion';

interface PassMembershipCardProps {
  clientName: string;
  avatarUrl?: string;
  memberSince: string; // ISO date string from clientData.created_at
  totalWorkouts: number;
  totalXp: number;
  currentStreak: number;
  currentLevel: number;
  planName?: string;
  coachName?: string;
}

const getTierInfo = (level: number) => {
  if (level >= 20) return { name: 'Diamond', color: CoachColors.accent };
  if (level >= 10) return { name: 'Gold', color: CoachColors.textPrimary };
  if (level >= 5) return { name: 'Silver', color: CoachColors.textSecondary };
  return { name: 'Bronze', color: CoachColors.textMuted };
};

export const PassMembershipCard: React.FC<PassMembershipCardProps> = ({
  clientName,
  avatarUrl,
  memberSince,
  totalWorkouts,
  totalXp,
  currentStreak,
  currentLevel,
  planName,
  coachName,
}) => {
  const tier = getTierInfo(currentLevel);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: park the sweeping shimmer off-card so it never travels.
    if (reduceMotion) {
      shimmerAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [shimmerAnim, reduceMotion]);

  const date = new Date(memberSince);
  const month = date.toLocaleString('default', { month: 'long' });
  const year = date.getFullYear();

  const shimmerTranslateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View style={[styles.card, { borderColor: tier.color }]}>
      <View style={styles.shimmerContainer} pointerEvents="none">
        <Animated.View
          style={[
            styles.shimmer,
            { transform: [{ translateX: shimmerTranslateX }] },
          ]}
        >
          <LinearGradient
            colors={['transparent', `${tier.color}4D`, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <View style={styles.header}>
        <View style={[styles.tierBadge, { backgroundColor: `${tier.color}26` }]}>
          <Ionicons name="diamond" size={11} color={tier.color} />
          <Text style={[styles.tierText, { color: tier.color }]}>
            {tier.name}
          </Text>
        </View>
        <Text style={[styles.watermark, { color: tier.color }]}>
          FitLink club
        </Text>
      </View>

      <View style={styles.profileSection}>
        <View style={[styles.avatarContainer, { borderColor: tier.color }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Ionicons name="person" size={36} color={CoachColors.textPrimary} />
          )}
        </View>
        <Text style={styles.clientName}>{clientName}</Text>
        {planName && (
          <Text style={styles.planName}>
            {planName}
            {coachName ? ` • Coached by ${coachName}` : ''}
          </Text>
        )}
        <Text style={[styles.memberSince, { color: tier.color }]}>
          Member since {month} {year}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{totalWorkouts}</Text>
          <Text style={styles.statLabel}>Workouts</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{totalXp}</Text>
          <Text style={styles.statLabel}>Total XP</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{currentStreak}</Text>
          <Text style={styles.statLabel}>Day streak</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 2,
    borderRadius: 20,
    padding: Spacing['2xl'],
    overflow: 'hidden',
    position: 'relative',
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderRadius: 18,
  },
  shimmer: {
    width: 100,
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
    gap: Spacing.xs,
  },
  tierText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  watermark: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    opacity: 0.3,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CoachColors.borderMuted,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  clientName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xs,
  },
  planName: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    marginBottom: Spacing.xs,
  },
  memberSince: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: '100%',
    backgroundColor: CoachColors.borderMuted,
  },
  statValue: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginBottom: Spacing['2xs'],
  },
  statLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
