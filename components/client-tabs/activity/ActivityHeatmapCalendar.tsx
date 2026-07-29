import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { FontFamily, FontSize, Spacing, Radius } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../context/ThemeContext';

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
  const { colors } = useTheme();
  
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, [glowAnim]);

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
    if (progress === 0 || !progress) return colors.bgPrimary;
    if (progress <= 0.25) return colors.accentSoft;
    if (progress <= 0.5) return 'rgba(255,107,53, 0.50)';
    if (progress <= 0.75) return 'rgba(255,107,53, 0.75)';
    return colors.accent;
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
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={styles.tagHeader}>ACTIVITY // CALENDAR</Text>
      
      <View style={styles.navRow}>
        <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={16} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{getMonthName(calMonth)}, {calYear}</Text>
        <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
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
                isFuture ? [styles.futureCell, { backgroundColor: colors.bgPrimary, borderColor: colors.border }] : { backgroundColor: bgColor },
                isToday && [styles.todayCell, { borderColor: colors.accent }]
              ]}
            >
              {isToday && (
                <Animated.View style={[styles.todayGlow, { opacity: glowAnim, backgroundColor: colors.accentSoft }]} />
              )}
              <Text style={[styles.cellText, isSelected && [styles.selectedCellText, { color: colors.textInverse }]]}>{cell}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDay && (
        <View style={[styles.tooltip, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
          <Text style={[styles.tooltipDate, { color: colors.accent }]}>{selectedDay}</Text>
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
        <View style={[styles.pill, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
          <Text style={styles.pillNumber}>{activeDays}</Text>
          <Text style={styles.pillLabel}>ACTIVE DAYS</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
          <Text style={styles.pillNumber}>{workoutCount}</Text>
          <Text style={styles.pillLabel}>WORKOUTS</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.bgPrimary, borderColor: colors.border }]}>
          <Text style={styles.pillNumber}>{bestStreak}</Text>
          <Text style={styles.pillLabel}>BEST STREAK</Text>
        </View>
      </View>

      <View style={styles.legendContainer}>
        <Text style={styles.legendText}>0</Text>
        <LinearGradient 
          colors={[colors.bgPrimary, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.legendBar}
        />
        <Text style={styles.legendText}>5+</Text>
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
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  daysHeader: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: 8,
  },
  dayHeaderText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  futureCell: {
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  todayCell: {
    borderWidth: 2,
  },
  todayGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.sm,
  },
  cellText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: '#FFFFFF',
  },
  selectedCellText: {
    fontFamily: FontFamily.bodyBold,
  },
  tooltip: {
    marginTop: 16,
    padding: 12,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  tooltipDate: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFD700',
    marginBottom: 4,
  },
  tooltipWorkout: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  tooltipMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tooltipMeta: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  tooltipEmpty: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
  },
  pillNumber: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  pillLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
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
    fontFamily: FontFamily.bodyMedium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  legendBar: {
    width: 60,
    height: 6,
    borderRadius: 3,
  }
});
