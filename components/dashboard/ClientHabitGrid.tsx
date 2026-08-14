/**
 * ClientHabitGrid — Coach-side weekly habit dot matrix
 *
 * Shows the last 7 days of a client's habit completions as a grid:
 *   Rows    = habits (Water, Steps, Sleep, Protein, Mindfulness)
 *   Columns = days (Mon → Sun, with today highlighted)
 *   Dots    = filled (accent) = done · dim = missed
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitKey = 'water' | 'steps' | 'sleep' | 'protein' | 'mindfulness';

interface HabitRow {
  key: HabitKey;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

interface HabitGridProps {
  clientId: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const HABITS: HabitRow[] = [
  { key: 'water',       icon: 'water-outline',      label: 'Hydration'   },
  { key: 'steps',       icon: 'footsteps-outline',  label: 'Steps'       },
  { key: 'sleep',       icon: 'moon-outline',       label: 'Sleep'       },
  { key: 'protein',     icon: 'restaurant-outline', label: 'Protein'     },
  { key: 'mindfulness', icon: 'leaf-outline',       label: 'Mindfulness' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLast7Days(): { date: string; dayLabel: string; dayFull: string; isToday: boolean }[] {
  const days = [];
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

function pct(count: number, total: number): number {
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ClientHabitGrid({ clientId }: HabitGridProps) {
  const [fetchedRows, setFetchedRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const { liveHabitRows } = useApp();

  const days = getLast7Days();
  const dateStrings = days.map((d) => d.date);

  // Realtime rows win over the initial fetch — a habit checked off on the
  // athlete's phone flips the dot here without pull-to-refresh.
  const rows: Record<string, any> = { ...fetchedRows };
  for (const d of dateStrings) {
    const live = liveHabitRows[`${clientId}:${d}`];
    if (live) rows[d] = live;
  }

  const fetchHabits = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('client_habits')
        .select('*')
        .eq('client_id', clientId)
        .in('date', dateStrings);

      if (error) throw error;

      // Index by date for O(1) lookup
      const indexed: Record<string, any> = {};
      (data || []).forEach((row) => {
        indexed[row.date] = row;
      });
      setFetchedRows(indexed);
    } catch (err) {
      if (__DEV__) console.log('[ClientHabitGrid] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  // Weekly completion % per habit
  const habitStats = HABITS.map((habit) => {
    const logged = days.filter((d) => rows[d.date]?.[habit.key] === true).length;
    return { ...habit, logged, pct: pct(logged, days.length) };
  });

  // Overall week score
  const totalPossible = HABITS.length * days.length;
  const totalLogged = habitStats.reduce((sum, h) => sum + h.logged, 0);
  const overallPct = pct(totalLogged, totalPossible);

  const scoreColor =
    overallPct === 0   ? CoachColors.textMuted :
    overallPct >= 80   ? CoachColors.accent :
    overallPct >= 50   ? CoachColors.warning : CoachColors.danger;

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <TouchableOpacity
        style={s.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`Habits this week, ${overallPct} percent complete`}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Double tap to collapse the habit grid' : 'Double tap to expand the habit grid'}
      >
        <View>
          <Text style={s.tagHeader}>Habits this week</Text>
          <Text style={s.title}>Daily tracking</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.scoreBadge, { borderColor: `${scoreColor}50` }]}>
            <Text style={[s.scoreText, { color: scoreColor }]}>
              {overallPct}%
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={CoachColors.textMuted}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color={CoachColors.textMuted} />
            </View>
          ) : totalLogged === 0 ? (
            <View style={s.noDataRow}>
              <Text style={s.noDataText}>No habits logged this week</Text>
            </View>
          ) : (
            <>
              {/* ── Day headers ── */}
              <View
                style={s.dayHeaderRow}
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
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: CoachColors.bg,
  },
  scoreText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  loadingRow: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noDataRow: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  noDataText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
  },

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
