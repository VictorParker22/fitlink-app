/**
 * app/session/complete.tsx — Post-Session Summary
 *
 * Shows what happened in a finished session, saves coach notes, and
 * surfaces a single next-session recommendation. Two entry points:
 *
 *   A) Active tracker → setCompletionData() → router.push('/session/complete?sessionId=X')
 *      Exercise-level data is available (sets/reps/weight per exercise).
 *   B) Schedule "Complete" button → router.push('/session/complete?sessionId=X')
 *      No exercise data — just session info, notes, and the recommendation.
 *
 * The headline leads with what changed since the client's last session
 * (duration delta) rather than an inflated score. "Adherence" (the
 * honest name for percentage of prescribed sets completed) is shown as
 * one modest stat among others — not a dressed-up hero number.
 *
 * Design: fixed dark coach palette (constants/coachDesign.ts), single
 * lime accent, no emoji.
 */

import React, {
  useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import Avatar from '../../components/Avatar';
import {
  getCompletionData,
  clearCompletionData,
  type CompletedExercise,
} from './sessionCompletionCache';

const { width: W } = Dimensions.get('window');

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatVolume(lbs: number): string {
  if (lbs >= 1000) return `${(lbs / 1000).toFixed(1)}k`;
  return lbs.toLocaleString();
}

/** Extract unique muscle groups from exercises */
function getMuscleGroups(exercises: CompletedExercise[]): string[] {
  const seen = new Set<string>();
  exercises.forEach(ex => {
    if (ex.muscleGroup) ex.muscleGroup.split(',').map(m => m.trim()).forEach(m => seen.add(m));
  });
  return Array.from(seen).filter(Boolean).slice(0, 8);
}

/** Given muscle groups hit, suggest a complementary session type */
function suggestNextType(muscleGroups: string[], lastType: string): string {
  const upper = ['chest','shoulders','arms','triceps','biceps','back','lats','traps','delts'];
  const lower = ['legs','quads','hamstrings','glutes','calves','hip flexors'];
  const core  = ['core','abs','obliques'];

  const lower_mg = muscleGroups.map(m => m.toLowerCase());
  const hitUpper = lower_mg.some(m => upper.some(u => m.includes(u)));
  const hitLower = lower_mg.some(m => lower.some(u => m.includes(u)));
  const hitCore  = lower_mg.some(m => core.some(u => m.includes(u)));

  if (hitUpper && !hitLower) return 'Lower body';
  if (hitLower && !hitUpper) return 'Upper body';
  if (hitCore)  return 'Strength & conditioning';
  return lastType || '1-on-1';
}

/** Recommend next date based on session history frequency */
function suggestNextDate(completedSessions: any[]): Date {
  const now = new Date();
  if (completedSessions.length < 2) {
    const d = new Date(now);
    d.setDate(d.getDate() + 3);
    return d;
  }
  const sorted = [...completedSessions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);
  let totalGap = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const diff = new Date(sorted[i].date).getTime() - new Date(sorted[i + 1].date).getTime();
    totalGap += diff;
  }
  const avgGapMs = totalGap / (sorted.length - 1);
  const avgGapDays = Math.max(1, Math.min(14, Math.round(avgGapMs / 86400000)));
  const next = new Date(now);
  next.setDate(now.getDate() + avgGapDays);
  return next;
}

/** Percentage of prescribed sets actually completed (renamed from "performance score") */
function calcAdherence(exercises: CompletedExercise[]): number {
  if (!exercises.length) return 0;
  const totalSets     = exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const completedSets = exercises.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0);
  if (totalSets === 0) return 0;
  return Math.round((completedSets / totalSets) * 100);
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatTile({ value, label, delay = 0 }: { value: string; label: string; delay?: number }) {
  const reduced    = useReducedMotion();
  const opacity    = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : 10);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value    = withDelay(delay, withTiming(1, { duration: 350 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 220 }));
  }, [reduced]);

  const aStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[st.statTile, aStyle]}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue}>{value}</Text>
    </Animated.View>
  );
}

