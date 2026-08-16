import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import Svg, { Path, Circle as SvgCircle, Line, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { FontSize, Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../../../lib/useReducedMotion';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

interface ActivityBodyProgressProps {
  progressLogs: any[];
}

export const ActivityBodyProgress: React.FC<ActivityBodyProgressProps> = ({ progressLogs }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: park the decorative pulse fully opaque, never loop.
    if (reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, reduceMotion]);

  const validEntries = useMemo(() => {
    if (!progressLogs) return [];
    const entries = progressLogs
      .filter((log) => log.weight != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return entries.slice(-30);
  }, [progressLogs]);

  if (validEntries.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.tagHeader}>Body progress</Text>
        <Text style={styles.title}>Weight trend</Text>
        <View style={styles.emptyState}>
          <Ionicons name="scale-outline" size={48} color={CoachColors.textFaint} />
          <Text style={styles.emptyText}>Log your first weight to start tracking trends</Text>
          <TouchableOpacity
            style={styles.logButtonWrapper}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={styles.logButtonText}>Log weight</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const latestWeight = validEntries[validEntries.length - 1].weight;
  const firstWeight = validEntries[0].weight;
  const totalChange = latestWeight - firstWeight;
  const firstDate = new Date(validEntries[0].date);
  const monthName = firstDate.toLocaleString('default', { month: 'short' });
  const day = firstDate.getDate();

  const minWeight = Math.min(...validEntries.map((e) => e.weight)) - 5;
  const maxWeight = Math.max(...validEntries.map((e) => e.weight)) + 5;
  const averageWeight = validEntries.reduce((acc, curr) => acc + curr.weight, 0) / validEntries.length;

  const hasBodyFat = validEntries.some((e) => e.body_fat != null);
  const latestBodyFat = hasBodyFat ? [...validEntries].reverse().find(e => e.body_fat != null)?.body_fat : null;

  const chartWidth = 300;
  const chartHeight = 160;

  const getPoint = (index: number, weight: number) => {
    const x = validEntries.length === 1 ? chartWidth / 2 : (index / (validEntries.length - 1)) * chartWidth;
    const y = chartHeight - ((weight - minWeight) / (maxWeight - minWeight)) * chartHeight;
    return { x, y };
  };

  const points = validEntries.map((e, i) => getPoint(i, e.weight));

  const pathString = points.reduce((acc, point, index) => {
    return index === 0 ? `M ${point.x},${point.y}` : `${acc} L ${point.x},${point.y}`;
  }, '');

  const fillPathString = `${pathString} L ${points[points.length - 1].x},${chartHeight} L ${points[0].x},${chartHeight} Z`;

  const avgY = chartHeight - ((averageWeight - minWeight) / (maxWeight - minWeight)) * chartHeight;

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>Body progress</Text>
      <Text style={styles.title}>Weight trend</Text>

      <View style={styles.chartContainer}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          <Defs>
            <SvgLinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={CoachColors.accentSoft} />
              <Stop offset="1" stopColor="transparent" />
            </SvgLinearGradient>
          </Defs>

          <Line x1="0" y1={avgY} x2={chartWidth} y2={avgY} stroke={CoachColors.borderMuted} strokeWidth="1" strokeDasharray="4 4" />

          <Path d={fillPathString} fill="url(#gradient)" />
          <Path d={pathString} stroke={CoachColors.accent} strokeWidth="2" fill="none" />

          {points.map((p, i) => (
            <SvgCircle key={i} cx={p.x} cy={p.y} r="3" fill={CoachColors.accent} />
          ))}
          {points.length > 0 && (
            <AnimatedCircle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r="6"
              fill={CoachColors.accent}
              opacity={pulseAnim}
            />
          )}
        </Svg>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statColumn}>
          <Text style={styles.statCurrent}>{latestWeight}lbs</Text>
        </View>
        <View style={styles.verticalDivider} />
        <View style={styles.statColumnCenter}>
          <Text style={[styles.statChange, { color: totalChange <= 0 ? CoachColors.accent : CoachColors.danger }]}>
            {totalChange > 0 ? '+' : ''}{totalChange.toFixed(1)}
          </Text>
        </View>
        <View style={styles.verticalDivider} />
        <View style={styles.statColumnRight}>
          <Text style={styles.statSince}>Since {monthName} {day}</Text>
        </View>
      </View>

      {hasBodyFat && latestBodyFat != null && (
        <View style={styles.bodyFatRow}>
          <Text style={styles.bodyFatText}>Body fat: {latestBodyFat}%</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    marginBottom: Spacing.xl,
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.borderMuted,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xs,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize.xl,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.sm,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  logButtonWrapper: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accent,
  },
  logButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: FontSize.sm,
    color: CoachColors.onAccent,
  },
  chartContainer: {
    height: 160,
    width: '100%',
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  verticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: CoachColors.borderMuted,
  },
  statColumn: {
    flex: 1,
  },
  statColumnCenter: {
    flex: 1,
    alignItems: 'center',
  },
  statColumnRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statCurrent: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize['2xl'],
    color: CoachColors.textPrimary,
  },
  statChange: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize.lg,
  },
  statSince: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
  },
  bodyFatRow: {
    marginTop: Spacing.sm,
  },
  bodyFatText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.sm,
    color: CoachColors.textMuted,
  },
});
