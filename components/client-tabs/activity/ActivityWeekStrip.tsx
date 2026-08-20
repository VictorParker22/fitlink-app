import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { FontSize, Spacing, Radius } from '../../../constants/theme';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export interface ActivityWeekStripProps {
  workouts: any[];
  sessions: any[];
  progressLogs: any[];
}

export function ActivityWeekStrip({ workouts = [], sessions = [], progressLogs = [] }: ActivityWeekStripProps) {
  const weekData = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDay();
    const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    const days = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let activeCount = 0;

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const isToday = new Date().toDateString() === d.toDateString();

      const dayActivities: { type: 'completed' | 'pending'; category: string }[] = [];

      workouts.forEach(w => {
        if (w.status === 'completed' && w.completed_at?.startsWith(dStr)) {
          dayActivities.push({ type: 'completed', category: w.workouts?.category || 'default' });
        } else if (w.status === 'assigned' && w.assigned_date?.startsWith(dStr)) {
          dayActivities.push({ type: 'pending', category: 'pending' });
        }
      });

      sessions.forEach(s => {
        if (s.status === 'completed' && s.date?.startsWith(dStr)) {
          dayActivities.push({ type: 'completed', category: s.category || 'session' });
        }
      });

      progressLogs.forEach(p => {
        if (p.date?.startsWith(dStr)) {
          dayActivities.push({ type: 'completed', category: 'Other' });
        }
      });

      if (dayActivities.some(a => a.type === 'completed')) {
        activeCount++;
      }

      days.push({
        label: dayNames[i],
        dateNum: d.getDate(),
        isToday,
        activities: dayActivities,
      });
    }

    return { days, activeCount };
  }, [workouts, sessions, progressLogs]);

  const handleDayPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>Weekly overview</Text>

      <View style={styles.row}>
        {weekData.days.map((day, idx) => {
          const hasCompleted = day.activities.some(a => a.type === 'completed');
          const isPendingOnly = !hasCompleted && day.activities.some(a => a.type === 'pending');
          const completedActivities = day.activities.filter(a => a.type === 'completed');

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.7}
              onPress={handleDayPress}
              style={[styles.column, day.isToday && styles.todayColumn]}
            >
              <Text style={styles.dayLabel}>{day.label}</Text>
              <Text style={[styles.dateNum, (hasCompleted || day.isToday) ? styles.dateNumActive : {}, day.isToday ? styles.dateNumToday : {}]}>
                {day.dateNum}
              </Text>

              <View style={styles.indicatorContainer}>
                {completedActivities.length > 1 ? (
                  <View style={styles.multiDotContainer}>
                     {completedActivities.slice(0, 3).map((act, i) => (
                       <View key={i} style={styles.smallDot} />
                     ))}
                  </View>
                ) : completedActivities.length === 1 ? (
                  <View style={styles.filledCircle} />
                ) : isPendingOnly ? (
                  <View style={styles.pendingCircle} />
                ) : (
                  <View style={styles.emptyCircle} />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.divider} />

      <View style={styles.summaryContainer}>
        <View style={styles.summaryTextRow}>
          <Text style={styles.summaryNumber}>{weekData.activeCount}</Text>
          <Text style={styles.summaryText}> of 7 days active</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View
            style={[styles.progressBarFill, { width: `${(weekData.activeCount / 7) * 100}%` }]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius['2xl'],
    borderCurve: 'continuous',
    padding: Spacing.xl,
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.borderMuted,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
  },
  todayColumn: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: 'rgba(198,242,78,0.2)',
  },
  dayLabel: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    marginBottom: 4,
  },
  dateNum: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.base,
    color: CoachColors.textMuted,
    marginBottom: 8,
  },
  dateNumActive: {
    color: CoachColors.textPrimary,
  },
  dateNumToday: {
    color: CoachColors.accent,
  },
  indicatorContainer: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    backgroundColor: CoachColors.borderMuted,
  },
  pendingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderStyle: 'dashed',
  },
  filledCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  multiDotContainer: {
    flexDirection: 'row',
    gap: Spacing['2xs'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: 12,
  },
  summaryContainer: {
    marginTop: 4,
  },
  summaryTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  summaryNumber: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize.base,
    color: CoachColors.textPrimary,
  },
  summaryText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: FontSize.sm,
    color: CoachColors.textSecondary,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 2,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
  },
});
