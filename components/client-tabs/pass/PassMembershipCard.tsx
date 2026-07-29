import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';

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
  if (level >= 20) return { name: 'DIAMOND', color: '#B9F2FF' };
  if (level >= 10) return { name: 'GOLD', color: '#FFD700' };
  if (level >= 5) return { name: 'SILVER', color: '#C0C0C0' };
  return { name: 'BRONZE', color: '#CD7F32' };
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

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [shimmerAnim]);

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
          <Ionicons name="diamond" size={10} color={tier.color} />
          <Text style={[styles.tierText, { color: tier.color }]}>
            {tier.name}
          </Text>
        </View>
        <Text style={[styles.watermark, { color: tier.color }]}>
          FITLINK CLUB
        </Text>
      </View>

      <View style={styles.profileSection}>
        <View style={[styles.avatarContainer, { borderColor: tier.color }]}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <Ionicons name="person" size={32} color="#FFFFFF" />
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
          <Text style={styles.statLabel}>WORKOUTS</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{totalXp}</Text>
          <Text style={styles.statLabel}>TOTAL XP</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCol}>
          <Text style={styles.statValue}>{currentStreak}</Text>
          <Text style={styles.statLabel}>DAY STREAK</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0C0C0E',
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
  },
  watermark: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    letterSpacing: 3,
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
    backgroundColor: '#1C1C1E',
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  clientName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  planName: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: Spacing.xs,
  },
  memberSince: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statValue: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: Spacing['2xs'],
  },
  statLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
  },
});
