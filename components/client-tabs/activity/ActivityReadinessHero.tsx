import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FontFamily, FontSize, Spacing, Radius } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { useTheme } from '../../../context/ThemeContext';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

export interface ActivityReadinessHeroProps {
  streak: number;
  workouts: any[];
  healthSnapshot?: { restingHeartRate: number | null; stepsToday: number; heartRateAvg24h: number | null } | null;
}

export const ActivityReadinessHero: React.FC<ActivityReadinessHeroProps> = ({
  streak,
  workouts,
  healthSnapshot
}) => {
  const { colors } = useTheme();

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const readinessInfo = useMemo(() => {
    let score = 0;
    const hasHealth = !!healthSnapshot?.restingHeartRate;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDayDiff = (dateStr: string) => {
      const d = new Date(dateStr);
      d.setHours(0, 0, 0, 0);
      return Math.round((today.getTime() - d.getTime()) / (1000 * 3600 * 24));
    };

    const completedWorkouts = workouts.filter(w => w.status === 'completed' && w.completed_at);
    
    const completedYesterday = completedWorkouts.some(w => getDayDiff(w.completed_at) === 1);
    
    let completedLast5Days = 0;
    for (let i = 1; i <= 5; i++) {
        if (completedWorkouts.some(w => getDayDiff(w.completed_at) === i)) {
            completedLast5Days++;
        }
    }
    const completedLast3of5 = completedLast5Days >= 3;
    const restDayYesterday = !completedYesterday;

    if (hasHealth) {
      const rhr = healthSnapshot?.restingHeartRate || 60;
      const rhrScore = Math.min(Math.max(1 - (rhr - 60) / 40, 0), 1) * 35;
      const stepsScore = Math.min(Math.max((healthSnapshot?.stepsToday || 0) / 8000, 0), 1) * 25;
      const streakScore = Math.min(Math.max(streak / 7, 0), 1) * 20;
      const recentScore = completedYesterday ? 20 : 10;
      score = rhrScore + stepsScore + streakScore + recentScore;
    } else {
      const streakScore = Math.min(Math.max(streak / 7, 0), 1) * 40;
      const recentScore = completedLast3of5 ? 30 : 15;
      const restScore = restDayYesterday ? 30 : 20;
      score = streakScore + recentScore + restScore;
    }
    
    score = Math.round(score);

    let color = '#EF4444';
    let colorRgb = '239,68,68';
    let label = 'LOW';
    let message = 'Recovery day recommended 🧘';
    
    if (score >= 85) {
      color = '#22C55E';
      colorRgb = '34,197,94';
      label = 'PRIME';
      message = 'Great day to push hard 💪';
    } else if (score >= 60) {
      color = '#FFD700';
      colorRgb = '255,215,0';
      label = 'GOOD';
      message = 'Maintain your baseline today';
    }

    return { score, color, colorRgb, label, message };
  }, [streak, workouts, healthSnapshot]);

  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: readinessInfo.score / 100,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [readinessInfo.score]);

  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const strokeDashoffset = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0]
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={styles.tagHeader}>READINESS // RECOVERY COCKPIT</Text>

      <View style={styles.topRow}>
        <View style={styles.gaugeContainer}>
          <Svg width={size} height={size} style={styles.svg}>
            <SvgCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={readinessInfo.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeOpacity={0.08}
            />
            <AnimatedCircle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={readinessInfo.color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
            />
          </Svg>
          <View style={styles.centerContent}>
            <Text style={styles.scoreText}>{readinessInfo.score}</Text>
            <Text style={[styles.labelText, { color: readinessInfo.color }]}>{readinessInfo.label}</Text>
          </View>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,107,53,0.12)' }]}>
              <Ionicons name="flame" size={14} color="#FF6B35" />
            </View>
            <Text style={styles.statTextMain}>{streak} Day Streak</Text>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(77,148,255,0.12)' }]}>
              <Ionicons name="footsteps" size={14} color="#4D94FF" />
            </View>
            <Text style={styles.statTextSub}>
              {healthSnapshot ? `${healthSnapshot.stepsToday} steps` : 'No device'}
            </Text>
          </View>
          <View style={styles.statRow}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
              <Ionicons name="heart" size={14} color="#EF4444" />
            </View>
            <Text style={styles.statTextSub}>
              {healthSnapshot?.restingHeartRate ? `${healthSnapshot.restingHeartRate} bpm` : '--'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={[
        styles.contextBadge, 
        { 
          backgroundColor: `rgba(${readinessInfo.colorRgb},0.08)`, 
          borderColor: `rgba(${readinessInfo.colorRgb},0.15)` 
        }
      ]}>
        <Text style={[styles.contextText, { color: readinessInfo.color }]}>
          {readinessInfo.message}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    width: '100%',
    overflow: 'hidden',
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    marginBottom: Spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  svg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }]
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize['3xl'],
    color: '#FFFFFF',
  },
  labelText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  statsContainer: {
    flex: 1,
    marginLeft: Spacing.xl,
    justifyContent: 'center',
    gap: Spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextMain: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.sm,
    color: '#FFFFFF',
  },
  statTextSub: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.35)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 16,
  },
  contextBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  contextText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: FontSize.sm,
    textAlign: 'center',
  }
});
