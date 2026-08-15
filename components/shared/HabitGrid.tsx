/**
 * HabitGrid — shared weekly habit dot matrix (presentational).
 *
 * The one grid both sides render from a client's client_habits rows:
 *   - Coach: components/dashboard/ClientHabitGrid.tsx (adds fetch, realtime
 *     overlay, collapsible header and score badge around it)
 *   - Athlete: app/(client-tabs)/my-progress.tsx ("Your habits this week")
 *
 * Rows    = habits (Hydration, Steps, Sleep, Protein, Mindfulness)
 * Columns = days (last 7, today highlighted)
 * Dots    = filled (accent) = done · dim = missed
 *
 * Purely presentational: takes date-indexed rows, draws the day headers, the
 * five habit rows with per-square a11y labels, per-habit weekly % and the
 * legend. The done pop-in animation runs only when a square flips to done
 * while mounted, and is Reduce Motion gated.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HabitKey = 'water' | 'steps' | 'sleep' | 'protein' | 'mindfulness';

export interface HabitRow {
  key: HabitKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

export interface GridDay {
  date: string;
  dayLabel: string;
  dayFull: string;
  isToday: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export const HABITS: HabitRow[] = [
  { key: 'water',       icon: 'water-outline',      label: 'Hydration'   },
  { key: 'steps',       icon: 'footsteps-outline',  label: 'Steps'       },
  { key: 'sleep',       icon: 'moon-outline',       label: 'Sleep'       },
  { key: 'protein',     icon: 'restaurant-outline', label: 'Protein'     },
  { key: 'mindfulness', icon: 'leaf-outline',       label: 'Mindfulness' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getLast7Days(): GridDay[] {
  const days: GridDay[] = [];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    days.push({
      date,
      dayLabel: dayNames[d.getDay()],
      dayFull: dayFullNames[d.getDay()],
      isToday: date === today,
    });
  }
  return days;
}

export function pct(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

// ─── Dot ─────────────────────────────────────────────────────────────────────

function HabitDot({
  done,
  isToday,
  label,
}: {
  done: boolean;
  isToday: boolean;
  label: string;
}) {
  // Pop the filled dot in when it flips to done while mounted (realtime
  // update) — first render paints instantly with no animation.
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const prevDone = useRef(done);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (done && !prevDone.current && !reduced) {
      scale.value = 0.2;
      opacity.value = 0.2;
      scale.value = withSpring(1, { damping: 12, stiffness: 220 });
      opacity.value = withTiming(1, { duration: 260 });
    }
    prevDone.current = done;
  }, [done, scale, opacity, reduced]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View
      style={[
        dot.wrapper,
        isToday && dot.todayWrapper,
      ]}
      accessible={true}
      accessibilityLabel={label}
    >
      <Animated.View
        style={[
          dot.circle,
          done
            ? { backgroundColor: CoachColors.accent }
            : { backgroundColor: CoachColors.borderMuted },
          isToday && !done && { borderWidth: 1, borderColor: CoachColors.border },
          animStyle,
        ]}
      />
    </View>
  );
}

const dot = StyleSheet.create({
  wrapper: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWrapper: {
    backgroundColor: CoachColors.accentSofter,
    borderRadius: 8,
  },
  circle: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
});

// ─── Grid ─────────────────────────────────────────────────────────────────────

interface HabitGridProps {
  /** client_habits rows indexed by ISO date (YYYY-MM-DD). */
  rows: Record<string, any>;
  /** Days to draw (defaults to the last 7). Pass the same array used to fetch. */
  days?: GridDay[];
  /**
   * Divider above the day headers. On the coach side it separates the grid
   * from the collapsible header (default); the athlete card has nothing above
   * the grid, so it turns this off.
   */
  showTopBorder?: boolean;
}

export default function HabitGrid({ rows, days: daysProp, showTopBorder = true }: HabitGridProps) {
  const days = daysProp || getLast7Days();

  // Weekly completion % per habit
  const habitStats = HABITS.map((habit) => {
    const logged = days.filter((d) => rows[d.date]?.[habit.key] === true).length;
    return { ...habit, logged, pct: pct(logged, days.length) };
  });

  return (
    <>
      {/* ── Day headers ── */}
      <View
        style={[s.dayHeaderRow, !showTopBorder && { borderTopWidth: 0 }]}
        accessible={true}
        accessibilityLabel={`Habit grid, last 7 days, ${days[0].dayFull} to ${days[6].dayFull}. One row per habit, one square per day`}
      >
        {/* Habit label col spacer */}
        <View style={s.habitLabelCol} />
        {days.map((day) => (
          <View key={day.date} style={s.dayHeaderCell}>
            <Text
              style={[
                s.dayLabel,
                day.isToday && { color: CoachColors.accent, fontFamily: CoachFonts.headingBold },
              ]}
            >
              {day.dayLabel}
            </Text>
            {day.isToday && <View style={s.todayDot} />}
          </View>
        ))}
        {/* Pct col header */}
        <View style={s.pctCol}>
          <Text style={s.dayLabel}>AVG</Text>
        </View>
      </View>

      {/* ── Habit rows ── */}
      {HABITS.map((habit, hi) => {
        const stat = habitStats[hi];
        return (
          <View
            key={habit.key}
            style={[
              s.habitRow,
              hi < HABITS.length - 1 && s.habitRowBorder,
            ]}
          >
            {/* Habit label */}
            <View style={s.habitLabelCol} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden={true}>
              <Ionicons name={habit.icon} size={16} color={CoachColors.textSecondary} />
            </View>

            {/* Dots */}
            {days.map((day) => {
              const done = rows[day.date]?.[habit.key] === true;
              return (
                <HabitDot
                  key={day.date}
                  done={done}
                  isToday={day.isToday}
                  label={`${habit.label}, ${day.dayFull}, ${done ? 'done' : 'missed'}`}
                />
              );
            })}

            {/* % completion */}
            <View style={s.pctCol}>
              <Text
                style={[
                  s.pctText,
                  { color: stat.pct >= 80 ? CoachColors.accent : stat.pct >= 50 ? CoachColors.warning : stat.pct === 0 ? CoachColors.textFaint : CoachColors.danger },
                ]}
              >
                {stat.pct}%
              </Text>
            </View>
          </View>
        );
      })}

      {/* ── Legend ── */}
      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: CoachColors.accent }]} />
          <Text style={s.legendText}>Completed</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: CoachColors.borderMuted }]} />
          <Text style={s.legendText}>Missed</Text>
        </View>
        <View style={[s.legendItem, { marginLeft: 'auto' }]}>
          <View style={[s.legendDot, { backgroundColor: CoachColors.accentSofter, borderWidth: 1, borderColor: CoachColors.border }]} />
          <Text style={s.legendText}>Today</Text>
        </View>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Day header row
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  habitLabelCol: {
    width: 36,
    alignItems: 'center',
  },
  dayHeaderCell: {
    width: 32,
    alignItems: 'center',
    gap: 3,
  },
  dayLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 0.5,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: CoachColors.accent,
  },
  pctCol: {
    width: 36,
    alignItems: 'flex-end',
  },
  pctText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },

  // Habit rows
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 44, // HIG 44pt minimum touch target height; min (not fixed) so large font scales don't clip
  },
  habitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: CoachColors.textMuted,
  },
});
