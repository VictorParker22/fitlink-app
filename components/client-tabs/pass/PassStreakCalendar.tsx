import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useReducedMotion } from '../../../lib/useReducedMotion';

export interface PassStreakCalendarProps {
  currentStreak: number;
  workouts: any[];
  mealLogs: Record<string, boolean>;
}

export default function PassStreakCalendar({ currentStreak, workouts, mealLogs }: PassStreakCalendarProps) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: hold the streak highlight steady instead of pulsing it.
    if (reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, reduceMotion]);

  // Strip calculation
  const weekDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDay = today.getDay();
    const diffToMonday = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(today);
    monday.setDate(diffToMonday);

    return Array.from({ length: 7 }).map((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      date.setHours(0, 0, 0, 0);

      const dateString = date.toISOString().split('T')[0];
      const isToday = date.getTime() === today.getTime();
      const isFuture = date.getTime() > today.getTime();
      const isPast = date.getTime() < today.getTime();

      const hasCompletedWorkout = workouts.some(w =>
        w.status === 'completed' &&
        (w.completed_at?.startsWith(dateString) || w.assigned_date?.startsWith(dateString))
      );

      let status: 'completed' | 'today' | 'future' | 'missed';
      if (hasCompletedWorkout) {
        status = 'completed';
      } else if (isToday) {
        status = 'today';
      } else if (isFuture) {
        status = 'future';
      } else {
        status = 'missed';
      }

      return {
        date,
        label: ['M', 'T', 'W', 'T', 'F', 'S', 'S'][index],
        status,
      };
    });
  }, [workouts]);

  // Month grid calculation
  const monthWeeks = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];

    // Fill first week empty slots
    for (let i = 0; i < firstDay.getDay(); i++) {
      currentWeek.push(new Date(year, month, 1 - (firstDay.getDay() - i)));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      currentWeek.push(new Date(year, month, i));
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      // Fill last week empty slots
      let d = 1;
      while (currentWeek.length < 7) {
        currentWeek.push(new Date(year, month + 1, d++));
      }
      weeks.push(currentWeek);
    }

    return weeks.map(week => week.map(date => {
      const dateString = date.toISOString().split('T')[0];
      const dateWorkouts = workouts.filter(w =>
        w.status === 'completed' &&
        (w.completed_at?.startsWith(dateString) || w.assigned_date?.startsWith(dateString))
      );
      return {
        date,
        isCurrentMonth: date.getMonth() === month,
        score: dateWorkouts.length * 2,
      };
    }));
  }, [workouts]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.1],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.6],
  });

  return (
    <View style={styles.card}>
      {/* Part 1: 7-Day Streak Strip */}
      <View style={styles.streakHeader}>
        <Text style={styles.sectionHeader}>Current streak</Text>
        <View style={styles.fireBadge}>
          <Ionicons name="flame" size={12} color={CoachColors.accent} />
          <Text style={styles.fireBadgeText}>{currentStreak}</Text>
        </View>
      </View>

      <View style={styles.stripContainer}>
        {weekDays.map((day, i) => (
          <View key={i} style={styles.dayCol}>
            <View style={styles.circleContainer}>
              {day.status === 'completed' && (
                <View style={[styles.circle, styles.circleCompleted]}>
                  <Ionicons name="checkmark-sharp" size={20} color={CoachColors.onAccent} />
                </View>
              )}
              {day.status === 'today' && (
                <Animated.View
                  style={[
                    styles.circle,
                    styles.circleToday,
                    { transform: [{ scale: pulseScale }], opacity: pulseOpacity }
                  ]}
                />
              )}
              {day.status === 'future' && (
                <View style={[styles.circle, styles.circleFuture]} />
              )}
              {day.status === 'missed' && (
                <View style={[styles.circle, styles.circleMissed]}>
                  <Text style={styles.missedText}>-</Text>
                </View>
              )}
            </View>
            <Text style={styles.dayLabel}>{day.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Part 2: Monthly Activity Dot Grid */}
      <Text style={[styles.sectionHeader, { marginBottom: Spacing.md }]}>This month</Text>

      <View style={styles.gridHeader}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <Text key={i} style={styles.gridHeaderLabel}>{day}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {monthWeeks.map((week, wIndex) => (
          <View key={wIndex} style={styles.gridRow}>
            {week.map((day, dIndex) => {
              let dotStyle = styles.dotEmpty;
              if (day.isCurrentMonth) {
                if (day.score >= 2) {
                  dotStyle = styles.dotHeavy;
                } else if (day.score === 1) { // Not realistically hit since workouts add 2
                  dotStyle = styles.dotMedium;
                } else if (day.score === 0) {
                  dotStyle = styles.dotEmptyMonth;
                }
              }
              return <View key={dIndex} style={[styles.dot, dotStyle]} />;
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius['2xl'],
    padding: 20,
    marginBottom: Spacing.xl,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
  },
  fireBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
  },
  fireBadgeText: {
    color: CoachColors.accent,
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
  },
  stripContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  dayCol: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  circleContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleCompleted: {
    backgroundColor: CoachColors.accent,
  },
  circleToday: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: CoachColors.accent,
  },
  circleFuture: {
    backgroundColor: CoachColors.borderMuted,
  },
  circleMissed: {
    backgroundColor: CoachColors.borderMuted,
  },
  missedText: {
    color: CoachColors.textFaint,
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
  },
  dayLabel: {
    fontSize: 10,
    color: CoachColors.textFaint,
    fontFamily: CoachFonts.bodySemiBold,
  },
  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: Spacing.lg,
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  gridHeaderLabel: {
    fontSize: 8,
    color: CoachColors.textFaint,
    fontFamily: CoachFonts.bodyBold,
    width: 10,
    textAlign: 'center',
  },
  grid: {
    gap: Spacing.sm,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },
  dotEmpty: {
    backgroundColor: 'transparent',
  },
  dotEmptyMonth: {
    backgroundColor: CoachColors.borderMuted,
  },
  dotMedium: {
    backgroundColor: 'rgba(198,242,78,0.5)',
  },
  dotHeavy: {
    backgroundColor: CoachColors.accent,
  },
});