/** Animated horizontal fill bar for exercise breakdown */
function ExerciseBar({
  exercise, index,
}: { exercise: CompletedExercise; index: number }) {
  const completedSets = exercise.sets.filter(s => s.completed).length;
  const totalSets     = exercise.sets.length;
  const pct           = totalSets > 0 ? completedSets / totalSets : 0;
  const reduced        = useReducedMotion();
  const barWidth       = useSharedValue(reduced ? pct : 0);
  const opacity        = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      barWidth.value = pct;
      return;
    }
    const delay = 500 + index * 90;
    opacity.value  = withDelay(delay, withTiming(1, { duration: 280 }));
    barWidth.value = withDelay(delay, withSpring(pct, { damping: 18, stiffness: 120 }));
  }, [reduced]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as any,
  }));

  const rowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Weight for the heaviest completed set on this exercise (real data, no comparison claimed)
  const topWeight = exercise.sets.reduce((max, s) => {
    if (!s.completed) return max;
    const w = parseFloat(s.weight) || 0;
    return w > max ? w : max;
  }, 0);

  const isPartial = pct < 1;
  const barColor  = isPartial ? CoachColors.warning : CoachColors.accent;

  return (
    <Animated.View style={[st.exRow, rowStyle]}>
      <View style={st.exInfo}>
        <Text style={st.exName} numberOfLines={1}>{exercise.exerciseName}</Text>
        <Text style={[st.exMeta, isPartial && st.exMetaWarning]}>
          {completedSets}/{totalSets} sets
          {topWeight > 0 ? `  ·  ${topWeight}kg` : ''}
        </Text>
      </View>
      <View style={st.exBarTrack}>
        <Animated.View style={[st.exBarFill, { backgroundColor: barColor }, barStyle]} />
      </View>
      {!isPartial && (
        <Ionicons name="checkmark" size={14} color={CoachColors.accent} style={st.exCheck} />
      )}
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SessionCompleteScreen() {
  const router                   = useRouter();
  const reduced                  = useReducedMotion();
  const { sessionId }            = useLocalSearchParams<{ sessionId: string }>();
  const { sessions, getClientById, getClientSessions, updateSession } = useApp();

  // Pull exercise data from cache (set by tracker, null if from schedule)
  const completionData = useRef(getCompletionData()).current;
  useEffect(() => { clearCompletionData(); }, []);

  const session = useMemo(
    () => sessions.find(s => s.id === sessionId),
    [sessions, sessionId],
  );
  const client = useMemo(
    () => (session?.client_id ? getClientById(session.client_id) : null),
    [session, getClientById],
  );
  const clientSessions = useMemo(
    () => (session?.client_id ? getClientSessions(session.client_id) : []),
    [session, getClientSessions],
  );

  const [notes,    setNotes]    = useState(session?.notes || '');
  const [saving,   setSaving]   = useState(false);
  const [noteSaved,setNoteSaved]= useState(false);

  // ── Derived metrics ──
  const exercises   = completionData?.exercises ?? [];
  const durationSec = completionData?.durationSeconds ?? (session ? session.duration * 60 : 0);

  const totalSets     = exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const completedSets = exercises.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0);
  const totalVolume   = exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s2, st) =>
      st.completed ? s2 + (parseFloat(st.weight) || 0) * (parseInt(st.reps) || 0) : s2, 0), 0);
  const adherence     = calcAdherence(exercises);
  const muscleGroups  = getMuscleGroups(exercises);

  const hasExerciseData = exercises.length > 0;
  const firstName = (client?.name ?? '').split(' ')[0] || 'This client';

  // ── Completed sessions for this client (for "what changed" + recommendation) ──
  const completedClientSessions = useMemo(
    () => clientSessions.filter(s => s.status === 'completed'),
    [clientSessions],
  );
  // Most recent completed session *before* this one, so we can compare honestly —
  // only session-level fields (duration) are persisted across sessions; per-exercise
  // weight history is not, so no PR/volume comparison is claimed.
  const previousSession = useMemo(() => {
    const prior = completedClientSessions
      .filter(s => s.id !== session?.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return prior[0] ?? null;
  }, [completedClientSessions, session]);

  const { headline, subline } = useMemo(() => {
    if (hasExerciseData) {
      const title = `${firstName} completed ${completedSets} of ${totalSets} sets.`;
      if (!previousSession) {
        return { headline: title, subline: `First tracked session with ${firstName}.` };
      }
      const thisMin = Math.round(durationSec / 60);
      const delta   = thisMin - previousSession.duration;
      const sub = delta === 0
        ? `Same length as last time — ${formatDuration(durationSec)}.`
        : `${Math.abs(delta)} min ${delta > 0 ? 'longer' : 'shorter'} than last time.`;
      return { headline: title, subline: sub };
    }
    const n = completedClientSessions.length;
    return {
      headline: `Session ${n} with ${firstName}, logged.`,
      subline: 'Nothing was tracked in the app for this one — add a note while it\'s fresh.',
    };
  }, [hasExerciseData, firstName, completedSets, totalSets, previousSession, durationSec, completedClientSessions.length]);

  // ── "What's Next" recommendation ──
  const nextDate    = useMemo(() => suggestNextDate(completedClientSessions), [completedClientSessions]);
  const nextType    = useMemo(() => suggestNextType(muscleGroups, session?.type ?? '1-on-1'), [muscleGroups, session]);
  const freqDays    = completedClientSessions.length >= 2
    ? Math.round((
        new Date(completedClientSessions[0].date).getTime() -
        new Date(completedClientSessions[Math.min(5, completedClientSessions.length - 1)].date).getTime()
      ) / (86400000 * Math.min(5, completedClientSessions.length - 1)))
    : 3;

  // ── Date of this session ──
  const sessionDateLabel = session
    ? new Date(session.date).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
    : '';

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Mark session as completed if not already
    if (session && session.status !== 'completed') {
      updateSession(session.id, { status: 'completed' }).catch(() => {});
    }
  }, []);

  // ── Save notes on blur ──
  const handleNotesSave = useCallback(async () => {
    if (!session || notes === session.notes) return;
    setSaving(true);
    try {
      await updateSession(session.id, { notes: notes.trim() });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } catch {}
    finally { setSaving(false); }
  }, [session, notes, updateSession]);

  // ── Book next session ──
  const handleBookNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const params = new URLSearchParams({
      date:     nextDate.toISOString(),
      type:     session?.type ?? '1-on-1',
      clientId: session?.client_id ?? '',   // camelCase — matches book-session.tsx useLocalSearchParams
    });
    router.push(`/book-session?${params.toString()}` as any);
  }, [nextDate, session, router]);

  const handleDone = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  if (!session) {
    return (
      <SafeAreaView style={st.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={st.emptyText}>Session not found</Text>
          <TouchableOpacity onPress={handleDone} style={st.doneBtn}>
            <Text style={st.doneBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={st.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── HERO HEADER ─────────────────────────────────────── */}
            <Animated.View entering={reduced ? undefined : FadeIn.duration(350)} style={st.hero}>
              {/* Client row */}
              <View style={st.clientRow}>
                {client && (
                  <Avatar name={client.name} size="md" imageUrl={client.avatar_url} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={st.heroName} numberOfLines={1}>
                    {client?.name ?? session.group_name ?? 'Session'}
                  </Text>
                  <Text style={st.heroMeta}>
                    {sessionDateLabel} · {session.type} · {session.duration} min
                  </Text>
                </View>
                <View style={st.completedBadge}>
                  <Text style={st.completedBadgeText}>{hasExerciseData ? 'Logged' : 'Done'}</Text>
                </View>
              </View>

              {/* Headline: what changed since last time */}
              <Text style={st.headline}>{headline}</Text>
              <Text style={st.subline}>{subline}</Text>
            </Animated.View>

            {/* ── STATS ROW ──────────────────────────────────────── */}
            {hasExerciseData && (
              <View style={st.statsRow}>
                <StatTile value={formatDuration(durationSec)} label="Duration" delay={80} />
                <StatTile value={`${completedSets}/${totalSets}`} label="Sets done" delay={140} />
                {totalVolume > 0 && (
                  <StatTile value={`${formatVolume(totalVolume)}`} label="Volume (kg)" delay={200} />
                )}
                <StatTile value={`${adherence}%`} label="Adherence" delay={260} />
              </View>
            )}

            {/* ── EXERCISE BREAKDOWN ─────────────────────────────── */}
            {hasExerciseData && (
              <Animated.View entering={reduced ? undefined : FadeInUp.delay(350).duration(300)} style={st.card}>
                <Text style={st.cardTag}>What she did</Text>
                <Text style={st.cardTitle}>Exercise breakdown</Text>
                <View style={st.exList}>
                  {exercises.map((ex, i) => (
                    <ExerciseBar key={i} exercise={ex} index={i} />
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ── MUSCLE GROUPS ──────────────────────────────────── */}
            {muscleGroups.length > 0 && (
              <Animated.View entering={reduced ? undefined : FadeInUp.delay(420).duration(300)} style={st.card}>
                <Text style={st.cardTag}>Muscles targeted</Text>
                <View style={st.muscleChips}>
                  {muscleGroups.map((m, i) => (
                    <View key={i} style={st.muscleChip}>
                      <Text style={st.muscleChipText}>{m}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>
            )}

            {/* ── COACH NOTES ────────────────────────────────────── */}
            <Animated.View entering={reduced ? undefined : FadeInUp.delay(480).duration(300)} style={st.card}>
              <View style={st.cardTitleRow}>
                <Text style={st.cardTag}>Your note</Text>
                {noteSaved && <Text style={st.savedText}>Saved</Text>}
              </View>
              <TextInput
                style={st.notesInput}
                value={notes}
                onChangeText={setNotes}
                onBlur={handleNotesSave}
                placeholder="What you covered, what to change next time…"
                placeholderTextColor={CoachColors.textFaint}
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                accessibilityLabel="Coach session notes"
              />
            </Animated.View>

            {/* ── WHAT'S NEXT ────────────────────────────────────── */}
            <Animated.View entering={reduced ? undefined : FadeInUp.delay(540).duration(300)} style={[st.card, st.nextCard]}>
              <Text style={st.cardTag}>Next session</Text>
              <Text style={st.cardTitle}>
                {DAY_FULL[nextDate.getDay()]}, {nextType.toLowerCase()}
              </Text>
              <Text style={st.nextDesc}>
                Trains every {freqDays} {freqDays === 1 ? 'day' : 'days'} on average · suggested{' '}
                {DAY_FULL[nextDate.getDay()]}, {MONTH_SHORT[nextDate.getMonth()]} {nextDate.getDate()}
              </Text>

              <TouchableOpacity
                style={st.bookCTA}
                onPress={handleBookNext}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Book next session"
              >
                <Text style={st.bookCTAText}>
                  Book {DAY_FULL[nextDate.getDay()]} {MONTH_SHORT[nextDate.getMonth()]} {nextDate.getDate()}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            {/* ── DONE ────────────────────────────────────────────── */}
            <Animated.View
              entering={reduced ? undefined : FadeInUp.delay(600).duration(280)}
              style={st.doneRow}
            >
              <TouchableOpacity
                onPress={handleDone}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Close summary"
              >
                <Text style={st.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </Animated.View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: CoachColors.bg,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  emptyText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize:   W * 0.04,
    color:      CoachColors.textSecondary,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: 20,
    paddingTop:        W * 0.14,
    paddingBottom:     0,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginBottom:  24,
  },
  heroName: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      18,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.4,
  },
  heroMeta: {
    fontFamily: CoachFonts.body,
    fontSize:   12,
    color:      CoachColors.textMuted,
    marginTop:  1,
  },
  completedBadge: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      999,
    borderWidth:        1,
    borderColor:        'rgba(198,242,78,0.35)',
  },
  completedBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   11,
    color:      CoachColors.accent,
  },
  headline: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      26,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.5,
    lineHeight:    32,
  },
  subline: {
    fontFamily: CoachFonts.body,
    fontSize:   13.5,
    color:      CoachColors.textSecondary,
    marginTop:  9,
    lineHeight: 19,
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection:     'row',
    paddingHorizontal: 20,
    gap:               10,
    marginTop:         20,
  },
  statTile: {
    flex:            1,
    backgroundColor: CoachColors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
    padding:         12,
  },
  statLabel: {
    fontFamily: CoachFonts.body,
    fontSize:   11,
    color:      CoachColors.textMuted,
  },
  statValue: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      17,
    color:         CoachColors.textPrimary,
    marginTop:     2,
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: 20,
    marginTop:        24,
    backgroundColor:  CoachColors.surface,
    borderRadius:     14,
    borderWidth:      1,
    borderColor:      CoachColors.borderMuted,
    padding:          15,
  },
  nextCard: {
    borderColor:     CoachColors.border,
  },
  cardTag: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize:      11,
    color:         CoachColors.textFaint,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  cardTitleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      16,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.3,
    marginTop:     6,
    marginBottom:  14,
  },

  // ── Exercise bars ─────────────────────────────────────────────────────────
  exList: { gap: 13, marginTop: 14 },
  exRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           11,
  },
  exInfo: { width: W * 0.3 },
  exName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   13,
    color:      CoachColors.textPrimary,
  },
  exMeta: {
    fontFamily: CoachFonts.body,
    fontSize:   11,
    color:      CoachColors.textMuted,
    marginTop:  1,
  },
  exMetaWarning: {
    color: CoachColors.warning,
  },
  exBarTrack: {
    flex:            1,
    height:          6,
    backgroundColor: CoachColors.borderMuted,
    borderRadius:    3,
    overflow:        'hidden',
  },
  exBarFill: {
    height:       '100%',
    borderRadius: 3,
  },
  exCheck: { marginLeft: 2 },

  // ── Muscle chips ──────────────────────────────────────────────────────────
  muscleChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           7,
    marginTop:     11,
  },
  muscleChip: {
    paddingHorizontal: 11,
    paddingVertical:   5,
    borderRadius:      999,
    borderWidth:       1,
    borderColor:       CoachColors.borderMuted,
  },
  muscleChipText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   11.5,
    color:      CoachColors.textSecondary,
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  savedText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   11,
    color:      CoachColors.accent,
  },
  notesInput: {
    backgroundColor: CoachColors.bg,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
    padding:         13,
    marginTop:       9,
    fontFamily:      CoachFonts.body,
    fontSize:        14,
    color:           CoachColors.textPrimary,
    minHeight:       84,
    lineHeight:      20,
  },

  // ── What's Next ───────────────────────────────────────────────────────────
  nextDesc: {
    fontFamily: CoachFonts.body,
    fontSize:   12.5,
    color:      CoachColors.textSecondary,
    marginTop:  -8,
    marginBottom: 15,
    lineHeight: 18,
  },
  bookCTA: {
    backgroundColor: CoachColors.accent,
    borderRadius:    999,
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 14,
    minHeight:       50,
  },
  bookCTAText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   14,
    color:      CoachColors.onAccent,
  },

  // ── Done ──────────────────────────────────────────────────────────────────
  doneRow: {
    alignItems: 'center',
    marginTop:  22,
    marginBottom: 8,
  },
  doneBtn: {
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  doneBtnText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   13.5,
    color:      CoachColors.textMuted,
  },
});
