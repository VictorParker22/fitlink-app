/**
 * HabitTracker — Daily Habit Checklist (Client Side)
 *
 * Smart auto-population from existing app data sources:
 *   💧 Water     → AsyncStorage (HydrationCell oz) ≥ 64oz
 *   👣 Steps     → HealthContext stepsToday ≥ 8,000
 *   🥩 Protein   → ClientContext consumedProtein ≥ 80% of target
 *   😴 Sleep     → Always manual (no data source)
 *   🧘 Mindful   → Always manual
 *
 * Auto-checked habits show an [AUTO] pill and a data-source subtitle.
 * Users can still manually override any auto-check.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../../lib/supabase';
import { useHealth } from '../../../context/HealthContext';
import { useClient } from '../../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

// ─── Types ────────────────────────────────────────────────────────────────────

type HabitKey = 'water' | 'steps' | 'sleep' | 'protein' | 'mindfulness';

interface HabitConfig {
  key: HabitKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  defaultDesc: string;
  autoSource: 'health' | 'hydration' | 'nutrition' | null;
  cutoffHour: number | null; // null = never goes red (sleep)
}

interface DailyHabits {
  water: boolean;
  steps: boolean;
  sleep: boolean;
  protein: boolean;
  mindfulness: boolean;
}

interface HabitTrackerProps {
  clientId: string | undefined;
  onHabitsChange?: (summary: {
    completedCount: number;
    totalCount: number;
    topIncomplete?: {
      key: string;
      label: string;
      cutoffHour: number | null;
    };
  }) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const HABITS: HabitConfig[] = [
  {
    key: 'water',
    label: 'Hydration',
    icon: 'water-outline',
    color: CoachColors.accent,
    defaultDesc: '8 glasses of water',
    autoSource: 'hydration',
    cutoffHour: 23,
  },
  {
    key: 'steps',
    label: 'Steps',
    icon: 'footsteps-outline',
    color: CoachColors.accent,
    defaultDesc: '8,000+ steps today',
    autoSource: 'health',
    cutoffHour: 23,
  },
  {
    key: 'sleep',
    label: 'Sleep',
    icon: 'moon-outline',
    color: CoachColors.accent,
    defaultDesc: '7–9 hours last night',
    autoSource: null,
    cutoffHour: null,
  },
  {
    key: 'protein',
    label: 'Protein',
    icon: 'restaurant-outline',
    color: CoachColors.accent,
    defaultDesc: 'Hit your protein goal',
    autoSource: 'nutrition',
    cutoffHour: 23,
  },
  {
    key: 'mindfulness',
    label: 'Mindfulness',
    icon: 'leaf-outline',
    color: CoachColors.accent,
    defaultDesc: '10 min focus/meditation',
    autoSource: null,
    cutoffHour: 22,
  },
];

const DEFAULT_HABITS: DailyHabits = {
  water: false,
  steps: false,
  sleep: false,
  protein: false,
  mindfulness: false,
};

const TODAY = new Date().toISOString().split('T')[0];
const HYDRATION_KEY = 'fitlink_hydration_' + new Date().toDateString();
const STEPS_GOAL = 8000;
const HYDRATION_GOAL_OZ = 64; // 8 glasses × 8oz
const PROTEIN_GOAL_PCT = 0.8;  // 80% of target

// ─── Streak Calculation ───────────────────────────────────────────────────────

function calcStreak(rows: any[], key: HabitKey): number {
  if (!rows || rows.length === 0) return 0;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const past = sorted.filter((r) => r.date !== TODAY);
  let streak = 0;
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 1);
  for (const row of past) {
    const rowDate = new Date(row.date).toISOString().split('T')[0];
    const cursorDate = cursor.toISOString().split('T')[0];
    if (rowDate !== cursorDate) break;
    if (row[key]) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// ─── Single Habit Row ─────────────────────────────────────────────────────────

function HabitItem({
  habit,
  checked,
  streak,
  isAuto,
  autoDesc,
  onToggle,
}: {
  habit: HabitConfig;
  checked: boolean;
  streak: number;
  isAuto: boolean;
  autoDesc: string;
  onToggle: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const checkAnim = useRef(new Animated.Value(checked ? 1 : 0)).current;

  const hour = new Date().getHours();
  const isPastCutoff = habit.cutoffHour !== null && hour >= habit.cutoffHour;
  const isMissed = isPastCutoff && !checked;
  const uncheckedBorder = isMissed ? CoachColors.danger : CoachColors.border;

  useEffect(() => {
    Animated.spring(checkAnim, {
      toValue: checked ? 1 : 0,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [checked]);

  const handlePress = () => {
    Haptics.impactAsync(
      checked ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
    );
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.95, friction: 8, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
    ]).start();
    onToggle();
  };

  const checkScale = checkAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          s.habitRow,
          checked && {
            borderColor: `${habit.color}40`,
            backgroundColor: `${habit.color}08`,
          },
          isMissed && !checked && { borderColor: CoachColors.dangerSoft, backgroundColor: 'rgba(224,92,92,0.04)' },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={`${habit.label}: ${checked ? 'Completed' : 'Not completed'}. ${streak > 0 ? `${streak} day streak.` : ''} ${isAuto ? 'Auto-populated from your data.' : ''}`}
      >
        {/* Left accent bar */}
        <View
          style={[
            s.habitAccent,
            { backgroundColor: checked ? habit.color : 'transparent' },
          ]}
        />

        {/* Icon */}
        <View
          style={[
            s.habitIcon,
            { backgroundColor: checked ? CoachColors.accentSoft : CoachColors.surfaceRaised },
          ]}
        >
          <Ionicons
            name={habit.icon}
            size={17}
            color={checked ? CoachColors.accent : CoachColors.textMuted}
          />
        </View>

        {/* Text */}
        <View style={s.habitText}>
          <View style={s.habitLabelRow}>
            <Text
              style={[
                s.habitLabel,
                { color: checked ? CoachColors.textPrimary : CoachColors.textSecondary },
              ]}
            >
              {habit.label}
            </Text>
            {isAuto && (
              <View style={[s.autoPill, { borderColor: `${habit.color}60` }]}>
                <Text style={[s.autoText, { color: habit.color }]}>Auto</Text>
              </View>
            )}
          </View>
          <Text style={s.habitDesc}>
            {isAuto && checked ? autoDesc : habit.defaultDesc}
          </Text>
        </View>

        {/* Streak badge */}
        {streak > 0 && (
          <View style={s.streakBadge}>
            <Text style={s.streakText}>{`${streak}d`}</Text>
          </View>
        )}

        {/* Check circle */}
        <Animated.View
          style={[
            s.checkCircle,
            { borderColor: checked ? habit.color : uncheckedBorder },
            checked && { backgroundColor: habit.color },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: checkScale }], opacity: checkAnim }}>
            <Ionicons name="checkmark" size={14} color={CoachColors.onAccent} />
          </Animated.View>
        </Animated.View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HabitTracker({ clientId, onHabitsChange }: HabitTrackerProps) {
  const { healthData, isConnected } = useHealth();
  const { diets, mealLogs } = useClient();

  const [habits, setHabits] = useState<DailyHabits>(DEFAULT_HABITS);
  const [autoFlags, setAutoFlags] = useState<Record<HabitKey, boolean>>({
    water: false, steps: false, sleep: false, protein: false, mindfulness: false,
  });
  const [streaks, setStreaks] = useState<Record<HabitKey, number>>({
    water: 0, steps: 0, sleep: 0, protein: 0, mindfulness: 0,
  });
  const [loading, setLoading] = useState(true);
  const [rowId, setRowId] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  // Prevent auto-upsert from running more than once per mount
  const autoApplied = useRef(false);
  const missedHapticFired = useRef(false);

  const completedCount = Object.values(habits).filter(Boolean).length;
  const totalCount = HABITS.length;

  // Guard: only fire when the summary actually changes — prevents setState loop
  const prevSummary = useRef<string>('');

  useEffect(() => {
    if (!onHabitsChange) return;
    const topHabit = HABITS
      .filter(h => !habits[h.key] && h.key !== 'sleep' && h.cutoffHour !== null)
      .sort((a, b) => (a.cutoffHour ?? 24) - (b.cutoffHour ?? 24))[0];
    const summary = {
      completedCount,
      totalCount: HABITS.length,
      topIncomplete: topHabit
        ? { key: topHabit.key, label: topHabit.label, cutoffHour: topHabit.cutoffHour }
        : undefined,
    };
    const serialized = JSON.stringify(summary);
    if (serialized === prevSummary.current) return; // no change — skip to avoid loop
    prevSummary.current = serialized;
    onHabitsChange(summary);
  }, [habits, completedCount, onHabitsChange]);

  useEffect(() => {
    if (loading || missedHapticFired.current) return;
    const hour = new Date().getHours();
    const anyMissed = HABITS.some(h => {
      if (h.cutoffHour === null) return false;
      return hour >= h.cutoffHour && !habits[h.key];
    });
    if (anyMissed) {
      missedHapticFired.current = true;
      const dateStr = new Date().toISOString().split('T')[0];
      const key = `haptic_missed_habits_summary_${dateStr}`;
      AsyncStorage.getItem(key).then(already => {
        if (!already) {
          AsyncStorage.setItem(key, '1');
          // Only fire if app is in foreground (AppState check)
          const { AppState } = require('react-native');
          if (AppState.currentState === 'active') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          }
        }
      });
    }
  }, [loading, habits]);

  // ── Compute auto-check values from data sources ──
  const autoValues = useMemo(() => {
    // Steps from HealthContext
    const stepsAutoCheck =
      isConnected !== false &&
      (healthData?.stepsToday ?? 0) >= STEPS_GOAL;

    // Hydration is read async — handled separately
    // Protein from ClientContext
    let proteinAutoCheck = false;
    if (diets && diets.length > 0) {
      let totalProtein = 0;
      let consumedProtein = 0;
      diets.forEach((d: any) => {
        (d.diet_plans?.diet_plan_meals || []).forEach((m: any) => {
          totalProtein += m.meals?.protein || 0;
          if (mealLogs[m.id]) consumedProtein += m.meals?.protein || 0;
        });
      });
      proteinAutoCheck =
        totalProtein > 0 && consumedProtein >= totalProtein * PROTEIN_GOAL_PCT;
    }

    return { steps: stepsAutoCheck, protein: proteinAutoCheck };
  }, [healthData, diets, mealLogs]);

  // Auto-description strings
  const autoDescriptions: Record<HabitKey, string> = {
    water: `${Math.round(0)}oz tracked · goal met`,
    steps: `${(healthData?.stepsToday ?? 0).toLocaleString()} steps · Apple Health`,
    sleep: '',
    protein: 'Protein goal met · from meal log',
    mindfulness: '',
  };

  // ── Fetch today's DB row + streak history ──
  const fetchHabits = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

      const { data } = await supabase
        .from('client_habits')
        .select('*')
        .eq('client_id', clientId)
        .gte('date', fromDate)
        .order('date', { ascending: false });

      if (data) {
        const todayRow = data.find((r) => r.date === TODAY);
        if (todayRow) {
          setRowId(todayRow.id);
          setHabits({
            water: todayRow.water,
            steps: todayRow.steps,
            sleep: todayRow.sleep,
            protein: todayRow.protein,
            mindfulness: todayRow.mindfulness,
          });
        }
        const newStreaks = {} as Record<HabitKey, number>;
        for (const h of HABITS) {
          newStreaks[h.key] = calcStreak(data, h.key);
        }
        setStreaks(newStreaks);
      }
    } catch (err) {
      if (__DEV__) console.log('[HabitTracker] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchHabits(); }, [fetchHabits]);

  // ── Auto-populate from data sources after DB load ──
  useEffect(() => {
    if (loading || autoApplied.current || !clientId) return;
    autoApplied.current = true;

    (async () => {
      // Read hydration from AsyncStorage
      let hydrationAutoCheck = false;
      let hydrationOz = 0;
      try {
        const val = await AsyncStorage.getItem(HYDRATION_KEY);
        hydrationOz = parseInt(val || '0', 10);
        hydrationAutoCheck = hydrationOz >= HYDRATION_GOAL_OZ;
      } catch {}

      // Determine which habits should be auto-set
      const newAutoFlags: Record<HabitKey, boolean> = {
        water: hydrationAutoCheck,
        steps: autoValues.steps,
        sleep: false,
        protein: autoValues.protein,
        mindfulness: false,
      };

      // Update auto descriptions with real values
      autoDescriptions.water = `${hydrationOz}oz tracked · goal met`;

      // Only auto-set habits that aren't already manually toggled in DB
      // (if a DB row exists, respect the user's choices)
      const updates: Partial<DailyHabits> = {};
      let hasUpdates = false;

      if (hydrationAutoCheck && !habits.water) {
        updates.water = true;
        hasUpdates = true;
      }
      if (autoValues.steps && !habits.steps) {
        updates.steps = true;
        hasUpdates = true;
      }
      if (autoValues.protein && !habits.protein) {
        updates.protein = true;
        hasUpdates = true;
      }

      setAutoFlags(newAutoFlags);

      if (hasUpdates) {
        const newHabits = { ...habits, ...updates };
        setHabits(newHabits);

        // Upsert auto-checked values to DB
        try {
          const { data } = await supabase
            .from('client_habits')
            .upsert(
              {
                ...(rowId ? { id: rowId } : {}),
                client_id: clientId,
                date: TODAY,
                ...newHabits,
              },
              { onConflict: 'client_id,date' }
            )
            .select()
            .single();
          if (data && !rowId) setRowId(data.id);
        } catch (err) {
          if (__DEV__) console.log('[HabitTracker] auto-upsert error:', err);
        }
      }
    })();
  }, [loading, clientId, autoValues]);

  // Animate progress bar
  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: completedCount / totalCount,
      friction: 8,
      tension: 60,
      useNativeDriver: false,
    }).start();
  }, [completedCount]);

  // ── Manual toggle ──
  const handleToggle = useCallback(
    async (key: HabitKey) => {
      if (!clientId) return;
      const newValue = !habits[key];
      const newHabits = { ...habits, [key]: newValue };
      setHabits(newHabits);

      // If user manually unchecks an auto habit, clear the auto flag
      if (!newValue && autoFlags[key]) {
        setAutoFlags((prev) => ({ ...prev, [key]: false }));
      }

      try {
        const { data, error } = await supabase
          .from('client_habits')
          .upsert(
            {
              ...(rowId ? { id: rowId } : {}),
              client_id: clientId,
              date: TODAY,
              ...newHabits,
            },
            { onConflict: 'client_id,date' }
          )
          .select()
          .single();
        if (error) throw error;
        if (data && !rowId) setRowId(data.id);

        if (Object.values(newHabits).every(Boolean)) {
          setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 150);
        }
      } catch (err) {
        setHabits(habits);
        if (__DEV__) console.log('[HabitTracker] upsert error:', err);
      }
    },
    [clientId, habits, rowId, autoFlags]
  );

  if (loading) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center', minHeight: 80 }]}>
        <ActivityIndicator size="small" color={CoachColors.textMuted} />
      </View>
    );
  }

  const allDone = completedCount === totalCount;
  const autoCount = Object.values(autoFlags).filter(Boolean).length;

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.tagHeader}>Habits // today</Text>
          <Text style={s.title}>Daily checklist</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <View style={[s.countBadge, allDone && s.countBadgeDone]}>
            <Text style={[s.countText, allDone && s.countTextDone]}>
              {completedCount}/{totalCount}
            </Text>
          </View>
          {autoCount > 0 && (
            <Text style={s.autoSyncLabel}>
              {autoCount} auto-synced
            </Text>
          )}
        </View>
      </View>

      {/* ── Progress Bar ── */}
      <View style={s.progressTrack}>
        <Animated.View
          style={[
            s.progressFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: allDone ? CoachColors.accent : 'rgba(198,242,78,0.55)',
            },
          ]}
        />
      </View>

      {allDone && (
        <Text style={s.allDoneText}>Perfect day — all habits complete</Text>
      )}

      {/* ── Habit Rows ── */}
      <View style={s.habitList}>
        {HABITS.map((habit) => (
          <HabitItem
            key={habit.key}
            habit={habit}
            checked={habits[habit.key]}
            streak={streaks[habit.key]}
            isAuto={autoFlags[habit.key]}
            autoDesc={autoDescriptions[habit.key]}
            onToggle={() => handleToggle(habit.key)}
          />
        ))}
      </View>

      {/* ── Data source footnote ── */}
      {autoCount > 0 && (
        <View style={s.footer}>
          <Ionicons name="sync-outline" size={10} color={CoachColors.textFaint} />
          <Text style={s.footerText}>
            Synced from Apple Health · Hydration log · Meal tracker
          </Text>
        </View>
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
    marginHorizontal: 16,
    marginBottom: 10,
    overflow: 'hidden',
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  countBadgeDone: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.4)',
  },
  countText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  countTextDone: { color: '#22C55E' },
  autoSyncLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: '#5B7FFF',
    letterSpacing: 0.3,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 18,
    marginBottom: 4,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1,
  },
  allDoneText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: '#22C55E',
    letterSpacing: 0.3,
    textAlign: 'center',
    paddingVertical: 8,
  },
  habitList: {
    paddingHorizontal: 10,
    paddingTop: 6,
    gap: 2,
  },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingRight: 14,
    gap: 12,
    overflow: 'hidden',
  },
  habitAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 0,
  },
  habitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  habitEmoji: { fontSize: 18 },
  habitText: { flex: 1, gap: 2 },
  habitLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  habitLabel: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  autoPill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  autoText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 8,
    letterSpacing: 1,
  },
  habitDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  streakText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.3,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#5A5A5E',  // base; overridden inline
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    marginTop: 4,
  },
  footerText: {
    fontFamily: CoachFonts.body,
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
  },
});
