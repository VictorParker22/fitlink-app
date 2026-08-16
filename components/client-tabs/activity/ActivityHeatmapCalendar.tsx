import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { FontSize, Spacing, Radius } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useReducedMotion } from '../../../lib/useReducedMotion';

export interface ActivityHeatmapCalendarProps {
  activityMap: Record<string, { inClub: boolean; progress: number; workoutName?: string; duration?: number }>;
  workouts: any[];
}

const screenWidth = Dimensions.get('window').width;
const CALENDAR_PADDING = 20;
const CONTAINER_MARGIN = 16;
const GAP = 6;
const AVAILABLE_WIDTH = screenWidth - (CONTAINER_MARGIN * 2) - (CALENDAR_PADDING * 2);
const CELL_SIZE = Math.min(Math.floor((AVAILABLE_WIDTH - (GAP * 6)) / 7), 36);

export function ActivityHeatmapCalendar({ activityMap, workouts }: ActivityHeatmapCalendarProps) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Reduce Motion: today's cell stays lit at full glow rather than pulsing.
    if (reduceMotion) {
      glowAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim, reduceMotion]);

  const getMonthName = (month: number) => {
    const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return names[month];
  };

  const getMonthCalendar = (year: number, month: number) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const cells: (number | null)[] = [];
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push(-i - 1);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      cells.push(i);
    }

    const remainder = cells.length % 7;
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        cells.push(-(daysInMonth + i + 1));
      }
    }

    return cells;
  };

  const calendarDays = useMemo(() => getMonthCalendar(calYear, calMonth), [calYear, calMonth]);

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
    setSelectedDay(null);
  };

  const handleDayPress = (dayStr: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (selectedDay === dayStr) {
      setSelectedDay(null);
    } else {
      setSelectedDay(dayStr);
    }
  };

  const getIntensityColor = (progress: number) => {
    if (progress === 0 || !progress) return CoachColors.bg;
    if (progress <= 0.25) return CoachColors.accentSofter;
    if (progress <= 0.5) return 'rgba(198,242,78,0.35)';
    if (progress <= 0.75) return 'rgba(198,242,78,0.6)';
    return CoachColors.accent;
  };

  let activeDays = 0;
  let workoutCount = 0;
  let currentStreak = 0;
  let bestStreak = 0;

  for (let i = 1; i <= 31; i++) {
    const dStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const act = activityMap[dStr];
    if (act && act.progress > 0) {
      activeDays++;
      if (act.workoutName) workoutCount++;
      currentStreak++;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const selectedActivity = selectedDay ? activityMap[selectedDay] : null;

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>Activity calendar</Text>

      <View style={styles.navRow}>
        <TouchableOpacity hitSlop={6} onPress={handlePrevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={16} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{getMonthName(calMonth)}, {calYear}</Text>
        <TouchableOpacity hitSlop={6} onPress={handleNextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={16} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.daysHeader}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={styles.dayHeaderText}>{d}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {calendarDays.map((cell, index) => {
          if (cell === null || cell < 0) {
            return (
              <View key={`empty-${index}`} style={[styles.cell, styles.overflowCell]} />
            );
          }

          const dayStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(cell).padStart(2, '0')}`;
          const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === cell;

          const cellDate = new Date(calYear, calMonth, cell);
          const isFuture = cellDate > today;

          const activity = activityMap[dayStr];
          const progress = activity?.progress || 0;
          const bgColor = getIntensityColor(progress);

          const isSelected = selectedDay === dayStr;

          return (
            <TouchableOpacity
              key={`day-${cell}`}
              activeOpacity={0.7}
              onPress={() => handleDayPress(dayStr)}
              style={[
                styles.cell,
                isFuture ? styles.futureCell : { backgroundColor: bgColor },
                isToday && styles.todayCell
              ]}
            >
              {isToday && (
                <Animated.View style={[styles.todayGlow, { opacity: glowAnim }]} />
              )}
              <Text style={[styles.cellText, isSelected && styles.selectedCellText]}>{cell}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDay && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipDate}>{selectedDay}</Text>
          {selectedActivity ? (
            <>
              {selectedActivity.workoutName && <Text style={styles.tooltipWorkout}>{selectedActivity.workoutName}</Text>}
              <View style={styles.tooltipMetaRow}>
                {selectedActivity.duration ? <Text style={styles.tooltipMeta}>{selectedActivity.duration} min</Text> : null}
                <Text style={styles.tooltipMeta}>{selectedActivity.inClub ? 'In club' : 'Out of club'}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.tooltipEmpty}>No activity on this day.</Text>
          )}
        </View>
      )}

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <View style={styles.pill}>
          <Text style={styles.pillNumber}>{activeDays}</Text>
          <Text style={styles.pillLabel}>Active days</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillNumber}>{workoutCount}</Text>
          <Text style={styles.pillLabel}>Workouts</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillNumber}>{bestStreak}</Text>
          <Text style={styles.pillLabel}>Best streak</Text>
        </View>
      </View>

      <View style={styles.legendContainer}>
        <Text style={styles.legendText}>Less</Text>
        <LinearGradient
          colors={[CoachColors.bg, CoachColors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.legendBar}
        />
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius['2xl'],
    padding: CALENDAR_PADDING,
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
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
  },
  daysHeader: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: 8,
  },
  dayHeaderText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textFaint,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  overflowCell: {
    backgroundColor: CoachColors.borderMuted,
  },
  futureCell: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  todayCell: {
    borderWidth: 2,
    borderColor: CoachColors.accent,
  },
  todayGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.sm,
    backgroundColor: CoachColors.accentSoft,
  },
  cellText: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    color: CoachColors.textPrimary,
  },
  selectedCellText: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.accent,
  },
  tooltip: {
    marginTop: 16,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: CoachColors.bg,
    borderColor: CoachColors.borderMuted,
  },
  tooltipDate: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.accent,
    marginBottom: 4,
  },
  tooltipWorkout: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  tooltipMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tooltipMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textSecondary,
  },
  tooltipEmpty: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
  pill: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 10,
    flex: 1,
    backgroundColor: CoachColors.bg,
    borderColor: CoachColors.borderMuted,
  },
  pillNumber: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  pillLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  legendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  legendText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
  legendBar: {
    width: 60,
    height: 6,
    borderRadius: 3,
  }
});
