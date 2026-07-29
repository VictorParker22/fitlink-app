import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle } from 'react-native-svg';
import { HealthSnapshot } from '../../../context/HealthContext';
import { FontFamily, FontSize, Spacing, Radius } from '../../../constants/theme';
import { useTheme } from '../../../context/ThemeContext';

const CARD_MARGIN = Spacing.md;

interface ActivityInsightsBentoProps {
  progressLogs: any[];
  healthSnapshot: HealthSnapshot | null;
  workoutsThisMonth: number;
  streak: number;
  totalWorkouts: number;
}

export const ActivityInsightsBento: React.FC<ActivityInsightsBentoProps> = ({
  progressLogs,
  healthSnapshot,
  workoutsThisMonth,
  streak,
}) => {
  const { colors } = useTheme();
  const sortedLogs = [...progressLogs]
    .filter((log) => log.weight != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let latestWeight = healthSnapshot?.latestWeight || null;
  let prevWeight = null;
  let weightTrend = 0; // 0: none, -1: down (good), 1: up (bad)

  if (sortedLogs.length > 0) {
    latestWeight = sortedLogs[sortedLogs.length - 1].weight;
    if (sortedLogs.length > 1) {
      prevWeight = sortedLogs[sortedLogs.length - 2].weight;
      if (latestWeight! < prevWeight!) weightTrend = -1;
      else if (latestWeight! > prevWeight!) weightTrend = 1;
    }
  }

  const weightData = sortedLogs.slice(-7).map((log) => log.weight);

  const renderSparkline = () => {
    if (weightData.length < 2) return null;
    const min = Math.min(...weightData);
    const max = Math.max(...weightData);
    const range = max - min === 0 ? 1 : max - min;
    const w = 120; // fallback width for sparkline
    const h = 24;

    const points = weightData.map((val, index) => {
      const x = (index / (weightData.length - 1)) * w;
      const y = h - ((val - min) / range) * h;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');

    return (
      <Svg width={w} height={h} style={styles.sparkline}>
        <Path d={points} stroke={colors.accent} strokeWidth={1.5} fill="none" />
      </Svg>
    );
  };

  const streakAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (streak > 7) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(streakAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(streakAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      streakAnim.setValue(1);
    }
  }, [streak]);

  const renderStepsRing = (steps: number) => {
    const radius = 12;
    const stroke = 3;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(steps / 8000, 1);
    const strokeDashoffset = circumference - progress * circumference;

    return (
      <View style={styles.stepsRing}>
        <Svg width={32} height={32}>
          <Circle
            cx={16}
            cy={16}
            r={radius}
            stroke="rgba(34,197,94,0.2)"
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={16}
            cy={16}
            r={radius}
            stroke="#22C55E"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 16 16)"
          />
        </Svg>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>METRICS // INSIGHTS BENTO</Text>
      <View style={styles.grid}>
        {/* Weight */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <Ionicons name="scale-outline" size={16} color={colors.textSecondary} />
            </View>
            {weightTrend !== 0 && (
              <View style={styles.trendRow}>
                <Ionicons
                  name={weightTrend === -1 ? 'chevron-down' : 'chevron-up'}
                  size={12}
                  color={weightTrend === -1 ? '#22C55E' : '#EF4444'}
                />
                <Text style={[styles.trendText, { color: weightTrend === -1 ? '#22C55E' : '#EF4444' }]}>
                  {Math.abs(latestWeight! - prevWeight!).toFixed(1)}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.valueRow}>
            <Text style={styles.value}>
              {latestWeight !== null ? latestWeight : '--'}
            </Text>
          </View>
          <Text style={styles.label}>Weight</Text>
          {weightData.length >= 2 ? renderSparkline() : (
            <View style={[styles.emptyStateBadge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.border }]}>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>LOG WEIGHT</Text>
            </View>
          )}
        </View>

        {/* Heart Rate */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <Ionicons name="heart" size={16} color={colors.textSecondary} />
            </View>
          </View>
          <View style={styles.valueRow}>
            {healthSnapshot?.restingHeartRate ? (
              <Text style={styles.value}>
                {healthSnapshot.restingHeartRate}
                <Text style={styles.suffix}> bpm</Text>
              </Text>
            ) : (
              <Text style={styles.value}>--</Text>
            )}
          </View>
          <Text style={styles.label}>Resting HR</Text>
          {!healthSnapshot?.restingHeartRate && (
            <View style={[styles.emptyStateBadge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.border }]}>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>CONNECT DEVICE</Text>
            </View>
          )}
        </View>

        {/* Steps */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <Ionicons name="footsteps" size={16} color={colors.textSecondary} />
            </View>
            {healthSnapshot?.stepsToday ? renderStepsRing(healthSnapshot.stepsToday) : null}
          </View>
          <View style={styles.valueRow}>
            {healthSnapshot?.stepsToday ? (
              <Text style={styles.value}>{healthSnapshot.stepsToday.toLocaleString()}</Text>
            ) : (
              <Text style={styles.value}>--</Text>
            )}
          </View>
          <Text style={styles.label}>Steps Today</Text>
          {!healthSnapshot?.stepsToday && (
            <View style={[styles.emptyStateBadge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.border }]}>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>CONNECT DEVICE</Text>
            </View>
          )}
        </View>

        {/* Calories */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <Ionicons name="flame" size={16} color={colors.textSecondary} />
            </View>
          </View>
          <View style={styles.valueRow}>
            {healthSnapshot?.activeCaloriesToday ? (
              <Text style={styles.value}>
                {healthSnapshot.activeCaloriesToday}
                <Text style={styles.suffix}> kcal</Text>
              </Text>
            ) : (
              <Text style={styles.value}>--</Text>
            )}
          </View>
          <Text style={styles.label}>Active Cal</Text>
          {!healthSnapshot?.activeCaloriesToday && (
            <View style={[styles.emptyStateBadge, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: colors.border }]}>
              <Text style={[styles.emptyStateText, { color: colors.textSecondary }]}>CONNECT DEVICE</Text>
            </View>
          )}
        </View>

        {/* Workouts */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
              <Ionicons name="barbell" size={16} color={colors.textSecondary} />
            </View>
          </View>
          <View style={styles.valueRow}>
            <Text style={styles.value}>{workoutsThisMonth}</Text>
          </View>
          <Text style={styles.label}>This Month</Text>
        </View>

        {/* Streak */}
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.cardHeader}>
            <Animated.View style={[styles.iconWrap, { backgroundColor: colors.bgPrimary, borderColor: colors.border, transform: [{ scale: streakAnim }] }]}>
              <Ionicons name="flame" size={16} color={colors.textSecondary} />
            </Animated.View>
          </View>
          <View style={styles.valueRow}>
            <Text style={styles.value}>
              {streak}
              {streak > 0 && <Text style={styles.emojiText}> 🔥</Text>}
            </Text>
          </View>
          <Text style={styles.label}>Day Streak</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_MARGIN,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    minHeight: 120,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trendText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    marginLeft: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  value: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: '#FFF',
  },
  suffix: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.6)',
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
  },
  emptyStateBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  emptyStateText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1,
  },
  emojiText: {
    fontSize: FontSize.lg,
  },
  sparkline: {
    marginTop: 8,
  },
  stepsRing: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
