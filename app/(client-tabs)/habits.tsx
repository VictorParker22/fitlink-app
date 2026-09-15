/**
 * (client-tabs)/habits.tsx — Habits (canvas "Progress Tab", board 4).
 *
 * Today's five habits as tappable rows: a tap fills the ring with a spring
 * and a ripple, a haptic confirms, the row is written to client_habits at
 * once. Steps and sleep fill themselves from Apple Health / Health Connect
 * when the goal is met (8,000 steps, 7 h asleep). Below: the last four weeks
 * as one square per habit-day, the longest run, and the habit that needs a
 * nudge. Every number comes from client_habits and the health history.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { goBackOr } from '../../lib/nav';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { HABIT_KEYS, HABIT_LABELS, STEP_GOAL, SLEEP_GOAL_MIN, habitDayKey, lastDays, habitStats, formatHours, type HabitKey } from '../../lib/progressData';
import { localDayString } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';

let useHealthHook: (() => any) | null = null;
try { useHealthHook = require('../../context/HealthContext').useHealth; } catch { useHealthHook = null; }

const ICONS: Record<HabitKey, keyof typeof Ionicons.glyphMap> = { water: 'water-outline', steps: 'footsteps-outline', sleep: 'moon-outline', protein: 'restaurant-outline', mindfulness: 'leaf-outline' };

export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clientData } = useClient();
  let healthCtx: any = null;
  if (useHealthHook) { try { healthCtx = useHealthHook(); } catch { healthCtx = null; } }
  const healthConnected: boolean = healthCtx?.isConnected ?? false;
  const stepsToday: number | null = healthConnected && healthCtx?.healthData ? healthCtx.healthData.stepsToday : null;
  const sleepLastNight: number | null = healthConnected && healthCtx?.healthHistory ? (healthCtx.healthHistory.sleepMinutes?.[localDayString(new Date())] ?? null) : null;
  const platform = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';
  const corner = getSoloCharacter(clientData?.solo_character);
  const solo = !clientData?.trainer_id;

  const [rows, setRows] = useState<Record<string, any> | null>(null);
  const todayKey = habitDayKey(new Date());
  const days28 = useMemo(() => lastDays(28), []);

  const load = useCallback(async () => {
    if (!clientData?.id) return;
    const { data, error } = await supabase.from('client_habits').select('*').eq('client_id', clientData.id).in('date', days28);
    if (error) { setRows({}); return; }
    const indexed: Record<string, any> = {};
    (data || []).forEach((r: any) => { indexed[r.date] = r; });
    setRows(indexed);
  }, [clientData?.id, days28]);
  useEffect(() => { load(); }, [load]);

  const write = useCallback(async (key: HabitKey, value: boolean) => {
    if (!clientData?.id) return;
    setRows((prev) => ({ ...(prev ?? {}), [todayKey]: { ...(prev?.[todayKey] ?? {}), date: todayKey, [key]: value } }));
    const current = rows?.[todayKey] ?? {};
    const payload: Record<string, any> = { client_id: clientData.id, date: todayKey };
    HABIT_KEYS.forEach((k) => { payload[k] = k === key ? value : current[k] === true; });
    const { error } = await supabase.from('client_habits').upsert(payload, { onConflict: 'client_id,date' });
    if (error) { if (__DEV__) console.warn('[habits] write failed:', error.message); load(); }
  }, [clientData?.id, rows, todayKey, load]);

  // Health fills steps and sleep on its own, once per open, only upward.
  const autoRef = useRef(false);
  useEffect(() => {
    if (!rows || autoRef.current) return;
    const today = rows[todayKey] ?? {};
    let touched = false;
    if (stepsToday != null && stepsToday >= STEP_GOAL && today.steps !== true) { write('steps', true); touched = true; }
    if (sleepLastNight != null && sleepLastNight >= SLEEP_GOAL_MIN && today.sleep !== true) { write('sleep', true); touched = true; }
    if (touched || stepsToday != null) autoRef.current = true;
  }, [rows, todayKey, stepsToday, sleepLastNight, write]);

  const stats = useMemo(() => (rows ? habitStats(rows) : null), [rows]);
  const today = rows?.[todayKey] ?? {};
  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long' });

  const subFor = (k: HabitKey): string => {
    if (k === 'steps') {
      if (stepsToday != null) return `${stepsToday.toLocaleString()} of ${STEP_GOAL.toLocaleString()} from ${platform} · fills itself at ${STEP_GOAL.toLocaleString()}`;
      return healthConnected ? `${platform} has no steps yet today` : 'Tap when you hit your steps';
    }
    if (k === 'sleep') {
      if (sleepLastNight != null) return `${formatHours(sleepLastNight)} last night · ${platform}`;
      return healthConnected ? `${platform} has no sleep yet` : 'Tap after a night of 7 hours or more';
    }
    if (k === 'protein') return solo && (clientData as any)?.solo_block?.nutrition?.protein ? `Target ${Math.round((clientData as any).solo_block.nutrition.protein)} g on training days · from your meal plan` : 'Protein at every meal';
    const run = stats?.streaks[k] ?? 0;
    const best = stats?.longest?.habit === k ? stats.longest.days : null;
    if (run > 1) return `${run}-day run${best && best > run ? ` · best ${best}` : ''}`;
    const weekN = stats ? Math.round((stats.perHabitPct[k] / 100) * 7) : 0;
    return `${weekN} of 7 this week`;
  };

  return (
    <View style={st.container}>
      <ScrollView contentContainerStyle={[st.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => goBackOr(router, ClientRoute.myProgress)} accessibilityRole="button" accessibilityLabel="Back to progress">
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </Pressable>
          <View>
            <Text style={st.kicker}>Progress</Text>
            <Text style={st.title}>Habits</Text>
          </View>
        </View>

        <View style={st.sectionHead}>
          <Text style={st.kicker}>Today · {todayLabel}</Text>
          <Text style={st.meta}>{stats ? `${stats.todayDone} of 5` : ''}</Text>
        </View>
        {HABIT_KEYS.map((k) => (
          <HabitRow
            key={k}
            icon={ICONS[k]}
            label={HABIT_LABELS[k]}
            sub={subFor(k)}
            done={today[k] === true}
            progress={k === 'steps' && stepsToday != null && today.steps !== true ? Math.min(1, stepsToday / STEP_GOAL) : null}
            onToggle={() => write(k, today[k] !== true)}
          />
        ))}

        {stats && (
          <>
            <View style={[st.sectionHead, { marginTop: 22 }]}>
              <Text style={st.sectionTitle}>Last four weeks</Text>
              <Text style={st.meta}>{stats.fourWeekPct}% · best week {stats.bestWeekPct}%</Text>
            </View>
            <View style={st.card}>
              <View style={st.weeksRow}>
                {stats.weeks.map((w, wi) => {
                  const isThis = wi === stats.weeks.length - 1;
                  return (
                    <View key={w.start} style={st.weekCol}>
                      <Text style={[st.weekLabel, isThis && { color: C.accent }]}>{isThis ? 'this week' : new Date(w.start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Text>
                      <View style={st.miniGrid}>
                        {HABIT_KEYS.map((k) => w.days.map((d) => {
                          const done = rows?.[d]?.[k] === true;
                          const future = d > todayKey;
                          return <View key={`${k}-${d}`} style={[st.sq, done && st.sqOn, future && st.sqFuture, d === todayKey && done && st.sqToday]} />;
                        }))}
                      </View>
                      <Text style={[st.weekPct, w.pct === stats.bestWeekPct && { color: C.accent }]}>{w.pct}%</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={st.legend}>Rows: hydration, steps, sleep, protein, mindfulness. Steps and sleep fill themselves from {platform} when the goal is met; the rest are your taps.</Text>
            </View>

            <View style={st.twoUp}>
              <View style={st.statCard}>
                <Text style={st.kicker}>Longest run</Text>
                <Text style={st.statBig}>{stats.longest ? `${stats.longest.days} day${stats.longest.days === 1 ? '' : 's'}` : 'None yet'}</Text>
                <Text style={st.statSub}>{stats.longest ? `${HABIT_LABELS[stats.longest.habit]}${stats.longest.endedOn === todayKey ? ', still going' : `, ended ${new Date(stats.longest.endedOn + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}` : 'Two days in a row starts one'}</Text>
              </View>
              <View style={st.statCard}>
                <Text style={st.kicker}>Needs a nudge</Text>
                <Text style={st.statBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{stats.weakest ? HABIT_LABELS[stats.weakest.habit] : '—'}</Text>
                <Text style={st.statSub}>{stats.weakest ? `${stats.weakest.done} of 28 days${solo ? ` · ${corner.name} will ask Sunday` : ''}` : ''}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HabitRow({ icon, label, sub, done, progress, onToggle }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; done: boolean; progress: number | null; onToggle: () => void }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const ripple = useSharedValue(0);
  const prev = useRef(done);
  useEffect(() => {
    if (done && !prev.current && !reduced) {
      scale.value = withSequence(withTiming(0.6, { duration: 0 }), withSpring(1, { damping: 10, stiffness: 240 }));
      ripple.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 700 }));
    }
    prev.current = done;
  }, [done, reduced, scale, ripple]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + ripple.value * 1.2 }], opacity: 0.5 * (1 - ripple.value) }));
  return (
    <Pressable
      style={st.row}
      onPress={() => { Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onToggle(); }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${label}. ${sub}`}
      accessibilityHint={done ? 'Double tap to undo' : 'Double tap to mark done'}
    >
      <View style={st.ringWrap}>
        {done && <Animated.View style={[st.ripple, rippleStyle]} />}
        <Animated.View style={[st.ring, done && st.ringOn, ringStyle]}>
          {done ? <Ionicons name="checkmark" size={18} color={C.onAccent} /> : <Ionicons name={icon} size={16} color={C.textFaint} />}
        </Animated.View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={st.rowLabel}>{label}</Text>
        <Text style={st.rowSub} numberOfLines={2}>{sub}</Text>
      </View>
      {done ? <Text style={st.doneText}>done</Text> : progress != null ? (
        <View style={st.bar}><View style={[st.barFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
      ) : <Text style={st.tapText}>tap when done</Text>}
    </Pressable>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  title: { fontFamily: F.headingBold, fontSize: 24, color: C.textPrimary, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  sectionTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary },
  meta: { fontFamily: F.body, fontSize: 12.5, color: C.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 16, borderCurve: 'continuous', paddingVertical: 14, paddingHorizontal: 16, minHeight: 64 },
  ringWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  ripple: { position: 'absolute', width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent },
  ring: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  ringOn: { backgroundColor: C.accent, borderColor: C.accent },
  rowLabel: { fontFamily: F.bodySemiBold, fontSize: 15, color: C.textPrimary },
  rowSub: { fontFamily: F.body, fontSize: 12.5, lineHeight: 17, color: C.textSecondary },
  doneText: { fontFamily: F.mono, fontSize: 12, color: C.accent },
  tapText: { fontFamily: F.body, fontSize: 12, color: C.textFaint },
  bar: { width: 44, height: 6, borderRadius: 3, backgroundColor: C.borderMuted, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: C.textSecondary },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 18, borderCurve: 'continuous', padding: 14, gap: 12 },
  weeksRow: { flexDirection: 'row', gap: 10 },
  weekCol: { flex: 1, gap: 6 },
  weekLabel: { fontFamily: F.body, fontSize: 10, color: C.textFaint, textAlign: 'center' },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  sq: { width: '11.5%', aspectRatio: 1, borderRadius: 3, backgroundColor: C.borderMuted },
  sqOn: { backgroundColor: C.accent },
  sqFuture: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  sqToday: { borderWidth: 1.5, borderColor: 'rgba(198,242,78,0.5)' },
  weekPct: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary, textAlign: 'center' },
  legend: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.textFaint },
  twoUp: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', padding: 14, gap: 4 },
  statBig: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  statSub: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.textSecondary },
});
