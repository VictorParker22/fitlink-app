/**
 * (client-tabs)/my-progress.tsx — Progress (canvas "Progress Tab", 2026-09-16).
 *
 * One scroll of evidence, in the order an athlete asks about it:
 *   the corner's read (Solo; the only AI text, every number from stored
 *   facts) or the coach's note → today's three rings and the plan-vs-done
 *   week → main lifts → PR moments → habits → body → check-ins.
 *
 * Every number has a source: client_workout_logs (best set per session),
 * client_workouts (planned/done), client_habits, client_progress and the
 * Apple Health / Health Connect history (steps, sleep, workouts, weigh-ins).
 * Nothing draws before it exists: a section with no data is absent or one
 * sentence, never a zero ring or a dash.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, TextInput, Modal, Dimensions, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LineChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useAuth } from '../../context/AuthContext';
import { useWorkout } from '../../context/WorkoutContext';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';
import WeeklyCheckIn from '../../components/client-tabs/home/WeeklyCheckIn';
import { SundayCheckIn, type WeekFacts } from '../../components/client-tabs/progress/SundayCheckIn';
import { CornerRead } from '../../components/client-tabs/progress/CornerRead';
import { Ring } from '../../components/client-tabs/progress/Ring';
import { ClientRoute } from '../../types/routes';
import { weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import { parseLocalDay, localDayString } from '../../lib/streak';
import { readSoloBlock } from '../../lib/soloBlock';
import { loadStoredRead, fetchProgressRead, type ProgressRead, type HealthFacts } from '../../lib/progressRead';
import { buildLiftSeries, prMoments, liftDeltaPct, bestE1rm, buildWeek, completedDayKeys, habitStats, lastDays, habitDayKey, averageOver, shortDate, STEP_GOAL, HABIT_KEYS, HABIT_LABELS, type LiftSeries } from '../../lib/progressData';
import { asWeightUnit, unitLabel } from '../../lib/units';

let useHealthHook: (() => any) | null = null;
try { useHealthHook = require('../../context/HealthContext').useHealth; } catch { useHealthHook = null; }

const SCREEN_WIDTH = Dimensions.get('window').width;
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function initials(name?: string): string {
  if (!name) return '';
  return name.trim().split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || '';

export default function ProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clientData, trainer, workouts, progressLogs, enrollment, plans, logProgress, refreshData } = useClient();
  const { user } = useAuth();
  const { workoutHistory } = useWorkout();
  let healthCtx: any = null;
  if (useHealthHook) { try { healthCtx = useHealthHook(); } catch { healthCtx = null; } }
  const healthConnected: boolean = healthCtx?.isConnected ?? false;
  const healthData = healthConnected ? healthCtx?.healthData ?? null : null;
  const healthHistory = healthConnected ? healthCtx?.healthHistory ?? null : null;
  const platform = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect';

  const solo = !clientData?.trainer_id;
  const block = readSoloBlock((clientData as any)?.solo_block);
  const unit = asWeightUnit(clientData?.weight_unit);
  const coachFirst = firstName(trainer?.name) || 'your coach';

  const [refreshing, setRefreshing] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState<any[] | null>(null);
  const [checkins, setCheckins] = useState<any[] | null>(null);
  const [habitRows, setHabitRows] = useState<Record<string, any> | null>(null);
  const [selectedLift, setSelectedLift] = useState<string | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);
  const [read, setRead] = useState<ProgressRead | null>(null);
  const [readLoading, setReadLoading] = useState(false);
  const [readLocked, setReadLocked] = useState(false);

  // ── Rows the tab owns ─────────────────────────────────────────────────────
  const habitDays = useMemo(() => lastDays(28), []);
  const fetchExtras = useCallback(async () => {
    if (!clientData?.id) return;
    const [logsRes, checkinsRes, habitsRes] = await Promise.all([
      supabase.from('client_workout_logs').select('exercises, created_at, workout_id').eq('client_id', clientData.id).order('created_at', { ascending: true }),
      supabase.from('client_checkins').select('*').eq('client_id', clientData.id).not('submitted_at', 'is', null).order('week_start', { ascending: false }).limit(8),
      supabase.from('client_habits').select('*').eq('client_id', clientData.id).in('date', habitDays),
    ]);
    setWorkoutLogs(logsRes.data || []);
    setCheckins(checkinsRes.data || []);
    if (habitsRes.error) setHabitRows({});
    else { const idx: Record<string, any> = {}; (habitsRes.data || []).forEach((r: any) => { idx[r.date] = r; }); setHabitRows(idx); }
  }, [clientData?.id, habitDays]);
  useEffect(() => { fetchExtras(); }, [fetchExtras]);
  useFocusEffect(useCallback(() => { fetchExtras(); }, [fetchExtras]));

  // ── Names ─────────────────────────────────────────────────────────────────
  const exerciseNames = useMemo(() => {
    const map: Record<string, string> = {};
    (workouts || []).forEach((cw: any) => (cw.workouts?.workout_exercises || []).forEach((we: any) => { if (we.exercises?.id && we.exercises?.name) map[we.exercises.id] = we.exercises.name; }));
    return map;
  }, [workouts]);

  // ── Lifts and PRs ─────────────────────────────────────────────────────────
  const liftSeries = useMemo(() => buildLiftSeries(workoutLogs || [], exerciseNames), [workoutLogs, exerciseNames]);
  const chartable = useMemo(() => liftSeries.filter((s) => s.sessions.length >= 2), [liftSeries]);
  const singles = useMemo(() => liftSeries.filter((s) => s.sessions.length === 1), [liftSeries]);
  useEffect(() => { if (!selectedLift && chartable.length > 0) setSelectedLift(chartable[0].exerciseId); }, [chartable, selectedLift]);
  const activeLift: LiftSeries | undefined = chartable.find((s) => s.exerciseId === selectedLift) || chartable[0];
  const prs = useMemo(() => prMoments(liftSeries), [liftSeries]);
  const liftsUp = useMemo(() => chartable.filter((s) => (liftDeltaPct(s) ?? 0) > 0).length, [chartable]);

  // ── The week: planned vs done, minutes, steps ────────────────────────────
  const now = new Date();
  const week = useMemo(() => {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const mKey = localDayString(monday), sKey = localDayString(sunday);
    const plannedKeys = new Set<string>();
    (workouts || []).forEach((w: any) => {
      const d = parseLocalDay(w.assigned_date);
      if (!d) return;
      const k = localDayString(d);
      if (k >= mKey && k <= sKey) plannedKeys.add(WEEKDAY_KEYS[d.getDay()]);
    });
    const meta = (user?.user_metadata ?? {}) as Record<string, any>;
    const fallback: string[] = Array.isArray(meta.intake_training_days) ? meta.intake_training_days : [];
    const trainingDays = plannedKeys.size > 0 ? [...plannedKeys] : fallback;
    const minutesByDay: Record<string, number> = {};
    (workoutHistory || []).forEach((e: any) => { if (e?.completedAt) { const k = localDayString(new Date(e.completedAt)); minutesByDay[k] = (minutesByDay[k] ?? 0) + Math.round((e.durationSec || 0) / 60); } });
    (workouts || []).forEach((w: any) => { if (w.status === 'completed' && w.completed_at && w.duration_seconds) { const k = localDayString(new Date(w.completed_at)); minutesByDay[k] = (minutesByDay[k] ?? 0) + Math.round(w.duration_seconds / 60); } });
    (healthHistory?.workouts || []).forEach((w: any) => { const k = localDayString(new Date(w.start)); minutesByDay[k] = (minutesByDay[k] ?? 0) + w.minutes; });
    return buildWeek({ now, trainingDays, completedDates: completedDayKeys(workouts || []), minutesByDay, stepsByDay: healthHistory?.dailySteps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workouts, user?.user_metadata, workoutHistory, healthHistory]);
  const todayRow = week.find((d) => d.isToday);
  const weekDone = week.filter((d) => d.done).length;
  const weekPlanned = week.filter((d) => d.planned).length;
  const weekSteps = week.reduce((s, d) => s + (d.steps ?? 0), 0);
  const todayPlanned = useMemo(() => (workouts || []).find((w: any) => w.assigned_date && localDayString(parseLocalDay(w.assigned_date) ?? new Date(0)) === localDayString(now) && w.status !== 'completed'), [workouts]);
  const plannedMinutes = todayPlanned?.workouts?.duration_minutes ?? todayPlanned?.workouts?.duration ?? 45;

  // ── Habits ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => (habitRows ? habitStats(habitRows) : null), [habitRows]);
  const last7 = useMemo(() => lastDays(7), []);
  const todayKey = habitDayKey(now);

  // ── Health rollups for the corner ─────────────────────────────────────────
  const healthFacts: HealthFacts = useMemo(() => {
    const d7 = lastDays(7, now, localDayString);
    const d28 = lastDays(28, now, localDayString);
    const rhrNow = healthData?.restingHeartRate ?? null;
    const rhrFirst = healthHistory ? averageOver(healthHistory.restingHr, d28.slice(0, 7)) : null;
    return {
      stepsAvg7: healthHistory ? averageOver(healthHistory.dailySteps, d7) : null,
      sleepAvgMin7: healthHistory ? averageOver(healthHistory.sleepMinutes, d7) : null,
      restingHr: rhrNow,
      restingHrDelta28: rhrNow != null && rhrFirst != null ? rhrNow - rhrFirst : null,
      weightLbs: healthData?.latestWeight ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthData, healthHistory]);

  // ── The corner's read (Solo) ──────────────────────────────────────────────
  const loadRead = useCallback(async (force = false) => {
    if (!solo) return;
    setReadLoading(true);
    const res = await fetchProgressRead('week', healthFacts, force);
    if (res.ok) { setRead(res.read); setReadLocked(false); }
    else if (res.reason === 'premium_required') setReadLocked(true);
    setReadLoading(false);
  }, [solo, healthFacts]);
  useEffect(() => {
    if (!solo) return;
    let alive = true;
    loadStoredRead().then((r) => { if (alive && r) setRead(r); }).finally(() => { if (alive) loadRead(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solo, clientData?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), fetchExtras(), healthCtx?.refreshHealth?.()]);
    if (solo) loadRead(true);
    setRefreshing(false);
  }, [refreshData, fetchExtras, healthCtx, solo, loadRead]);

  // ── Header line: the plan, never the calendar ─────────────────────────────
  const headerSub = useMemo(() => {
    if (solo && block?.week && block.split) {
      const phase = block.week === 1 ? 'base' : block.week === 2 ? 'build' : block.week === 3 ? 'peak' : 'deload';
      return `Block week ${block.week} of 4 · ${phase} · ${String(block.split).replace(/_/g, ' ')}${block.days ? `, ${block.days} days` : ''}`;
    }
    if (enrollment?.status === 'active' && Array.isArray(enrollment.track_snapshot) && enrollment.track_snapshot.length > 0) {
      const track = [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      const plan = (plans || []).find((p: any) => p.id === enrollment.plan_id);
      const dw = plan?.duration_weeks ?? null;
      const weeks = totalWeeks(track, dw);
      const wk = Math.min(weekOfPosition(Math.min(enrollment.track_position || 0, track.length - 1), track, dw), weeks);
      return `Week ${wk} of ${weeks} on ${plan?.name ?? 'your plan'}`;
    }
    return solo ? 'Say "build my week" in your corner to start a block' : 'Everything you have logged, in one place';
  }, [solo, block, enrollment, plans]);
  const blockLine = solo && block?.week ? `wk ${block.week} · ${block.week === 1 ? 'base' : block.week === 2 ? 'build' : block.week === 3 ? 'peak' : 'deload'}` : null;

  // ── Body ─────────────────────────────────────────────────────────────────
  const healthWeights: { date: string; lbs: number }[] = healthHistory?.weights ?? [];
  const weightEntries = useMemo(() => {
    const byDay = new Map<string, { date: string; weight: number; source: 'health' | 'log' }>();
    healthWeights.forEach((w) => byDay.set(w.date, { date: w.date, weight: w.lbs, source: 'health' }));
    (progressLogs || []).filter((p: any) => p.weight != null).forEach((p: any) => {
      const raw = p.date || p.created_at; const d = parseLocalDay(raw) ?? new Date(raw);
      byDay.set(localDayString(d), { date: raw, weight: Number(p.weight), source: 'log' });
    });
    return [...byDay.values()].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [progressLogs, healthWeights]);
  const photoLogs = useMemo(() => (progressLogs || []).filter((p: any) => Array.isArray(p.photos) && p.photos.length > 0).sort((a: any, b: any) => new Date(a.date || a.created_at).getTime() - new Date(b.date || b.created_at).getTime()), [progressLogs]);
  const firstPhoto = photoLogs[0];
  const latestPhoto = photoLogs.length > 1 ? photoLogs[photoLogs.length - 1] : null;

  const saveWeight = useCallback(async () => {
    const val = parseFloat(weightInput);
    if (!val || Number.isNaN(val) || val <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setWeightSaving(true);
    try { await logProgress({ weight: val }); setWeightSaved(true); setWeightInput(''); await refreshData(); setTimeout(() => setWeightSaved(false), 2500); } catch { /* upstream alert */ }
    setWeightSaving(false);
  }, [weightInput, logProgress, refreshData]);

  const chartWidth = SCREEN_WIDTH - 40 - 34;
  const liftChartData = useMemo(() => activeLift ? activeLift.sessions.map((s, i) => ({ value: s.best, label: i === 0 || i === activeLift.sessions.length - 1 ? shortDate(s.date) : '', dataPointText: i === activeLift.sessions.length - 1 ? `${s.best}` : '' })) : [], [activeLift]);
  const weightChartData = useMemo(() => weightEntries.length < 2 ? [] : weightEntries.map((p, i) => ({ value: p.weight, label: i === 0 || i === weightEntries.length - 1 ? shortDate(p.date) : '', dataPointText: i === weightEntries.length - 1 ? `${p.weight}` : '', dataPointColor: p.source === 'health' ? C.accent : C.textSecondary })), [weightEntries]);

  const latestCoachNote = useMemo(() => (checkins || []).find((c: any) => c.coach_note), [checkins]);
  const loading = workoutLogs === null || checkins === null;

  const weekFacts: WeekFacts = {
    sessionsDone: weekDone,
    sessionsPlanned: weekPlanned > 0 ? weekPlanned : (block?.days ?? null),
    stepsAvg: healthFacts.stepsAvg7 ?? null,
    sleepAvgMin: healthFacts.sleepAvgMin7 ?? null,
    habitsDone: stats?.doneThisWeek ?? 0,
    habitsPossible: 35,
    proteinDays: stats ? Math.round((stats.perHabitPct.protein / 100) * 7) : 0,
  };

  return (
    <View style={s.container}>
      {/* The check-in note and the weight composer sit deep in the scroll;
          the scroll view itself lifts the focused field above the keyboard
          (iOS insets; Android resizes the window). A KeyboardAvoidingView
          here double-counted and left the field behind the keyboard. */}
      <View style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 130 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        >
          {/* ── Header ── */}
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Progress</Text>
              <Text style={s.subtitle}>{headerSub}</Text>
            </View>
            <Pressable style={s.avatarBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(ClientRoute.myProfile); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Your profile">
              {clientData?.avatar_url ? <Image source={{ uri: clientData.avatar_url }} style={s.avatarImg} contentFit="cover" /> : <Text style={s.avatarInitials}>{initials(clientData?.name) || '·'}</Text>}
            </Pressable>
          </View>

          {/* ── The read / the coach's word ── */}
          {solo ? (
            <CornerRead
              read={read}
              characterKey={clientData?.solo_character}
              blockLine={blockLine}
              loading={readLoading}
              locked={readLocked}
              onAsk={() => router.push({ pathname: ClientRoute.solo, params: { ask: 'progress' } } as any)}
              onUnlock={() => router.push(ClientRoute.mySubscription as any)}
              onRefresh={() => loadRead(true)}
            />
          ) : latestCoachNote ? (
            <View style={s.coachCard}>
              <View style={s.coachRow}>
                <View style={s.coachAvatar}><Text style={s.coachAvatarText}>{initials(trainer?.name) || '·'}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.coachMeta}>{coachFirst}, after your {shortDate(latestCoachNote.week_start)} check-in</Text>
                  <Text style={s.coachNote}>"{latestCoachNote.coach_note}"</Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* ── Today and the week ── */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.kicker}>Today · {now.toLocaleDateString('en-GB', { weekday: 'long' })}</Text>
              <Text style={s.meta}>{todayPlanned?.workouts?.name ? `${todayPlanned.workouts.name} on the plan` : todayRow?.done ? 'session done' : todayRow?.planned ? 'session planned' : 'rest day'}</Text>
            </View>
            <View style={s.rings}>
              <Ring value={todayRow?.minutes ?? 0} max={Math.max(plannedMinutes, todayRow?.minutes ?? 0, 1)} big={String(todayRow?.minutes ?? 0)} small="min" label="Move" sub={todayPlanned ? `of ${plannedMinutes} planned` : todayRow?.minutes ? 'logged today' : 'nothing yet'} />
              {healthData ? (
                <Ring value={healthData.stepsToday} max={STEP_GOAL} color={C.textSecondary} big={healthData.stepsToday.toLocaleString()} small="steps" label="Steps" sub={`${platform} · goal ${STEP_GOAL.toLocaleString()}`} />
              ) : (
                <Pressable style={s.ringGhost} onPress={() => router.push(ClientRoute.connectedTech as any)} accessibilityRole="button" accessibilityLabel={`Connect ${platform} for steps`}>
                  <Ionicons name="footsteps-outline" size={22} color={C.textFaint} />
                  <Text style={s.ringGhostText}>Connect {platform}</Text>
                </Pressable>
              )}
              <Ring value={stats?.todayDone ?? 0} max={5} color={C.textFaint} big={`${stats?.todayDone ?? 0}/5`} small="habits" label="Habits" sub={stats && stats.todayDone > 0 ? HABIT_KEYS.filter((k) => habitRows?.[todayKey]?.[k] === true).map((k) => HABIT_LABELS[k].toLowerCase()).slice(0, 3).join(', ') : 'none yet'} />
            </View>
            <View style={s.weekBlock}>
              <View style={s.rowBetween}>
                <Text style={s.cardTitle}>This week</Text>
                <Text style={s.meta}>{weekPlanned > 0 ? `${weekDone} of ${weekPlanned} sessions` : `${weekDone} session${weekDone === 1 ? '' : 's'}`}{healthHistory && weekSteps > 0 ? ` · ${weekSteps.toLocaleString()} steps` : ''}</Text>
              </View>
              <View style={s.weekGrid}>
                {week.map((d) => {
                  const maxSteps = Math.max(STEP_GOAL, ...week.map((x) => x.steps ?? 0));
                  const h = d.steps != null ? Math.max(4, Math.round((d.steps / maxSteps) * 36)) : 4;
                  return (
                    <View key={d.date} style={s.weekCol} accessible accessibilityLabel={`${d.label}${d.isToday ? ', today' : ''}: ${d.done ? 'session done' : d.planned ? 'session planned' : 'rest'}${d.steps != null ? `, ${d.steps.toLocaleString()} steps` : ''}`}>
                      <View style={[s.stepBar, { height: h, backgroundColor: d.steps != null ? C.border : C.borderMuted }]} />
                      <View style={[s.dayDot, d.done ? s.dayDotDone : d.isToday ? s.dayDotToday : d.planned ? s.dayDotPlanned : null]}>
                        {d.done ? <Ionicons name="checkmark" size={12} color={C.onAccent} /> : null}
                      </View>
                      <Text style={[s.dayLetter, d.isToday && { color: C.accent }]}>{d.label}</Text>
                    </View>
                  );
                })}
              </View>
              <View style={s.legend}>
                <Legend swatch={{ backgroundColor: C.accent }} text="done" />
                <Legend swatch={{ borderWidth: 1, borderColor: C.accent }} text="today" />
                <Legend swatch={{ borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' }} text="planned" />
                {healthHistory ? <Legend swatch={{ backgroundColor: C.border, borderRadius: 2 }} text="steps" /> : null}
              </View>
            </View>
          </View>

          {/* ── Doors ── */}
          <View style={s.doors}>
            <Pressable style={s.door} onPress={() => router.push(ClientRoute.activity as any)} accessibilityRole="button" accessibilityLabel="Open activity">
              <View style={s.doorLeft}><Ionicons name="pulse" size={18} color={C.accent} /><Text style={s.doorText}>Activity</Text></View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
            <Pressable style={s.door} onPress={() => router.push(ClientRoute.healthInsights as any)} accessibilityRole="button" accessibilityLabel="Open health">
              <View style={s.doorLeft}><Ionicons name="heart-outline" size={18} color={C.accent} /><Text style={s.doorText}>Health</Text></View>
              <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </Pressable>
          </View>

          {/* ── Main lifts ── */}
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Main lifts</Text>
            {liftSeries.length > 0 ? <Text style={s.meta}>best set per session</Text> : null}
          </View>
          {loading ? (
            <View style={s.card}><ActivityIndicator color={C.accent} /></View>
          ) : liftSeries.length === 0 ? (
            <View style={s.card}><Text style={s.emptyText}>No lift data yet. Finish a session with logged sets and your curves start here.</Text></View>
          ) : (
            <>
              {chartable.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {chartable.map((lift) => {
                    const active = activeLift?.exerciseId === lift.exerciseId;
                    return (
                      <Pressable key={lift.exerciseId} style={[s.chip, active && s.chipActive]} onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedLift(lift.exerciseId); }} accessibilityRole="button" accessibilityLabel={`${lift.name}, ${lift.sessions.length} sessions`} accessibilityState={{ selected: active }}>
                        <Text style={[s.chipText, active && s.chipTextActive]}>{lift.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
              {activeLift && (() => {
                const pct = liftDeltaPct(activeLift);
                const last = activeLift.sessions[activeLift.sessions.length - 1];
                return (
                  <Pressable style={s.card} onPress={() => router.push({ pathname: ClientRoute.liftDetail, params: { exerciseId: activeLift.exerciseId } } as any)} accessibilityRole="button" accessibilityLabel={`${activeLift.name}, open every session`}>
                    <View style={s.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.liftName}>{activeLift.name}</Text>
                        <Text style={s.meta}>{activeLift.sessions[0].best} → {last.best} {unitLabel(unit)} · {activeLift.sessions.length} sessions · e1RM {bestE1rm(activeLift)}</Text>
                      </View>
                      <Text style={[s.liftDelta, (pct ?? 0) <= 0 && { color: C.textMuted }]}>{pct == null ? '' : pct > 0 ? `+${pct}%` : pct === 0 ? 'level' : `${pct}%`}</Text>
                    </View>
                    <LineChart data={liftChartData} height={110} width={chartWidth} color={C.accent} thickness={2.5} startFillColor="rgba(198,242,78,0.14)" endFillColor="rgba(198,242,78,0)" areaChart hideRules hideYAxisText xAxisColor={C.borderMuted} yAxisColor="transparent" initialSpacing={12} endSpacing={16} spacing={Math.max(24, (chartWidth - 40) / Math.max(1, liftChartData.length - 1))} dataPointsColor={C.accent} dataPointsRadius={3.5} textColor={C.textSecondary} textFontSize={11} textShiftY={-8} xAxisLabelTextStyle={{ color: C.textMuted, fontFamily: F.body, fontSize: 11 }} yAxisOffset={Math.max(0, Math.min(...activeLift.sessions.map((p) => p.best)) * 0.9)} />
                    <View style={[s.rowBetween, s.cardFoot]}>
                      <Text style={s.meta} numberOfLines={1}>Last: {last.sets.map((x) => `${x.weight} × ${x.reps}`).slice(0, 3).join(', ')}{last.feel ? ` · felt ${last.feel === 'grind' ? 'like a grind' : last.feel}` : ''}</Text>
                      <Text style={s.link}>All sessions →</Text>
                    </View>
                  </Pressable>
                );
              })()}
              {singles.slice(0, 3).map((lift) => (
                <View key={lift.exerciseId} style={s.factRow}><Text style={s.factText}>{lift.name}: one session at {lift.sessions[0].best}. One more and you get a curve.</Text></View>
              ))}
            </>
          )}

          {/* ── PR moments ── */}
          {prs.length > 0 && (
            <>
              <Text style={s.sectionTitle}>PR moments</Text>
              <View style={s.prHero} accessible accessibilityLabel={`${prs[0].name}, new best ${prs[0].weight}, up from ${prs[0].previous}, ${shortDate(prs[0].date)}`}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.prKicker}>New best · {shortDate(prs[0].date)}</Text>
                  <Text style={s.prName} numberOfLines={1}>{prs[0].name}</Text>
                  <Text style={s.meta}>Up from {prs[0].previous}{prs[0].reps ? ` · ${prs[0].weight} × ${prs[0].reps}` : ''}</Text>
                </View>
                <Text style={s.prBig}>{prs[0].weight}</Text>
              </View>
              {prs.slice(1, 5).map((pr, i) => (
                <View key={`${pr.exerciseId}-${pr.date}-${i}`} style={s.prRow} accessible accessibilityLabel={`${pr.name}, new best ${pr.weight}, ${shortDate(pr.date)}`}>
                  <View style={s.prBadge}><Image source={getWorkoutEmblem(pr.exerciseId, pr.name)} style={s.prBadgeEmblem} contentFit="contain" accessible={false} /></View>
                  <View style={{ flex: 1 }}><Text style={s.prRowName}>{pr.name}</Text><Text style={s.meta}>New best · {shortDate(pr.date)}</Text></View>
                  <Text style={s.prRowWeight}>{pr.weight}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── Habits ── */}
          {stats && (
            <>
              <View style={s.sectionHead}>
                <Text style={s.sectionTitle}>Habits</Text>
                <Pressable onPress={() => router.push(ClientRoute.habits as any)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Mark today's habits"><Text style={s.link}>Mark today →</Text></Pressable>
              </View>
              <Pressable style={s.card} onPress={() => router.push(ClientRoute.habits as any)} accessibilityRole="button" accessibilityLabel={`Habits, ${stats.doneThisWeek} of 35 this week`}>
                <View style={s.habitGrid}>
                  <View style={s.habitRow}>
                    <View style={s.habitLabelCell} />
                    {last7.map((d) => <Text key={d} style={[s.habitDay, d === todayKey && { color: C.accent }]}>{new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' })}</Text>)}
                    <View style={s.habitPctCell} />
                  </View>
                  {HABIT_KEYS.map((k) => (
                    <View key={k} style={s.habitRow}>
                      <Text style={[s.habitLabel, s.habitLabelCell]} numberOfLines={1}>{HABIT_LABELS[k]}</Text>
                      {last7.map((d) => {
                        const done = habitRows?.[d]?.[k] === true;
                        return <View key={d} style={[s.habitSq, done && s.habitSqOn, d === todayKey && !done && s.habitSqToday, d === todayKey && done && s.habitSqTodayOn]} />;
                      })}
                      <Text style={[s.habitPct, s.habitPctCell]}>{stats.perHabitPct[k]}%</Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.meta, s.cardFoot]}>{stats.doneThisWeek} of 35 this week{stats.longest && stats.longest.days >= 3 ? ` · ${HABIT_LABELS[stats.longest.habit].toLowerCase()} on a ${stats.longest.days}-day run` : ''}</Text>
              </Pressable>
            </>
          )}

          {/* ── Body ── */}
          <Text style={s.sectionTitle}>Body</Text>
          <View style={s.card}>
            <View style={s.rowBetween}>
              <View style={{ flex: 1 }}>
                {weightEntries.length > 0 ? (
                  <>
                    <Text style={s.weightBig}>{weightEntries[weightEntries.length - 1].weight} <Text style={s.weightUnit}>{unitLabel(unit)}</Text></Text>
                    <Text style={s.meta}>
                      {weightEntries.length > 1 ? `${(weightEntries[weightEntries.length - 1].weight - weightEntries[0].weight).toFixed(1).replace(/^(\d)/, '+$1').replace('+-', '−')} since ${shortDate(weightEntries[0].date)} · ` : ''}
                      {weightEntries.length} weigh-in{weightEntries.length === 1 ? '' : 's'}{healthWeights.length > 0 ? `, ${weightEntries.filter((w) => w.source === 'health').length} from ${platform}` : ''}
                    </Text>
                  </>
                ) : <Text style={s.emptyText}>No weigh-ins yet. Log one here, or a scale that writes to {platform} counts too.</Text>}
              </View>
            </View>
            {weightChartData.length >= 2 && (
              <LineChart data={weightChartData} height={80} width={chartWidth} color={C.textSecondary} thickness={2} hideRules hideYAxisText xAxisColor={C.borderMuted} yAxisColor="transparent" initialSpacing={12} endSpacing={16} spacing={Math.max(24, (chartWidth - 40) / Math.max(1, weightChartData.length - 1))} dataPointsRadius={3} textColor={C.textSecondary} textFontSize={11} textShiftY={-8} xAxisLabelTextStyle={{ color: C.textMuted, fontFamily: F.body, fontSize: 11 }} yAxisOffset={Math.max(0, Math.min(...weightEntries.map((p) => p.weight)) * 0.97)} />
            )}
            {healthWeights.length > 0 && weightEntries.length > 1 ? (
              <View style={s.legend}><Legend swatch={{ backgroundColor: C.textSecondary }} text="logged here" /><Legend swatch={{ backgroundColor: C.accent }} text={platform} /></View>
            ) : null}
            <View style={s.composerRow}>
              <TextInput style={s.composerInput} value={weightInput} onChangeText={setWeightInput} placeholder={`Today's weight (${unitLabel(unit)})`} placeholderTextColor={C.textFaint} keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={saveWeight} accessibilityLabel="Today's weight" />
              <Pressable style={[s.composerBtn, (!parseFloat(weightInput) || weightSaving) && { opacity: 0.4 }]} onPress={saveWeight} disabled={!parseFloat(weightInput) || weightSaving} accessibilityRole="button" accessibilityLabel="Log today's weight">
                {weightSaving ? <ActivityIndicator size="small" color={C.onAccent} /> : <Text style={s.composerBtnText}>{weightSaved ? 'Logged' : 'Log it'}</Text>}
              </Pressable>
            </View>
          </View>
          {photoLogs.length > 0 && (
            <View style={s.photoRow}>
              {[firstPhoto, latestPhoto].filter(Boolean).map((log: any, i: number) => (
                <Pressable key={log.id ?? i} style={[s.photoWrap, i === 1 && s.photoWrapLatest]} onPress={() => setViewerPhoto(log.photos[0])} accessibilityRole="button" accessibilityLabel={`${i === 0 ? 'First' : 'Latest'} photo, ${shortDate(log.date || log.created_at)}. Double tap to view full screen`}>
                  <Image source={{ uri: log.photos[0] }} style={s.photo} contentFit="cover" transition={200} />
                  <View style={s.photoCap}><Text style={s.photoCapText}>{shortDate(log.date || log.created_at)}{log.weight ? ` · ${Number(log.weight).toFixed(1)}` : ''}</Text></View>
                </Pressable>
              ))}
            </View>
          )}
          {photoLogs.length === 1 && <Text style={[s.meta, { marginTop: -6 }]}>One photo so far. The side-by-side compare unlocks with the second.</Text>}

          {/* ── Check-ins ── */}
          <View style={[s.sectionHead, { marginTop: 8 }]}>
            <Text style={s.sectionTitle}>Check-ins</Text>
            <Text style={s.meta}>Sundays · 2 minutes</Text>
          </View>
          {solo ? (
            <SundayCheckIn facts={weekFacts} health={healthFacts} characterKey={clientData?.solo_character} onReplied={fetchExtras} />
          ) : (
            <WeeklyCheckIn />
          )}
          {!loading && (checkins || []).filter((ci: any) => solo ? ci.week_start < localDayString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))) : true).map((ci: any) => {
            const ratings: Array<[string, number | null]> = [['energy', ci.energy_level], ['sleep', ci.sleep_quality], ['training', ci.workout_adherence], ['food', ci.diet_adherence]];
            const present = ratings.filter(([, v]) => v != null);
            const reply = solo ? ci.corner_reply : ci.coach_note;
            return (
              <View key={ci.id} style={s.checkinRow} accessible accessibilityLabel={[`Check-in, week of ${shortDate(ci.week_start)}`, ...present.map(([l, v]) => `${l} ${v} of 5`), reply ? 'replied' : null].filter(Boolean).join(', ')}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.checkinWeek}>Week of {shortDate(ci.week_start)}</Text>
                  {present.length > 0 && <View style={s.ratingRow}>{present.map(([l, v]) => <View key={l} style={s.ratingPill}><Text style={[s.ratingText, (v as number) >= 4 && { color: C.accent }]}>{l} {v}</Text></View>)}</View>}
                  {reply ? <Text style={s.meta} numberOfLines={2}>{solo ? 'Replied' : `${coachFirst} replied`} · "{reply}"</Text> : ci.highlight ? <Text style={s.meta} numberOfLines={2}>"{ci.highlight}"</Text> : null}
                </View>
              </View>
            );
          })}
          {!loading && (checkins || []).length === 0 && !solo && (
            <View style={s.card}><Text style={s.emptyText}>No check-ins submitted yet. The first one is above.</Text></View>
          )}
        </ScrollView>
      </View>

      <Modal visible={!!viewerPhoto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setViewerPhoto(null)}>
        <View style={s.viewerBackdrop}>
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewerPhoto(null)} accessibilityRole="button" accessibilityLabel="Close photo"><Ionicons name="close" size={28} color={C.textPrimary} /></TouchableOpacity>
          {viewerPhoto ? <Image source={{ uri: viewerPhoto }} style={s.viewerImage} contentFit="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

function Legend({ swatch, text }: { swatch: any; text: string }) {
  return <View style={s.legendItem}><View style={[s.legendSwatch, swatch]} /><Text style={s.legendText}>{text}</Text></View>;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: F.headingBold, fontSize: 32, lineHeight: 36, color: C.textPrimary },
  subtitle: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textSecondary, marginTop: 4 },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 40, height: 40 },
  avatarInitials: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 18, borderCurve: 'continuous', padding: 16, gap: 12 },
  cardFoot: { borderTopWidth: 1, borderTopColor: C.borderMuted, paddingTop: 10 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  kicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.textFaint },
  meta: { fontFamily: F.body, fontSize: 12.5, color: C.textSecondary, flexShrink: 1 },
  cardTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  link: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.accent },
  emptyText: { fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: C.textMuted },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary, marginTop: 4 },
  coachCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 18, borderCurve: 'continuous', padding: 16 },
  coachRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  coachAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  coachAvatarText: { fontFamily: F.bodyBold, fontSize: 12, color: C.accent },
  coachMeta: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.accent, marginBottom: 6 },
  coachNote: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.textPrimary },
  rings: { flexDirection: 'row', gap: 8 },
  ringGhost: { flex: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 14, borderCurve: 'continuous' },
  ringGhostText: { fontFamily: F.bodySemiBold, fontSize: 11, color: C.textFaint, textAlign: 'center' },
  weekBlock: { gap: 8, borderTopWidth: 1, borderTopColor: C.borderMuted, paddingTop: 12 },
  weekGrid: { flexDirection: 'row', gap: 6, alignItems: 'flex-end', height: 76 },
  weekCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' },
  stepBar: { width: '100%', borderRadius: 4 },
  dayDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { backgroundColor: C.accent, borderColor: C.accent },
  dayDotToday: { borderColor: C.accent },
  dayDotPlanned: { borderStyle: 'dashed' },
  dayLetter: { fontFamily: F.body, fontSize: 10, color: C.textFaint },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: F.body, fontSize: 11, color: C.textFaint },
  doors: { flexDirection: 'row', gap: 10 },
  door: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  doorLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doorText: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  chipRow: { gap: 8, paddingBottom: 2 },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textSecondary },
  chipTextActive: { color: C.onAccent, fontFamily: F.bodyBold },
  liftName: { fontFamily: F.headingBold, fontSize: 17, color: C.textPrimary },
  liftDelta: { fontFamily: F.mono, fontSize: 15, color: C.accent },
  factRow: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 12, borderCurve: 'continuous', padding: 12 },
  factText: { fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.textSecondary },
  prHero: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.raised, borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)', borderRadius: 18, borderCurve: 'continuous', padding: 16 },
  prKicker: { fontFamily: F.bodyBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: C.accent },
  prName: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary },
  prBig: { fontFamily: F.headingBold, fontSize: 34, color: C.accent },
  prRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 14 },
  prBadge: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  prBadgeEmblem: { width: 22, height: 22 },
  prRowName: { fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  prRowWeight: { fontFamily: F.mono, fontSize: 15, color: C.textPrimary },
  habitGrid: { gap: 6 },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  habitLabelCell: { width: 84 },
  habitPctCell: { width: 34 },
  habitLabel: { fontFamily: F.body, fontSize: 12.5, color: C.textPrimary },
  habitDay: { flex: 1, textAlign: 'center', fontFamily: F.body, fontSize: 10, color: C.textFaint },
  habitSq: { flex: 1, height: 22, borderRadius: 6, backgroundColor: C.borderMuted },
  habitSqOn: { backgroundColor: C.accent },
  habitSqToday: { backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  habitSqTodayOn: { borderWidth: 2, borderColor: 'rgba(198,242,78,0.45)' },
  habitPct: { textAlign: 'right', fontFamily: F.mono, fontSize: 11, color: C.textSecondary },
  weightBig: { fontFamily: F.headingBold, fontSize: 26, color: C.textPrimary },
  weightUnit: { fontFamily: F.body, fontSize: 14, color: C.textSecondary },
  composerRow: { flexDirection: 'row', gap: 8 },
  composerInput: { flex: 1, height: 44, borderRadius: 12, borderCurve: 'continuous', backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderMuted, paddingHorizontal: 14, fontFamily: F.body, fontSize: 14, color: C.textPrimary },
  composerBtn: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderCurve: 'continuous', backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  composerBtnText: { fontFamily: F.bodyBold, fontSize: 13.5, color: C.onAccent },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoWrap: { flex: 1, aspectRatio: 3 / 4, borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden', borderWidth: 1, borderColor: C.borderMuted, backgroundColor: C.surface },
  photoWrapLatest: { borderColor: 'rgba(198,242,78,0.35)' },
  photo: { width: '100%', height: '100%' },
  photoCap: { position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(16,18,16,0.7)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8 },
  photoCapText: { fontFamily: F.body, fontSize: 11, color: C.textPrimary },
  checkinRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 14, borderCurve: 'continuous', paddingVertical: 12, paddingHorizontal: 14 },
  checkinWeek: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ratingPill: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
  ratingText: { fontFamily: F.mono, fontSize: 11, color: C.textSecondary },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 56, right: 20, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
});
