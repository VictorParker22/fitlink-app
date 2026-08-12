/**
 * ClientHabitGrid — Coach-side weekly habit dot matrix
 *
 * Shows the last 7 days of a client's habit completions as a grid:
 *   Rows    = habits (Water, Steps, Sleep, Protein, Mindfulness)
 *   Columns = days (Mon → Sun, with today highlighted)
 *   Dots    = filled (habit color) = done · dim = missed
 *
 * Matches HubFit's signature "See how your client performed all week,
 * at a glance" feature — built to FitLink's editorial standard.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { FontFamily } from '../../constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitKey = 'water' | 'steps' | 'sleep' | 'protein' | 'mindfulness';

interface HabitRow {
  key: HabitKey;
  emoji: string;
  label: string;
  color: string;
}

interface HabitGridProps {
  clientId: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const HABITS: HabitRow[] = [
  { key: 'water',       emoji: '💧', label: 'Hydration',   color: '#5B7FFF' },
  { key: 'steps',       emoji: '👣', label: 'Steps',       color: '#22C55E' },
  { key: 'sleep',       emoji: '😴', label: 'Sleep',       color: '#A855F7' },
  { key: 'protein',     emoji: '🥩', label: 'Protein',     color: '#FF6B35' },
  { key: 'mindfulness', emoji: '🧘', label: 'Mindfulness', color: '#FFD700' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLast7Days(): { date: string; dayLabel: string; isToday: boolean }[] {
  const days = [];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const today = new Date().toISOString().split('T')[0];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    days.push({
      date,
      dayLabel: dayNames[d.getDay()],
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
  color,
  isToday,
}: {
  done: boolean;
  color: string;
  isToday: boolean;
}) {
  return (
    <View
      style={[
        dot.wrapper,
        isToday && dot.todayWrapper,
      ]}
    >
      <View
        style={[
          dot.circle,
          done
            ? { backgroundColor: color }
            : { backgroundColor: 'rgba(255,255,255,0.08)' },
          isToday && !done && { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
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
    backgroundColor: 'rgba(255,255,255,0.04)',
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
  const [rows, setRows] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const days = getLast7Days();
  const dateStrings = days.map((d) => d.date);

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
      setRows(indexed);
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
    overallPct === 0   ? '#8E8E93' :
    overallPct >= 80   ? '#22C55E' :
    overallPct >= 50   ? '#FFD700' : '#FF6B35';

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <TouchableOpacity
        style={s.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.85}
      >
        <View>
          <Text style={s.tagHeader}>HABITS // THIS WEEK</Text>
          <Text style={s.title}>Daily Tracking</Text>
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
            color="rgba(255,255,255,0.3)"
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {loading ? (
            <View style={s.loadingRow}>
              <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
            </View>
          ) : totalLogged === 0 ? (
            <View style={s.noDataRow}>
              <Text style={s.noDataText}>No habits logged this week</Text>
            </View>
          ) : (
            <>
              {/* ── Day headers ── */}
              <View style={s.dayHeaderRow}>
                {/* Habit label col spacer */}
                <View style={s.habitLabelCol} />
                {days.map((day) => (
                  <View key={day.date} style={s.dayHeaderCell}>
                    <Text
                      style={[
                        s.dayLabel,
                        day.isToday && { color: '#5B7FFF', fontFamily: FontFamily.headingExtraBold },
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
                    <View style={s.habitLabelCol}>
                      <Text style={s.habitEmoji}>{habit.emoji}</Text>
                    </View>

                    {/* Dots */}
                    {days.map((day) => {
                      const done = rows[day.date]?.[habit.key] === true;
                      return (
                        <HabitDot
                          key={day.date}
                          done={done}
                          color={habit.color}
                          isToday={day.isToday}
                        />
                      );
                    })}

                    {/* % completion */}
                    <View style={s.pctCol}>
                      <Text
                        style={[
                          s.pctText,
                          { color: stat.pct >= 80 ? '#22C55E' : stat.pct >= 50 ? '#FFD700' : stat.pct === 0 ? 'rgba(255,255,255,0.2)' : '#FF6B35' },
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
                  <View style={[s.legendDot, { backgroundColor: '#5B7FFF' }]} />
                  <Text style={s.legendText}>Completed</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
                  <Text style={s.legendText}>Missed</Text>
                </View>
                <View style={[s.legendItem, { marginLeft: 'auto' }]}>
                  <View style={[s.legendDot, { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' }]} />
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreText: {
    fontFamily: FontFamily.headingExtraBold,
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
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
  },

  // Day header row
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.5,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#5B7FFF',
  },
  pctCol: {
    width: 36,
    alignItems: 'flex-end',
  },
  pctText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    letterSpacing: 0.3,
  },

  // Habit rows
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 44, // HIG 44pt minimum touch target height
  },
  habitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  habitEmoji: {
    fontSize: 16,
    textAlign: 'center',
  },

  // Legend
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
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
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
});
