/**
 * app/session/complete.tsx — Post-Session Smart Summary
 *
 * Tonal-inspired session completion screen that:
 *   1. Shows session stats (duration, sets, volume, completion %)
 *   2. Renders a per-exercise breakdown with animated fill bars
 *   3. Chips for muscle groups targeted
 *   4. Coach notes auto-saved on blur (no save button needed)
 *   5. "What's Next" recommendation engine:
 *      - Calculates avg session frequency from client history
 *      - Suggests next date based on frequency
 *      - Suggests complementary session type from muscles targeted
 *      - "Book Next Session" pre-fills book-session.tsx
 *   6. Confetti burst on mount (particles via Reanimated)
 *
 * Entry points:
 *   A) Active tracker → setCompletionData() → router.push('/session/complete?sessionId=X')
 *   B) Schedule "Complete" button → router.push('/session/complete?sessionId=X')
 *      (no exercise data; shows session info + notes + recommendation only)
 *
 * Design: #0D0D12 bg, #C8F135 lime, SpaceGrotesk + Epilogue, W*factor sizing
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
  interpolate,
  Extrapolation,
  FadeIn,
  FadeInUp,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { FontFamily } from '../../constants/theme';
import Avatar from '../../components/Avatar';
import {
  getCompletionData,
  clearCompletionData,
  type CompletedExercise,
} from './sessionCompletionCache';

const { width: W, height: H } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  value: string | number;
  label: string;
  icon: string;
  color: string;
  delay?: number;
}

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

  if (hitUpper && !hitLower) return 'Lower Body';
  if (hitLower && !hitUpper) return 'Upper Body';
  if (hitCore)  return 'Strength & Conditioning';
  return lastType || '1-on-1';
}

/** Recommend next date based on session history frequency */
function suggestNextDate(completedSessions: any[]): Date {
  const now = new Date();
  if (completedSessions.length < 2) {
    // Default: 3 days from now
    const d = new Date(now);
    d.setDate(d.getDate() + 3);
    return d;
  }
  // Average gap between the last 6 sessions
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

/** Calculate performance score 0–100 */
function calcScore(exercises: CompletedExercise[]): number {
  if (!exercises.length) return 0;
  const totalSets     = exercises.reduce((s, ex) => s + ex.sets.length, 0);
  const completedSets = exercises.reduce((s, ex) => s + ex.sets.filter(st => st.completed).length, 0);
  if (totalSets === 0) return 0;
  return Math.round((completedSets / totalSets) * 100);
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ value, label, icon, color, delay = 0 }: StatCardProps) {
  const opacity   = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    opacity.value    = withDelay(delay, withTiming(1, { duration: 400 }));
    translateY.value = withDelay(delay, withSpring(0, { damping: 18, stiffness: 220 }));
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[st.statCard, aStyle]}>
      <View style={[st.statIconBg, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
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
  const barWidth      = useSharedValue(0);
  const opacity       = useSharedValue(0);

  useEffect(() => {
    const delay = 600 + index * 100;
    opacity.value  = withDelay(delay, withTiming(1, { duration: 300 }));
    barWidth.value = withDelay(delay, withSpring(pct, { damping: 18, stiffness: 120 }));
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${barWidth.value * 100}%` as any,
  }));

  const rowStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Volume for this exercise
  const vol = exercise.sets.reduce((sum, s) => {
    if (!s.completed) return sum;
    return sum + (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
  }, 0);

  const color = pct >= 1 ? '#22C55E' : pct >= 0.6 ? '#C8F135' : '#F59E0B';

  return (
    <Animated.View style={[st.exRow, rowStyle]}>
      <View style={st.exInfo}>
        <Text style={st.exName} numberOfLines={1}>{exercise.exerciseName}</Text>
        <Text style={st.exMeta}>
          {completedSets}/{totalSets} sets
          {vol > 0 ? `  ·  ${formatVolume(vol)} lbs` : ''}
        </Text>
      </View>
      <View style={st.exBarTrack}>
        <Animated.View style={[st.exBarFill, { backgroundColor: color }, barStyle]} />
      </View>
      {pct >= 1 && (
        <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={st.exCheck} />
      )}
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SessionCompleteScreen() {
  const router                   = useRouter();
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
  const score         = calcScore(exercises);
  const muscleGroups  = getMuscleGroups(exercises);

  // ── "What's Next" recommendation ──
  const completedClientSessions = useMemo(
    () => clientSessions.filter(s => s.status === 'completed'),
    [clientSessions],
  );
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

  // ── Hero score animation ──
  const scoreAnim = useSharedValue(0);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    scoreAnim.value = withDelay(300, withSpring(score, { damping: 18, stiffness: 80 }));
    // Mark session as completed if not already
    if (session && session.status !== 'completed') {
      updateSession(session.id, { status: 'completed' }).catch(() => {});
    }
  }, []);

  const scoreStyle = useAnimatedStyle(() => ({
    opacity:   interpolate(scoreAnim.value, [0, 20], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(scoreAnim.value, [0, score], [0.6, 1], Extrapolation.CLAMP) }],
  }));

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
            <Text style={st.doneBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const hasExerciseData = exercises.length > 0;
  const completionPct   = totalSets > 0 ? Math.round(completedSets / totalSets * 100) : 0;

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={['#0D0D12', '#111118', '#0A0A0F']}
        style={StyleSheet.absoluteFill}
      />

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
            <Animated.View entering={FadeIn.duration(400)}>
              <LinearGradient
                colors={['#1A2800', '#0D0D12']}
                style={st.hero}
              >
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
                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                    <Text style={st.completedBadgeText}>Done</Text>
                  </View>
                </View>

                {/* Score */}
                {hasExerciseData && (
                  <Animated.View style={[st.scoreBlock, scoreStyle]}>
                    <Text style={st.scoreNumber}>{score}</Text>
                    <Text style={st.scoreLabel}>PERFORMANCE SCORE</Text>
                    <Text style={st.scoreDesc}>
                      {score >= 90 ? 'Perfect execution 🔥' :
                       score >= 70 ? 'Strong session 💪' :
                       score >= 50 ? 'Good effort 👍' : 'Keep pushing 🎯'}
                    </Text>
                  </Animated.View>
                )}
              </LinearGradient>
            </Animated.View>

            {/* ── STATS ROW ──────────────────────────────────────── */}
            <View style={st.statsRow}>
              <StatCard
                value={formatDuration(durationSec)}
                label="Duration"
                icon="time-outline"
                color="#60A5FA"
                delay={100}
              />
              {hasExerciseData && (
                <>
                  <StatCard
                    value={`${completedSets}/${totalSets}`}
                    label="Sets"
                    icon="barbell-outline"
                    color="#C8F135"
                    delay={180}
                  />
                  <StatCard
                    value={exercises.length.toString()}
                    label="Exercises"
                    icon="body-outline"
                    color="#A78BFA"
                    delay={260}
                  />
                  <StatCard
                    value={`${completionPct}%`}
                    label="Completion"
                    icon="trending-up-outline"
                    color="#22C55E"
                    delay={340}
                  />
                </>
              )}
              {!hasExerciseData && totalVolume === 0 && (
                <StatCard
                  value={`${completedClientSessions.length}`}
                  label="Total Sessions"
                  icon="calendar-outline"
                  color="#C8F135"
                  delay={180}
                />
              )}
            </View>

            {/* ── EXERCISE BREAKDOWN ─────────────────────────────── */}
            {hasExerciseData && (
              <Animated.View entering={FadeInUp.delay(400).duration(350)} style={st.card}>
                <Text style={st.cardTag}>WHAT YOU ACCOMPLISHED</Text>
                <Text style={st.cardTitle}>Exercise Breakdown</Text>
                <View style={st.exList}>
                  {exercises.map((ex, i) => (
                    <ExerciseBar key={i} exercise={ex} index={i} />
                  ))}
                </View>

                {/* Total volume */}
                {totalVolume > 0 && (
                  <View style={st.volumeRow}>
                    <View>
                      <Text style={st.volumeLabel}>Total Volume</Text>
                      <Text style={st.volumeValue}>{formatVolume(totalVolume)} lbs</Text>
                    </View>
                    <View style={[st.volumeBadge, { backgroundColor: 'rgba(200,241,53,0.1)', borderColor: 'rgba(200,241,53,0.2)' }]}>
                      <Ionicons name="trending-up" size={13} color="#C8F135" />
                      <Text style={st.volumeBadgeText}>Tracked</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}

            {/* ── MUSCLE GROUPS ──────────────────────────────────── */}
            {muscleGroups.length > 0 && (
              <Animated.View entering={FadeInUp.delay(500).duration(350)} style={st.card}>
                <Text style={st.cardTag}>MUSCLES TARGETED</Text>
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
            <Animated.View entering={FadeInUp.delay(560).duration(350)} style={st.card}>
              <View style={st.cardTitleRow}>
                <Text style={st.cardTag}>COACH NOTES</Text>
                {noteSaved && (
                  <View style={st.savedPill}>
                    <Ionicons name="checkmark" size={10} color="#22C55E" />
                    <Text style={st.savedText}>Saved</Text>
                  </View>
                )}
              </View>
              <Text style={st.cardTitle}>Post-Session Summary</Text>
              <TextInput
                style={st.notesInput}
                value={notes}
                onChangeText={setNotes}
                onBlur={handleNotesSave}
                placeholder="Record observations, areas to improve, weight adjustments for next session…"
                placeholderTextColor="rgba(255,255,255,0.22)"
                multiline
                textAlignVertical="top"
                returnKeyType="default"
                accessibilityLabel="Coach session notes"
              />
            </Animated.View>

            {/* ── WHAT'S NEXT ────────────────────────────────────── */}
            <Animated.View entering={FadeInUp.delay(640).duration(350)} style={[st.card, st.nextCard]}>
              <Text style={st.cardTag}>WHAT'S NEXT</Text>
              <Text style={st.cardTitle}>Recommended Next Session</Text>

              <View style={st.nextBody}>
                {/* Recommended date */}
                <View style={st.nextRow}>
                  <View style={[st.nextIconBg, { backgroundColor: 'rgba(200,241,53,0.12)' }]}>
                    <Ionicons name="calendar" size={16} color="#C8F135" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.nextRowLabel}>Suggested date</Text>
                    <Text style={st.nextRowValue}>
                      {DAY_FULL[nextDate.getDay()]}, {MONTH_SHORT[nextDate.getMonth()]} {nextDate.getDate()}
                    </Text>
                  </View>
                </View>

                {/* Session type */}
                <View style={st.nextRow}>
                  <View style={[st.nextIconBg, { backgroundColor: 'rgba(167,139,250,0.12)' }]}>
                    <Ionicons name="fitness" size={16} color="#A78BFA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.nextRowLabel}>Session focus</Text>
                    <Text style={st.nextRowValue}>{nextType}</Text>
                  </View>
                </View>

                {/* Frequency insight */}
                <View style={st.nextRow}>
                  <View style={[st.nextIconBg, { backgroundColor: 'rgba(96,165,250,0.12)' }]}>
                    <Ionicons name="repeat" size={16} color="#60A5FA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.nextRowLabel}>Training frequency</Text>
                    <Text style={st.nextRowValue}>
                      Every {freqDays} {freqDays === 1 ? 'day' : 'days'} based on history
                    </Text>
                  </View>
                </View>

                {/* Client motivation copy */}
                {client && (
                  <View style={st.motivationBlock}>
                    <Ionicons name="sparkles" size={13} color="#F59E0B" />
                    <Text style={st.motivationText}>
                      {client.name} has trained {completedClientSessions.length} session
                      {completedClientSessions.length !== 1 ? 's' : ''} with you.
                      {completedClientSessions.length >= 5
                        ? ' Consistency is building — keep the momentum going.'
                        : ' Early progress is real — book the next one now.'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Book CTA */}
              <TouchableOpacity
                style={st.bookCTA}
                onPress={handleBookNext}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Book next session"
              >
                <LinearGradient
                  colors={['#C8F135', '#A8D420']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={st.bookCTAGradient}
                >
                  <Ionicons name="add-circle" size={18} color="#0D0D12" />
                  <Text style={st.bookCTAText}>Book Next Session</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* ── DONE BUTTON ────────────────────────────────────── */}
            <Animated.View
              entering={FadeInUp.delay(700).duration(300)}
              style={st.doneRow}
            >
              <TouchableOpacity
                style={st.doneBtn}
                onPress={handleDone}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Done, close summary"
              >
                <Text style={st.doneBtnText}>Done</Text>
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
    backgroundColor: '#0D0D12',
  },
  scrollContent: {
    paddingBottom: 60,
  },
  emptyText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize:   W * 0.04,
    color:      'rgba(255,255,255,0.5)',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    paddingHorizontal: W * 0.05,
    paddingTop:        W * 0.06,
    paddingBottom:     W * 0.07,
    marginBottom:      2,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginBottom:  W * 0.05,
  },
  heroName: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.052,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroMeta: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.032,
    color:      'rgba(255,255,255,0.45)',
    marginTop:  2,
  },
  completedBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            4,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:   20,
    backgroundColor:'rgba(34,197,94,0.12)',
    borderWidth:    1,
    borderColor:    'rgba(34,197,94,0.25)',
  },
  completedBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.03,
    color:      '#22C55E',
  },
  scoreBlock: {
    alignItems: 'center',
    paddingTop: 8,
  },
  scoreNumber: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.22,
    color:         '#FFFFFF',
    letterSpacing: -4,
    lineHeight:    W * 0.24,
  },
  scoreLabel: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      W * 0.028,
    color:         'rgba(255,255,255,0.35)',
    letterSpacing: 2.5,
    marginTop:     4,
    marginBottom:  8,
  },
  scoreDesc: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.038,
    color:      '#C8F135',
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection:     'row',
    paddingHorizontal: W * 0.04,
    gap:               8,
    marginTop:         W * 0.04,
    marginBottom:      W * 0.02,
  },
  statCard: {
    flex:            1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    padding:         10,
    alignItems:      'center',
    gap:             4,
  },
  statIconBg: {
    width:          28,
    height:         28,
    borderRadius:   9,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   2,
  },
  statValue: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.042,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
    textAlign:     'center',
  },
  statLabel: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.026,
    color:      'rgba(255,255,255,0.38)',
    textAlign:  'center',
  },

  // ── Cards ─────────────────────────────────────────────────────────────────
  card: {
    marginHorizontal: W * 0.04,
    marginTop:        W * 0.035,
    backgroundColor:  '#111118',
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.08)',
    padding:          W * 0.05,
  },
  nextCard: {
    borderColor: 'rgba(200,241,53,0.2)',
    backgroundColor: 'rgba(200,241,53,0.03)',
  },
  cardTag: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      W * 0.026,
    color:         'rgba(255,255,255,0.35)',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom:  4,
  },
  cardTitleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   4,
  },
  cardTitle: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.048,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom:  W * 0.04,
  },

  // ── Exercise bars ─────────────────────────────────────────────────────────
  exList: { gap: 14 },
  exRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  exInfo: { width: W * 0.34 },
  exName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.033,
    color:      '#FFFFFF',
  },
  exMeta: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.028,
    color:      'rgba(255,255,255,0.38)',
    marginTop:  2,
  },
  exBarTrack: {
    flex:            1,
    height:          6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius:    3,
    overflow:        'hidden',
  },
  exBarFill: {
    height:       '100%',
    borderRadius: 3,
  },
  exCheck: { marginLeft: 4 },

  // ── Volume ────────────────────────────────────────────────────────────────
  volumeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      W * 0.04,
    paddingTop:     W * 0.04,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  volumeLabel: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.03,
    color:      'rgba(255,255,255,0.4)',
  },
  volumeValue: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.048,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
    marginTop:     2,
  },
  volumeBadge: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:  20,
    borderWidth:   1,
  },
  volumeBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.03,
    color:      '#C8F135',
  },

  // ── Muscle chips ──────────────────────────────────────────────────────────
  muscleChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  muscleChip: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
    backgroundColor:   'rgba(167,139,250,0.12)',
    borderWidth:       1,
    borderColor:       'rgba(167,139,250,0.25)',
  },
  muscleChipText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.032,
    color:      '#A78BFA',
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  savedPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:  20,
    backgroundColor:'rgba(34,197,94,0.1)',
  },
  savedText: {
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.026,
    color:      '#22C55E',
  },
  notesInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    padding:         14,
    fontFamily:      FontFamily.body,
    fontSize:        W * 0.035,
    color:           '#FFFFFF',
    minHeight:       100,
    lineHeight:      W * 0.052,
  },

  // ── What's Next ───────────────────────────────────────────────────────────
  nextBody: { gap: 14, marginBottom: W * 0.04 },
  nextRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  nextIconBg: {
    width:          38,
    height:         38,
    borderRadius:   12,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  nextRowLabel: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.03,
    color:      'rgba(255,255,255,0.42)',
  },
  nextRowValue: {
    fontFamily:    FontFamily.headingSemiBold,
    fontSize:      W * 0.038,
    color:         '#FFFFFF',
    marginTop:     2,
    letterSpacing: -0.2,
  },
  motivationBlock: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    gap:            8,
    backgroundColor:'rgba(245,158,11,0.06)',
    borderRadius:   12,
    borderWidth:    1,
    borderColor:    'rgba(245,158,11,0.15)',
    padding:        12,
  },
  motivationText: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.032,
    color:      'rgba(255,255,255,0.6)',
    lineHeight: W * 0.048,
    flex:       1,
  },
  bookCTA: {
    borderRadius: 14,
    overflow:     'hidden',
  },
  bookCTAGradient: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical:15,
    minHeight:      52,
  },
  bookCTAText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize:   W * 0.042,
    color:      '#0D0D12',
    letterSpacing: -0.2,
  },

  // ── Done ──────────────────────────────────────────────────────────────────
  doneRow: {
    paddingHorizontal: W * 0.04,
    marginTop:         W * 0.04,
  },
  doneBtn: {
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 16,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    minHeight:       52,
  },
  doneBtnText: {
    fontFamily:    FontFamily.headingSemiBold,
    fontSize:      W * 0.04,
    color:         'rgba(255,255,255,0.7)',
    letterSpacing: -0.2,
  },
});
