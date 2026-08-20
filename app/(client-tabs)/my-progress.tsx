/**
 * (client-tabs)/my-progress.tsx — Progress (design turn 23c).
 *
 * "Four weeks of evidence, in one scroll" — the numbers and the photos on one
 * screen because neither means much alone. Fixed dark/lime system
 * (constants/coachDesign.ts). No useTheme here.
 *
 * Every series needs at least two real points to draw a curve; a single point
 * renders as a stated fact and zero renders as an honest absence. Nothing on
 * this screen is invented:
 *   - Lift curves      → client_workout_logs.exercises (best completed set per session)
 *   - Weight trend     → client_progress.weight
 *   - Photos           → client_progress.photos[]
 *   - Check-in history → client_checkins (submitted rows)
 *   - Coach's word     → client_checkins.coach_note
 *   - PR moments       → derived from the same workout logs, chronologically
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Modal,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LineChart } from 'react-native-gifted-charts';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import WeeklyCheckIn from '../../components/client-tabs/home/WeeklyCheckIn';
import { ClientRoute } from '../../types/routes';
import { weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import { countSetFeels, analyzeFeelCounts } from '../../lib/setFeel';
import HabitGrid, { HABITS, getLast7Days } from '../../components/shared/HabitGrid';

const C = CoachColors;
const F = CoachFonts;
const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiftPoint {
  date: string; // ISO
  weight: number;
}

interface LiftSeries {
  exerciseId: string;
  name: string;
  points: LiftPoint[]; // chronological
}

interface PrMoment {
  name: string;
  weight: number;
  date: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function initials(name?: string): string {
  if (!name) return '';
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AthleteProgressScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    clientData,
    trainer,
    workouts,
    progressLogs,
    enrollment,
    plans,
    logProgress,
    refreshData,
  } = useClient();

  const [refreshing, setRefreshing] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState<any[] | null>(null); // null = loading
  const [checkins, setCheckins] = useState<any[] | null>(null);
  // client_habits rows for the last 7 days, indexed by date. null = loading or
  // table unreachable (pre-migration) — the section hides in both cases.
  const [habitRows, setHabitRows] = useState<Record<string, any> | null>(null);
  const [selectedLift, setSelectedLift] = useState<string | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<string | null>(null);

  // Weight composer
  const [weightInput, setWeightInput] = useState('');
  const [weightSaving, setWeightSaving] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);

  const coachFirst = firstName(trainer?.name) || 'your coach';

  // ── Fetch workout logs + check-ins (screen-scoped; context only keeps PRs) ──
  const fetchExtras = useCallback(async () => {
    if (!clientData?.id) return;
    const habitDates = getLast7Days().map((d) => d.date);
    const [logsRes, checkinsRes, habitsRes] = await Promise.all([
      supabase
        .from('client_workout_logs')
        .select('exercises, created_at')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('client_checkins')
        .select('*')
        .eq('client_id', clientData.id)
        .not('submitted_at', 'is', null)
        .order('week_start', { ascending: false })
        .limit(8),
      supabase
        .from('client_habits')
        .select('*')
        .eq('client_id', clientData.id)
        .in('date', habitDates),
    ]);
    setWorkoutLogs(logsRes.data || []);
    setCheckins(checkinsRes.data || []);
    // Habits: an error (including 42P01 pre-migration) just keeps the section
    // hidden — never a crash, never an empty shell.
    if (habitsRes.error) {
      setHabitRows(null);
    } else {
      const indexed: Record<string, any> = {};
      (habitsRes.data || []).forEach((row: any) => { indexed[row.date] = row; });
      setHabitRows(indexed);
    }
  }, [clientData?.id]);

  useEffect(() => {
    fetchExtras();
  }, [fetchExtras]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), fetchExtras()]);
    setRefreshing(false);
  }, [refreshData, fetchExtras]);

  // ── Exercise id → name, from the assigned workouts' nested exercises ──────
  const exerciseNames = useMemo(() => {
    const map: Record<string, string> = {};
    (workouts || []).forEach((cw: any) => {
      (cw.workouts?.workout_exercises || []).forEach((we: any) => {
        const ex = we.exercises;
        if (ex?.id && ex?.name) map[ex.id] = ex.name;
      });
    });
    return map;
  }, [workouts]);

  // ── Lift series: best completed set weight per session, per exercise ──────
  const liftSeries: LiftSeries[] = useMemo(() => {
    if (!workoutLogs) return [];
    const byExercise: Record<string, LiftPoint[]> = {};
    workoutLogs.forEach((row: any) => {
      const date = row.created_at;
      (row.exercises || []).forEach((ex: any) => {
        if (!ex?.id) return;
        let best = 0;
        (ex.sets || []).forEach((set: any) => {
          if (!set?.completed) return;
          const w = parseFloat(String(set.weight)) || 0;
          if (w > best) best = w;
        });
        if (best <= 0) return;
        if (!byExercise[ex.id]) byExercise[ex.id] = [];
        byExercise[ex.id].push({ date, weight: best });
      });
    });
    return Object.entries(byExercise)
      .map(([exerciseId, points]) => ({
        exerciseId,
        name: exerciseNames[exerciseId] || 'Unnamed exercise',
        points,
      }))
      .filter((s) => s.name !== 'Unnamed exercise')
      .sort((a, b) => b.points.length - a.points.length);
  }, [workoutLogs, exerciseNames]);

  const chartableLifts = useMemo(() => liftSeries.filter((s) => s.points.length >= 2), [liftSeries]);
  const singleLifts = useMemo(() => liftSeries.filter((s) => s.points.length === 1), [liftSeries]);

  // Default chip selection: the lift with the most sessions logged
  useEffect(() => {
    if (!selectedLift && chartableLifts.length > 0) {
      setSelectedLift(chartableLifts[0].exerciseId);
    }
  }, [chartableLifts, selectedLift]);

  const activeLift = chartableLifts.find((s) => s.exerciseId === selectedLift) || chartableLifts[0];

  // ── PR moments: chronological new-max events across all logs ──────────────
  const prMoments: PrMoment[] = useMemo(() => {
    const maxSoFar: Record<string, number> = {};
    const events: PrMoment[] = [];
    liftSeries
      .flatMap((s) => s.points.map((p) => ({ ...p, name: s.name, id: s.exerciseId })))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach((p) => {
        const prev = maxSoFar[p.id] ?? 0;
        if (p.weight > prev) {
          maxSoFar[p.id] = p.weight;
          if (prev > 0) events.push({ name: p.name, weight: p.weight, date: p.date }); // first log isn't a PR
        }
      });
    return events.slice(-3).reverse();
  }, [liftSeries]);

  // ── Weight trend from client_progress ─────────────────────────────────────
  const weightEntries = useMemo(() => {
    return (progressLogs || [])
      .filter((p: any) => p.weight != null)
      .map((p: any) => ({ date: p.date || p.created_at, weight: Number(p.weight) }))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [progressLogs]);

  // ── Photos from client_progress ────────────────────────────────────────────
  const photoLogs = useMemo(() => {
    return (progressLogs || [])
      .filter((p: any) => Array.isArray(p.photos) && p.photos.length > 0)
      .sort((a: any, b: any) => new Date(a.date || a.created_at).getTime() - new Date(b.date || b.created_at).getTime());
  }, [progressLogs]);

  const firstPhotoLog = photoLogs[0];
  const latestPhotoLog = photoLogs.length > 1 ? photoLogs[photoLogs.length - 1] : null;

  // ── Header context line ────────────────────────────────────────────────────
  // Week number comes from lib/passWeeks (track position), the same math as
  // Train and Pass — never from elapsed calendar time.
  const headerSub = useMemo(() => {
    if (
      enrollment?.status === 'active' &&
      Array.isArray(enrollment.track_snapshot) &&
      enrollment.track_snapshot.length > 0
    ) {
      const track = [...enrollment.track_snapshot].sort(
        (a: any, b: any) => (a.order || 0) - (b.order || 0)
      );
      const plan = (plans || []).find((p: any) => p.id === enrollment.plan_id);
      const dw = plan?.duration_weeks ?? null;
      const weeks = totalWeeks(track, dw);
      const week = Math.min(
        weekOfPosition(Math.min(enrollment.track_position || 0, track.length - 1), track, dw),
        weeks
      );
      return `Week ${week} of ${weeks} on your plan`;
    }
    const plan = plans?.find((p: any) => p.id === clientData?.plan_id);
    if (plan?.name) return plan.name;
    return 'Everything you have logged, in one place';
  }, [enrollment, plans, clientData?.plan_id]);

  // ── Four-week summary (real counts only) ───────────────────────────────────
  const fourWeekSessions = useMemo(() => {
    const cutoff = Date.now() - 28 * 24 * 3600 * 1000;
    return (workouts || []).filter(
      (w: any) => w.status === 'completed' && w.completed_at && new Date(w.completed_at).getTime() >= cutoff,
    ).length;
  }, [workouts]);

  const liftsUp = useMemo(
    () => chartableLifts.filter((s) => s.points[s.points.length - 1].weight > s.points[0].weight).length,
    [chartableLifts],
  );

  // ── Latest coach note from check-ins ───────────────────────────────────────
  const latestCoachNote = useMemo(() => (checkins || []).find((c: any) => c.coach_note), [checkins]);

  // ── How training felt — your own per-set ratings, last 7 days ─────────────
  // Same math as the coach's card (lib/setFeel: >= 3 rated sets, ties break
  // toward the harder rating, heavy = grinds/fails over half) — only the
  // voice changes, because here the reader is the one who did the sets.
  const feelSummary = useMemo(() => {
    if (!workoutLogs) return null;
    const since = Date.now() - 7 * 86400000;
    const recent = workoutLogs.filter((r: any) => new Date(r.created_at).getTime() >= since);
    const a = analyzeFeelCounts(countSetFeels(recent));
    if (!a) return null;
    const topPhrase = a.top === 'easy' ? 'most felt easy'
      : a.top === 'right' ? 'most felt right'
      : a.top === 'grind' ? 'most were grinds'
      : 'most were failed reps';
    const hardTail = (a.top === 'easy' || a.top === 'right') && a.hard > 0
      ? `, ${a.hard} ${a.hard === 1 ? 'was' : 'were'} hard`
      : '';
    return {
      line: `This week: ${a.rated} rated set${a.rated === 1 ? '' : 's'} — ${topPhrase}${hardTail}.`,
      heavy: a.heavy,
    };
  }, [workoutLogs]);

  // ── Your habits this week — same grid the coach sees, scoped to you ───────
  const habitDays = useMemo(() => getLast7Days(), []);
  const habitsLogged = useMemo(() => {
    if (!habitRows) return 0;
    return HABITS.reduce(
      (sum, habit) => sum + habitDays.filter((d) => habitRows[d.date]?.[habit.key] === true).length,
      0,
    );
  }, [habitRows, habitDays]);

  // ── Weight composer save ───────────────────────────────────────────────────
  const saveWeight = useCallback(async () => {
    const val = parseFloat(weightInput);
    if (!val || isNaN(val) || val <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setWeightSaving(true);
    try {
      await logProgress({ weight: val });
      setWeightSaved(true);
      setWeightInput('');
      await refreshData();
      setTimeout(() => setWeightSaved(false), 2500);
    } catch {
      // logProgress surfaces its own errors upstream; stay quiet here
    }
    setWeightSaving(false);
  }, [weightInput, logProgress, refreshData]);

  // ── Chart data for the active lift ─────────────────────────────────────────
  const chartWidth = SCREEN_WIDTH - 40 - 34; // padding + card padding
  const liftChartData = useMemo(() => {
    if (!activeLift) return [];
    return activeLift.points.map((p, i) => ({
      value: p.weight,
      label: i === 0 || i === activeLift.points.length - 1 ? shortDate(p.date) : '',
      dataPointText: i === activeLift.points.length - 1 ? `${p.weight}` : '',
    }));
  }, [activeLift]);

  const weightChartData = useMemo(() => {
    if (weightEntries.length < 2) return [];
    return weightEntries.map((p: any, i: number) => ({
      value: p.weight,
      label: i === 0 || i === weightEntries.length - 1 ? shortDate(p.date) : '',
      dataPointText: i === weightEntries.length - 1 ? `${p.weight}` : '',
    }));
  }, [weightEntries]);

  const loadingExtras = workoutLogs === null || checkins === null;

  return (
    <View style={s.container}>
      {/* The inline weight composer sits mid-page; without this the keyboard
          covered it. 'padding' is correct on iOS only — on Android the activity
          already resizes (adjustResize) and padding double-counts. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
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
          <Pressable
            style={s.avatarBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(ClientRoute.myProfile);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            {clientData?.avatar_url ? (
              <Image source={{ uri: clientData.avatar_url }} style={s.avatarImg} contentFit="cover" />
            ) : (
              <Text style={s.avatarInitials}>{initials(clientData?.name) || '·'}</Text>
            )}
          </Pressable>
        </View>

        {/* ── Four-week summary (only when there is something to summarise) ── */}
        {fourWeekSessions > 0 && (
          <View style={s.summaryCard}>
            <Text style={s.summaryKicker}>Last four weeks</Text>
            <Text style={s.summaryBody}>
              {`You've trained ${fourWeekSessions} session${fourWeekSessions === 1 ? '' : 's'}`}
              {liftsUp > 0
                ? ` and ${liftsUp} lift${liftsUp === 1 ? ' has' : 's have'} gone up.`
                : '.'}
            </Text>
          </View>
        )}

        {/* ── Weekly check-in (Sunday rhythm — lives at the top) ── */}
        <WeeklyCheckIn />

        {/* ── Main lifts ── */}
        <Text style={s.sectionTitle}>Main lifts</Text>
        {loadingExtras ? (
          <View style={s.card}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : chartableLifts.length === 0 && singleLifts.length === 0 ? (
          <View style={s.card}>
            <Text style={s.emptyText}>
              No lift data yet — finish a session with logged sets and your curves start here.
            </Text>
          </View>
        ) : (
          <>
            {chartableLifts.length > 0 && (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                  {chartableLifts.map((lift) => {
                    const active = activeLift?.exerciseId === lift.exerciseId;
                    return (
                      <Pressable hitSlop={{ top: 6, bottom: 6 }}
                        key={lift.exerciseId}
                        style={[s.chip, active && s.chipActive]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedLift(lift.exerciseId);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`${lift.name}, ${lift.points.length} sessions logged`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[s.chipText, active && s.chipTextActive]}>{lift.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {activeLift && (
                  <View style={s.card}>
                    <View
                      style={s.liftHeadRow}
                      accessible={true}
                      accessibilityLabel={`${activeLift.name}, from ${activeLift.points[0].weight} to ${activeLift.points[activeLift.points.length - 1].weight} over ${activeLift.points.length} sessions`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.liftName}>{activeLift.name}</Text>
                        <Text style={s.liftRange}>
                          {activeLift.points[0].weight} → {activeLift.points[activeLift.points.length - 1].weight}
                          {'  ·  '}
                          {activeLift.points.length} sessions
                        </Text>
                      </View>
                      {(() => {
                        const first = activeLift.points[0].weight;
                        const last = activeLift.points[activeLift.points.length - 1].weight;
                        const pct = first > 0 ? Math.round(((last - first) / first) * 100) : 0;
                        return (
                          <Text style={[s.liftDelta, pct <= 0 && { color: C.textMuted }]}>
                            {pct > 0 ? `+${pct}%` : pct === 0 ? 'level' : `${pct}%`}
                          </Text>
                        );
                      })()}
                    </View>
                    <View style={{ marginTop: 14 }}>
                      <LineChart
                        data={liftChartData}
                        height={110}
                        width={chartWidth}
                        color={C.accent}
                        thickness={2.5}
                        startFillColor="rgba(198,242,78,0.14)"
                        endFillColor="rgba(198,242,78,0)"
                        areaChart
                        hideRules
                        hideYAxisText
                        xAxisColor={C.borderMuted}
                        yAxisColor="transparent"
                        initialSpacing={12}
                        endSpacing={16}
                        spacing={Math.max(24, (chartWidth - 40) / Math.max(1, liftChartData.length - 1))}
                        dataPointsColor={C.accent}
                        dataPointsRadius={3.5}
                        textColor={C.textSecondary}
                        textFontSize={11}
                        textShiftY={-8}
                        xAxisLabelTextStyle={{ color: C.textMuted, fontFamily: F.body, fontSize: 11 }}
                        yAxisOffset={Math.max(0, Math.min(...activeLift.points.map((p) => p.weight)) * 0.9)}
                      />
                    </View>
                  </View>
                )}
              </>
            )}

            {/* Single-session lifts: stated facts, no curve */}
            {singleLifts.slice(0, 3).map((lift) => (
              <View key={lift.exerciseId} style={s.factRow}>
                <Text style={s.factText}>
                  {lift.name} — one session logged at {lift.points[0].weight}. One more and you get a curve.
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ── PR moments ── */}
        {prMoments.length > 0 && (
          <>
            <Text style={s.sectionTitle}>PR moments</Text>
            {prMoments.map((pr, i) => (
              <View
                key={`${pr.name}-${pr.date}-${i}`}
                style={s.prRow}
                accessible={true}
                accessibilityLabel={`${pr.name}, new best ${pr.weight}, ${shortDate(pr.date)}`}
              >
                <View style={s.prBadge}>
                  <Ionicons name="trending-up" size={16} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.prName}>{pr.name}</Text>
                  <Text style={s.prSub}>New best · {shortDate(pr.date)}</Text>
                </View>
                <Text style={s.prWeight}>{pr.weight}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── How training felt — your own per-set ratings, last 7 days.
            Hidden entirely below 3 rated sets — no empty shell. ── */}
        {feelSummary && (
          <>
            <Text style={s.sectionTitle}>How training felt</Text>
            <View
              style={s.card}
              accessible={true}
              accessibilityLabel={`How training felt. ${feelSummary.line}${feelSummary.heavy ? ` Heavy week — worth mentioning to ${coachFirst} in your next check-in.` : ''}`}
            >
              <View style={s.feelRow}>
                <Ionicons name="pulse-outline" size={20} color={feelSummary.heavy ? C.warning : C.accent} />
                <Text style={s.feelText}>{feelSummary.line}</Text>
              </View>
              {feelSummary.heavy && (
                <View style={[s.feelRow, s.feelHeavyRow]}>
                  <Ionicons name="alert-circle-outline" size={20} color={C.warning} />
                  <Text style={[s.feelText, { color: C.warning }]}>
                    Heavy week — worth mentioning to {coachFirst} in your next check-in.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Bodyweight ── */}
        <Text style={s.sectionTitle}>Bodyweight</Text>
        <View style={s.card}>
          {weightEntries.length >= 2 ? (
            <>
              <View style={s.liftHeadRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.liftName}>{weightEntries[weightEntries.length - 1].weight} lbs</Text>
                  <Text style={s.liftRange}>
                    {weightEntries[0].weight} on {shortDate(weightEntries[0].date)} → today's log
                  </Text>
                </View>
                {(() => {
                  const delta = weightEntries[weightEntries.length - 1].weight - weightEntries[0].weight;
                  return (
                    <Text style={[s.liftDelta, { color: C.textSecondary }]}>
                      {delta > 0 ? '+' : ''}
                      {delta.toFixed(1)}
                    </Text>
                  );
                })()}
              </View>
              <View style={{ marginTop: 14 }}>
                <LineChart
                  data={weightChartData}
                  height={90}
                  width={chartWidth}
                  color={C.textSecondary}
                  thickness={2}
                  hideRules
                  hideYAxisText
                  xAxisColor={C.borderMuted}
                  yAxisColor="transparent"
                  initialSpacing={12}
                  endSpacing={16}
                  spacing={Math.max(24, (chartWidth - 40) / Math.max(1, weightChartData.length - 1))}
                  dataPointsColor={C.textSecondary}
                  dataPointsRadius={3}
                  textColor={C.textSecondary}
                  textFontSize={11}
                  textShiftY={-8}
                  xAxisLabelTextStyle={{ color: C.textMuted, fontFamily: F.body, fontSize: 11 }}
                  yAxisOffset={Math.max(0, Math.min(...weightEntries.map((p: any) => p.weight)) * 0.97)}
                />
              </View>
            </>
          ) : weightEntries.length === 1 ? (
            <Text style={s.emptyText}>
              One weigh-in so far: {weightEntries[0].weight} lbs on {shortDate(weightEntries[0].date)}. A second
              gives you a trend.
            </Text>
          ) : (
            <Text style={s.emptyText}>No weigh-ins yet. Log one below — it takes five seconds.</Text>
          )}

          {/* Inline weight composer (same logProgress path as before) */}
          <View style={s.composerRow}>
            <TextInput
              style={s.composerInput}
              value={weightInput}
              onChangeText={setWeightInput}
              placeholder="Today's weight"
              placeholderTextColor={C.textFaint}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={saveWeight}
              accessibilityLabel="Today's weight"
            />
            <Pressable
              style={[s.composerBtn, (!parseFloat(weightInput) || weightSaving) && { opacity: 0.4 }]}
              onPress={saveWeight}
              disabled={!parseFloat(weightInput) || weightSaving}
              accessibilityRole="button"
              accessibilityLabel="Log today's weight"
            >
              {weightSaving ? (
                <ActivityIndicator size="small" color={C.onAccent} />
              ) : (
                <Text style={s.composerBtnText}>{weightSaved ? 'Logged' : 'Log it'}</Text>
              )}
            </Pressable>
          </View>
        </View>

        {/* ── Photos ── */}
        <Text style={s.sectionTitle}>Photos</Text>
        {photoLogs.length === 0 ? (
          <View style={s.card}>
            <Text style={s.emptyText}>No photos yet — add one with your next check-in and the compare unlocks here.</Text>
          </View>
        ) : photoLogs.length === 1 ? (
          <View style={s.card}>
            <Pressable
              onPress={() => setViewerPhoto(firstPhotoLog.photos[0])}
              style={s.singlePhotoWrap}
              accessibilityRole="button"
              accessibilityLabel={`Progress photo, ${shortDate(firstPhotoLog.date || firstPhotoLog.created_at)}. Double tap to view full screen`}
            >
              <Image source={{ uri: firstPhotoLog.photos[0] }} style={s.singlePhoto} contentFit="cover" transition={200} />
            </Pressable>
            <Text style={[s.emptyText, { marginTop: 10 }]}>
              One photo so far, from {shortDate(firstPhotoLog.date || firstPhotoLog.created_at)}. The side-by-side
              compare unlocks with the second.
            </Text>
          </View>
        ) : (
          <>
            {/* First vs latest compare */}
            <View style={s.compareRow}>
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => setViewerPhoto(firstPhotoLog.photos[0])}
                  accessibilityRole="button"
                  accessibilityLabel={`First photo, ${shortDate(firstPhotoLog.date || firstPhotoLog.created_at)}${firstPhotoLog.weight ? `, ${Number(firstPhotoLog.weight).toFixed(1)} pounds` : ''}. Double tap to view full screen`}
                >
                  <Image source={{ uri: firstPhotoLog.photos[0] }} style={s.comparePhoto} contentFit="cover" transition={200} />
                </Pressable>
                <Text style={s.compareCaption}>
                  {shortDate(firstPhotoLog.date || firstPhotoLog.created_at)}
                  {firstPhotoLog.weight ? ` · ${Number(firstPhotoLog.weight).toFixed(1)} lbs` : ''}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={19} color={C.textFaint} style={{ alignSelf: 'center' }} />
              <View style={{ flex: 1 }}>
                <Pressable
                  onPress={() => setViewerPhoto(latestPhotoLog!.photos[0])}
                  accessibilityRole="button"
                  accessibilityLabel={`Latest photo, ${shortDate(latestPhotoLog!.date || latestPhotoLog!.created_at)}${latestPhotoLog!.weight ? `, ${Number(latestPhotoLog!.weight).toFixed(1)} pounds` : ''}. Double tap to view full screen`}
                >
                  <Image
                    source={{ uri: latestPhotoLog!.photos[0] }}
                    style={[s.comparePhoto, s.comparePhotoLatest]}
                    contentFit="cover"
                    transition={200}
                  />
                </Pressable>
                <Text style={s.compareCaption}>
                  {shortDate(latestPhotoLog!.date || latestPhotoLog!.created_at)}
                  {latestPhotoLog!.weight ? ` · ${Number(latestPhotoLog!.weight).toFixed(1)} lbs` : ''}
                </Text>
              </View>
            </View>

            {/* Full timeline */}
            {photoLogs.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
                {photoLogs.map((log: any) => (
                  <Pressable
                    key={log.id}
                    onPress={() => setViewerPhoto(log.photos[0])}
                    style={s.photoThumbWrap}
                    accessibilityRole="button"
                    accessibilityLabel={`Progress photo, ${shortDate(log.date || log.created_at)}. Double tap to view full screen`}
                  >
                    <Image source={{ uri: log.photos[0] }} style={s.photoThumb} contentFit="cover" transition={200} />
                    <Text style={s.photoThumbDate}>{shortDate(log.date || log.created_at)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </>
        )}

        {/* ── Coach's word (real coach_note from a check-in) ── */}
        {latestCoachNote && (
          <View style={[s.card, { marginTop: 20 }]}>
            <View style={s.coachRow}>
              <View style={s.coachAvatar}>
                <Text style={s.coachAvatarText}>{initials(trainer?.name) || '·'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.coachMeta}>
                  {coachFirst}, after your {shortDate(latestCoachNote.week_start)} check-in
                </Text>
                <Text style={s.coachNote}>"{latestCoachNote.coach_note}"</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Your habits this week — the same grid your coach sees. Hidden
            when the table is unreachable or nothing is logged yet. ── */}
        {habitRows !== null && habitsLogged > 0 && (
          <>
            <Text style={s.sectionTitle}>Your habits this week</Text>
            <View style={s.habitCard}>
              <HabitGrid rows={habitRows} days={habitDays} showTopBorder={false} />
            </View>
          </>
        )}

        {/* ── Check-in history ── */}
        <Text style={s.sectionTitle}>Check-ins</Text>
        {loadingExtras ? null : (checkins || []).length === 0 ? (
          <View style={s.card}>
            <Text style={s.emptyText}>
              No check-ins submitted yet. The first one is above — it takes two minutes on a Sunday.
            </Text>
          </View>
        ) : (
          (checkins || []).map((ci: any) => {
            const ratings: Array<[string, number | null]> = [
              ['Energy', ci.energy_level],
              ['Sleep', ci.sleep_quality],
              ['Training', ci.workout_adherence],
              ['Food', ci.diet_adherence],
            ];
            const present = ratings.filter(([, v]) => v != null);
            return (
              <View
                key={ci.id}
                style={s.checkinRow}
                accessible={true}
                accessibilityLabel={[
                  `Check-in, week of ${shortDate(ci.week_start)}`,
                  ...present.map(([label, v]) => `${label} ${v} of 5`),
                  ci.highlight ? `Highlight: ${ci.highlight}` : null,
                  ci.coach_note ? 'Coach replied' : null,
                ].filter(Boolean).join(', ')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.checkinWeek}>Week of {shortDate(ci.week_start)}</Text>
                  {present.length > 0 && (
                    <View style={s.ratingRow}>
                      {present.map(([label, v]) => (
                        <View key={label} style={s.ratingPill}>
                          <Text style={s.ratingLabel}>{label}</Text>
                          <Text style={[s.ratingValue, (v as number) >= 4 && { color: C.accent }]}>{v}/5</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {!!ci.highlight && (
                    <Text style={s.checkinNote} numberOfLines={2}>
                      "{ci.highlight}"
                    </Text>
                  )}
                </View>
                {ci.coach_note ? (
                  <View style={s.repliedDot} />
                ) : null}
              </View>
            );
          })
        )}

      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Fullscreen photo viewer ── */}
      <Modal
        visible={!!viewerPhoto}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerPhoto(null)}
      >
        <View style={s.viewerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setViewerPhoto(null)} activeOpacity={1} />
          {viewerPhoto && (
            <Image source={{ uri: viewerPhoto }} style={s.viewerImage} contentFit="contain" />
          )}
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewerPhoto(null)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }} accessibilityRole="button" accessibilityLabel="Close photo">
            <Ionicons name="close" size={25} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scroll: {
    paddingHorizontal: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 24.5,
    color: C.textPrimary,
  },
  subtitle: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    marginTop: 2,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderCurve: 'continuous',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontFamily: F.bodyBold,
    fontSize: 14.5,
    color: C.accent,
  },

  // Summary card
  summaryCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 20,
    borderCurve: 'continuous',
    padding: 17,
    marginBottom: 16,
  },
  summaryKicker: {
    fontFamily: F.bodyBold,
    fontSize: 12.5,
    color: C.accent,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  summaryBody: {
    fontFamily: F.bodySemiBold,
    fontSize: 17,
    color: C.textPrimary,
    lineHeight: 24.5,
    marginTop: 8,
  },

  // Sections
  sectionTitle: {
    fontFamily: F.bodyBold,
    fontSize: 12.5,
    color: C.textFaint,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 12,
  },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 16,
  },
  emptyText: {
    fontFamily: F.body,
    fontSize: 14.5,
    color: C.textMuted,
    lineHeight: 21.5,
  },

  // Lift chips
  chipRow: {
    gap: 7,
    paddingBottom: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: C.accentSoft,
    borderColor: C.accent,
  },
  chipText: {
    fontFamily: F.bodySemiBold,
    fontSize: 13.5,
    color: C.textSecondary,
  },
  chipTextActive: {
    color: C.accent,
  },

  liftHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  liftName: {
    fontFamily: F.bodySemiBold,
    fontSize: 17,
    color: C.textPrimary,
  },
  liftRange: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    marginTop: 3,
  },
  liftDelta: {
    fontFamily: F.bodyBold,
    fontSize: 14.5,
    color: C.accent,
  },
  factRow: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 13,
    marginTop: 9,
  },
  factText: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 20,
  },

  // How training felt
  feelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  feelText: {
    flex: 1,
    fontFamily: F.bodyMedium,
    fontSize: 15,
    color: C.textPrimary,
    lineHeight: 21.5,
  },
  feelHeavyRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
  },

  // Habits grid card (the grid draws its own inner padding and dividers)
  habitCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingTop: 12,
    overflow: 'hidden',
  },

  // PR rows
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 13,
    marginBottom: 9,
  },
  prBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderCurve: 'continuous',
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prName: {
    fontFamily: F.bodySemiBold,
    fontSize: 15,
    color: C.textPrimary,
  },
  prSub: {
    fontFamily: F.body,
    fontSize: 13,
    color: C.textMuted,
    marginTop: 2,
  },
  prWeight: {
    fontFamily: F.headingBold,
    fontSize: 18,
    color: C.accent,
  },

  // Weight composer
  composerRow: {
    flexDirection: 'row',
    gap: 9,
    marginTop: 14,
  },
  composerInput: {
    flex: 1,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: F.bodyMedium,
    fontSize: 15.5,
    color: C.textPrimary,
  },
  composerBtn: {
    backgroundColor: C.accent,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerBtnText: {
    fontFamily: F.bodyBold,
    fontSize: 14.5,
    color: C.onAccent,
  },

  // Photos
  compareRow: {
    flexDirection: 'row',
    gap: 9,
  },
  comparePhoto: {
    aspectRatio: 3 / 4,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    width: '100%',
  },
  comparePhotoLatest: {
    borderColor: C.accent,
    borderWidth: 1.5,
  },
  compareCaption: {
    fontFamily: F.body,
    fontSize: 12.5,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 7,
  },
  singlePhotoWrap: {
    width: '55%',
  },
  singlePhoto: {
    aspectRatio: 3 / 4,
    borderRadius: 14,
    borderCurve: 'continuous',
    width: '100%',
    backgroundColor: C.bg,
  },
  photoStrip: {
    gap: 9,
    marginTop: 14,
    paddingRight: 8,
  },
  photoThumbWrap: {
    width: 84,
  },
  photoThumb: {
    width: 84,
    height: 112,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: C.surface,
  },
  photoThumbDate: {
    fontFamily: F.body,
    fontSize: 11,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: 5,
  },

  // Coach note
  coachRow: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
  },
  coachAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#2A3320',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachAvatarText: {
    fontFamily: F.bodyBold,
    fontSize: 13.5,
    color: C.accent,
  },
  coachMeta: {
    fontFamily: F.body,
    fontSize: 14,
    color: C.textMuted,
  },
  coachNote: {
    fontFamily: F.body,
    fontSize: 14.5,
    color: C.textPrimary,
    lineHeight: 22,
    marginTop: 4,
  },

  // Check-in history
  checkinRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    marginBottom: 9,
  },
  checkinWeek: {
    fontFamily: F.bodySemiBold,
    fontSize: 15,
    color: C.textPrimary,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  ratingPill: {
    flexDirection: 'row',
    gap: 5,
    backgroundColor: C.bg,
    borderRadius: 8,
    borderCurve: 'continuous',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingLabel: {
    fontFamily: F.body,
    fontSize: 12.5,
    color: C.textMuted,
  },
  ratingValue: {
    fontFamily: F.bodySemiBold,
    fontSize: 12.5,
    color: C.textSecondary,
  },
  checkinNote: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    marginTop: 8,
    lineHeight: 19,
  },
  repliedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderCurve: 'continuous',
    backgroundColor: C.accent,
    marginTop: 5,
  },

  // Photo viewer
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,11,9,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.4,
  },
  viewerClose: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
