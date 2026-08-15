/**
 * (client-tabs)/workouts.tsx — Train (design turn 25, "your season").
 *
 * The flagship season surface. When the athlete owns a pass: a SeasonHero
 * (pass name, real week-of-weeks, accent progress bar over the true track
 * position) above the full track rendered as an organized, labeled, tappable
 * journey grouped by week (components/client-tabs/season/). Past weeks
 * collapse to receipts, the current node gets the big "Up next" card, future
 * weeks are visible but quieter. Week math comes from lib/passWeeks.ts —
 * never re-derived here.
 *
 * The two workout sources are visually separated on purpose: "Your season"
 * (the enrollment track) vs "Extras from your coach" (one-off client_workouts
 * assignments), each labeled so the athlete always knows which is which.
 * Without a pass, the assignments list is the main surface plus a real
 * "Find your season" CTA into the pass storefront (my-pass).
 *
 * Contract preserved: Today pushes here with { startWorkoutId } and this
 * screen resolves it — into the WorkoutPreview, review-before-commit. The
 * ActiveWorkoutPlayer (and its timer) only exists after the explicit
 * "Start session" tap on the preview. completeTrackWorkout only ever fires
 * for the current node — done/ahead nodes open the preview view-only and
 * never advance the track. SeasonComplete and slip recovery unchanged.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 * Every number on this screen is real or omitted. All decorative motion is
 * gated behind lib/useReducedMotion.ts.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  ScrollView,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import { isOverdue, parseLocalDay } from '../../lib/streak';
import { useReducedMotion } from '../../lib/useReducedMotion';
import type { TrackNode } from '../../context/AppContext';

import ExploreDashboard from '../../components/client-tabs/explore/ExploreDashboard';
import ActiveWorkoutPlayer from '../../components/client-tabs/explore/ActiveWorkoutPlayer';
import WorkoutPreview from '../../components/client-tabs/explore/WorkoutPreview';
import WorkoutSummary from '../../components/client-tabs/explore/WorkoutSummary';
import SeasonComplete from '../../components/client-tabs/SeasonComplete';
import SeasonHero from '../../components/client-tabs/season/SeasonHero';
import SeasonTrack from '../../components/client-tabs/season/SeasonTrack';
import TrackStrip from '../../components/client-tabs/season/TrackStrip';
import MuscleMap from '../../components/anatomy/MuscleMap';
import {
  aggregateWorkoutMuscles,
  focusLineForWorkout,
  type WorkoutMuscleInfo,
} from '../../components/client-tabs/season/workoutMuscles';

const C = CoachColors;
const F = CoachFonts;

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

/**
 * Calendar label for a one-off assignment — honest here because
 * client_workouts really carry an assigned_date (unlike track nodes, which
 * are sequential and athlete-paced, never dated).
 */
function assignmentDayLabel(dateStr?: string): string | null {
  if (!dateStr) return null;
  const d = parseLocalDay(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Section header — eyebrow + one-line sub over a hairline, so the column reads as chapters. */
function SectionHead({ label, sub }: { label: string; sub?: string }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionHeadLabel}>{label}</Text>
      {sub ? <Text style={s.sectionHeadSub}>{sub}</Text> : null}
    </View>
  );
}

export default function ClientWorkoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const {
    trainer,
    clientData,
    workouts,
    enrollment,
    plans,
    conversation,
    completeWorkoutWithLog,
    completeTrackWorkout,
    rescheduleWorkoutToToday,
    refreshData,
  } = useClient();
  const params = useLocalSearchParams<{ view?: string; startWorkoutId?: string }>();

  // View: the programme is home; legacy explore kept reachable behind one row.
  const [showExplore, setShowExplore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Legacy explore state (unchanged wiring — see component comments there)
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchInput, setShowSearchInput] = useState(false);
  const [selectedCategoryLabel, setSelectedCategoryLabel] = useState<string | null>(null);
  const [selectedCoach, setSelectedCoach] = useState<any | null>(null);
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookingCoach, setBookingCoach] = useState<any | null>(null);
  const [dbTrainers, setDbTrainers] = useState<any[]>([]);

  // Active workout state. Setting activeWorkout only opens the PREVIEW —
  // the player (and its elapsed timer) exists only after the explicit
  // "Start session" tap flips sessionStarted.
  const [activeWorkout, setActiveWorkout] = useState<any | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // Deep links open the preview once; backing out must not re-open it when
  // the workouts list refreshes under the same params.
  const consumedStartIdRef = useRef<string | null>(null);
  const [summaryElapsedSeconds, setSummaryElapsedSeconds] = useState(0);
  const [summaryExerciseStates, setSummaryExerciseStates] = useState<any[]>([]);

  // Trainer's workout library — resolves track node ids into real sessions.
  const [trainerWorkouts, setTrainerWorkouts] = useState<any[]>([]);

  // Season finish (24a) — the enrollment snapshot at the moment the final
  // node was completed, so the receipt survives the refresh that follows.
  const [finishedSeason, setFinishedSeason] = useState<any | null>(null);
  // Conversation created here when the context has none yet.
  const [localConversation, setLocalConversation] = useState<any>(null);

  // ── startWorkoutId contract (Today depends on this — the param still
  // resolves the workout, but it now lands on the session PREVIEW instead of
  // auto-starting a timed session) ──
  useEffect(() => {
    if (params?.view === 'explore') setShowExplore(true);

    if (params?.startWorkoutId && consumedStartIdRef.current !== params.startWorkoutId) {
      consumedStartIdRef.current = params.startWorkoutId;
      const found = (workouts || []).find(
        (w: any) =>
          w.id === params.startWorkoutId ||
          w.workout_id === params.startWorkoutId ||
          w.workouts?.id === params.startWorkoutId
      );
      if (found) {
        setActiveWorkout(found);
      } else {
        supabase
          .from('workouts')
          .select('*, workout_exercises(*, exercises(*))')
          .eq('id', params.startWorkoutId)
          .single()
          .then(({ data }) => {
            if (data) {
              setActiveWorkout({
                id: `preview-${data.id}`,
                workout_id: data.id,
                workouts: data,
                status: 'assigned',
                source: enrollment?.status === 'active' ? 'track' : undefined,
              });
            }
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.view, params?.startWorkoutId, workouts]);

  // Trainer library (workout details for track nodes)
  useEffect(() => {
    if (!clientData?.trainer_id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('workouts')
        .select('*, workout_exercises(*, exercises(*))')
        .eq('trainer_id', clientData.trainer_id);
      if (alive && data) setTrainerWorkouts(data);
    })();
    return () => {
      alive = false;
    };
  }, [clientData?.trainer_id]);

  // Coach directory for legacy explore view
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('trainers').select('*');
        if (data && data.length > 0) setDbTrainers(data);
      } catch {}
    })();
  }, []);

  const allCoaches = useMemo(() => {
    const dbList = [...(dbTrainers || [])].map((t) => ({
      id: t.id,
      name: t.name || 'Coach',
      role: t.role || 'Elite Trainer',
      avatar: t.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      specialty: t.specializations?.join(', ') || 'Strength & Conditioning',
      bio: t.bio || 'Professional fitness coach dedicated to your progress.',
    }));
    const combined = [...dbList];
    if (trainer) {
      const idx = combined.findIndex(
        (c) => c.id === trainer.id || (c.name || '').toLowerCase() === (trainer.name || '').toLowerCase()
      );
      if (idx !== -1) {
        const [trainerObj] = combined.splice(idx, 1);
        trainerObj.role = 'Your Personal Coach';
        combined.unshift(trainerObj);
      } else {
        combined.unshift({
          id: trainer.id,
          name: trainer.name || 'Your Trainer',
          role: 'Your Personal Coach',
          avatar: trainer.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
          specialty: trainer.specializations?.join(', ') || 'Strength & Conditioning',
          bio: trainer.bio || 'Your dedicated coach for reaching health and fitness goals.',
        });
      }
    }
    return combined;
  }, [dbTrainers, trainer]);

  // ── The programme, derived from the enrollment snapshot ──────────────────
  const programme = useMemo(() => {
    if (!enrollment || (enrollment.status !== 'active' && enrollment.status !== 'completed')) return null;
    const track: TrackNode[] = Array.isArray(enrollment.track_snapshot)
      ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      : [];
    if (track.length === 0) return null;
    const plan = (plans || []).find((p: any) => p.id === enrollment.plan_id) || null;
    const durationWeeks = plan?.duration_weeks ?? null;
    const position = enrollment.status === 'completed' ? track.length : enrollment.track_position || 0;
    const weeks = totalWeeks(track, durationWeeks);
    const currentWeek =
      enrollment.status === 'completed'
        ? weeks
        : Math.min(weekOfPosition(Math.min(position, track.length - 1), track, durationWeeks), weeks);

    return { track, plan, durationWeeks, position, weeks, currentWeek, completed: enrollment.status === 'completed' };
  }, [enrollment, plans]);

  const workoutById = useCallback(
    (id?: string) => (id ? trainerWorkouts.find((w: any) => w.id === id) || null : null),
    [trainerWorkouts]
  );

  // Muscle aggregate per workout — computed once per unique workout id and
  // cached, because track nodes repeat the same workouts across weeks and
  // every node card renders a thumbnail from this.
  const muscleInfoFor = useMemo(() => {
    const cache = new Map<string, WorkoutMuscleInfo | null>();
    return (w: any): WorkoutMuscleInfo | null => {
      if (!w?.id) return null;
      const hit = cache.get(w.id);
      if (hit !== undefined) return hit;
      const info = aggregateWorkoutMuscles(w);
      cache.set(w.id, info);
      return info;
    };
    // Cache resets whenever the workout library refreshes.
  }, [trainerWorkouts]);

  // Strip-tap → list jump: the track's y in the scroll content plus each
  // week's measured y inside the track. onLayout keeps both fresh across
  // collapses/expands, so the jump stays correct as heights change.
  const scrollRef = useRef<ScrollView>(null);
  const seasonTrackTopRef = useRef(0);
  const weekYsRef = useRef<Record<number, number>>({});
  const scrollToWeek = useCallback(
    (week: number) => {
      const y = seasonTrackTopRef.current + (weekYsRef.current[week] ?? 0);
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: !reducedMotion });
    },
    [reducedMotion]
  );

  const coachFirst = firstName(trainer?.name) || 'your coach';

  // ── Starting sessions ─────────────────────────────────────────────────────
  // viewOnly: done/ahead nodes open the same preview to look — finishing a
  // session started from one writes nothing and never advances the track.
  const startTrackWorkout = useCallback(
    (workoutRow: any, opts?: { viewOnly?: boolean }) => {
      setActiveWorkout({
        id: `track-${workoutRow.id}`,
        workout_id: workoutRow.id,
        workouts: workoutRow,
        status: 'assigned',
        source: 'track',
        enrollmentId: enrollment?.id,
        viewOnly: !!opts?.viewOnly,
      });
    },
    [enrollment?.id]
  );

  const startAssignedWorkout = useCallback((clientWorkout: any) => {
    setActiveWorkout({ ...clientWorkout, source: 'coach' });
  }, []);

  const handleFinishWorkout = (elapsedSeconds: number, exerciseStates: any[]) => {
    setSummaryElapsedSeconds(elapsedSeconds);
    setSummaryExerciseStates(exerciseStates);
    setShowSummary(true);
  };

  // Real message to the coach — find-or-create conversation, insert, bump unread.
  const sendToCoach = useCallback(
    async (content: string): Promise<boolean> => {
      if (!clientData) return false;
      try {
        let target = conversation || localConversation;
        if (!target) {
          const { data, error } = await supabase
            .from('conversations')
            .insert({ client_id: clientData.id, trainer_id: clientData.trainer_id })
            .select()
            .single();
          if (error || !data) return false;
          target = data;
          setLocalConversation(data);
        }
        const { error: msgError } = await supabase
          .from('messages')
          .insert({ conversation_id: target.id, sender_type: 'client', content });
        if (msgError) return false;
        await supabase.rpc('increment_conversation_unread', {
          conv_id: target.id,
          new_last_message: content,
        });
        if (trainer?.expo_push_token) {
          supabase.functions
            .invoke('send-push-notification', {
              body: {
                pushToken: trainer.expo_push_token,
                title: `Message from ${clientData.name || 'Client'}`,
                body: content,
                data: { url: '/messages' },
              },
            })
            .catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    },
    [clientData, conversation, localConversation, trainer]
  );

  const handleConfirmFinish = async () => {
    if (!activeWorkout) return;
    if (activeWorkout.viewOnly) {
      // A done/ahead node opened to look — nothing to write, nothing advances.
      setActiveWorkout(null);
      setSessionStarted(false);
      setShowSummary(false);
      setSummaryExerciseStates([]);
      setSummaryElapsedSeconds(0);
      return;
    }
    if (activeWorkout.source === 'track') {
      // Is this the final node of the enrollment? Snapshot before advancing —
      // the receipt (24a) needs the enrollment as it was, refreshes included.
      const trackLen = Array.isArray(enrollment?.track_snapshot) ? enrollment.track_snapshot.length : 0;
      const isFinal =
        enrollment?.status === 'active' && trackLen > 0 && (enrollment.track_position || 0) + 1 >= trackLen;
      // Advances the enrollment position and writes the session log.
      await completeTrackWorkout();
      if (isFinal) setFinishedSeason({ ...enrollment, completed_at: new Date().toISOString() });
    } else {
      await completeWorkoutWithLog(activeWorkout.id, summaryElapsedSeconds);
    }
    setActiveWorkout(null);
    setSessionStarted(false);
    setShowSummary(false);
    setSummaryExerciseStates([]);
    setSummaryElapsedSeconds(0);
    refreshData();
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // ── Direct assignments (used when there's no pass) ────────────────────────
  // Overdue assigned sessions float to the top ("today"), newest-missed first,
  // so the way back is the first thing the athlete sees — never buried under
  // its original date.
  const assignedList = useMemo(() => {
    return (workouts || [])
      .filter((w: any) => w.status === 'assigned' || w.status === 'completed')
      .sort((a: any, b: any) => {
        const aOver = a.status === 'assigned' && isOverdue(a.assigned_date);
        const bOver = b.status === 'assigned' && isOverdue(b.assigned_date);
        if (aOver !== bOver) return aOver ? -1 : 1;
        return new Date(b.assigned_date).getTime() - new Date(a.assigned_date).getTime();
      });
  }, [workouts]);

  // One-tap slip recovery — same move as the Today card. Optimistic in the
  // context; on failure it reverts there and we say so plainly here.
  const moveToToday = useCallback(async (cw: any) => {
    const ok = await rescheduleWorkoutToToday(cw.id);
    if (!ok) Alert.alert('Could not move it', 'Something went wrong on our end. Give it another try in a moment.');
  }, [rescheduleWorkoutToToday]);

  // ── Player / summary overlays ─────────────────────────────────────────────
  if (activeWorkout && showSummary) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <WorkoutSummary
          activeWorkout={activeWorkout}
          elapsedSeconds={summaryElapsedSeconds}
          exerciseStates={summaryExerciseStates}
          onConfirmFinish={handleConfirmFinish}
          onContinueWorkout={() => setShowSummary(false)}
        />
      </SafeAreaView>
    );
  }

  if (activeWorkout && sessionStarted) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <ActiveWorkoutPlayer
          activeWorkout={activeWorkout}
          onFinishWorkout={handleFinishWorkout}
          onCancelWorkout={() => {
            setActiveWorkout(null);
            setSessionStarted(false);
          }}
        />
      </SafeAreaView>
    );
  }

  // Preview first — every entry path (Today card, Copilot rows, deep link,
  // assigned rows) lands here. The timer starts only on "Start session".
  if (activeWorkout) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <WorkoutPreview
          activeWorkout={activeWorkout}
          onStart={() => setSessionStarted(true)}
          onBack={() => setActiveWorkout(null)}
        />
      </SafeAreaView>
    );
  }

  // ── Legacy explore (on-demand browsing, coach directory, booking) ─────────
  if (showExplore) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <Pressable style={s.exploreBack} onPress={() => setShowExplore(false)} accessibilityRole="button">
          <Ionicons name="chevron-back" size={18} color={C.textSecondary} />
          <Text style={s.exploreBackText}>Back to your programme</Text>
        </Pressable>
        <ExploreDashboard
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          showSearchInput={showSearchInput}
          setShowSearchInput={setShowSearchInput}
          allCoaches={allCoaches}
          selectedCoach={selectedCoach}
          setSelectedCoach={setSelectedCoach}
          showBookModal={showBookModal}
          setShowBookModal={setShowBookModal}
          bookingCoach={bookingCoach}
          setBookingCoach={setBookingCoach}
          selectedCategoryLabel={selectedCategoryLabel}
          setSelectedCategoryLabel={setSelectedCategoryLabel}
          onWorkoutsListPress={() => setShowExplore(false)}
          hasActivePlan={!!clientData?.plan_id}
        />
      </SafeAreaView>
    );
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  // One-off client_workouts assignment card — used both as the main surface
  // (no pass) and inside "Extras from your coach" (enrolled). Calendar labels
  // are honest here (assigned_date exists): "Today" / "Tomorrow" /
  // "Mon 18 Aug", or "From Tuesday" with the one-tap Move-to-today pill when
  // overdue. Same when/what/does anatomy as the season's node cards.
  const renderAssignment = (cw: any) => {
    const wr = cw.workouts || {};
    const exs: any[] = wr.workout_exercises || [];
    const done = cw.status === 'completed';
    const overdue = !done && isOverdue(cw.assigned_date);
    const whenLabel = overdue
      ? (() => {
          const d = parseLocalDay(cw.assigned_date);
          return d ? `From ${d.toLocaleDateString('en-GB', { weekday: 'long' })}` : null;
        })()
      : assignmentDayLabel(cw.assigned_date);
    const eyebrow = [whenLabel, `One-off from ${coachFirst}`].filter(Boolean).join(' · ');
    const meta: string[] = [];
    if (exs.length > 0) meta.push(`${exs.length} exercise${exs.length === 1 ? '' : 's'}`);
    const totalSets = exs.reduce((sum: number, ex: any) => sum + (Number(ex.sets) || 0), 0);
    if (totalSets > 0) meta.push(`${totalSets} sets`);
    const mins = wr.duration || wr.duration_minutes;
    if (mins) meta.push(`${mins} min`);
    const info = wr?.id ? muscleInfoFor(wr) : null;
    const focus = wr?.id ? focusLineForWorkout(wr, info) : null;
    return (
      <Pressable
        key={cw.id}
        style={[s.nodeRow, done && s.nodeRowDone]}
        onPress={() => {
          if (done) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          startAssignedWorkout(cw);
        }}
        disabled={done}
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow}, ${wr.name || 'Session'}, ${done ? 'done' : meta.length > 0 ? meta.join(', ') : 'assigned'}${focus ? `. ${focus}` : ''}${done ? '' : '. Double tap to preview'}`}
      >
        <View style={{ flex: 1 }}>
          <View style={s.whenRow}>
            <Text style={[s.whenText, overdue && s.whenTextOverdue]} numberOfLines={1}>
              {eyebrow}
            </Text>
            {done && (
              <View style={s.doneChip}>
                <Text style={s.doneChipText}>Done</Text>
              </View>
            )}
          </View>
          <Text style={s.nodeName} numberOfLines={1}>
            {wr.name || 'Session'}
          </Text>
          {meta.length > 0 && <Text style={s.nodeSub}>{meta.join(' · ')}</Text>}
          {focus ? (
            <Text style={s.focusText} numberOfLines={1}>
              {focus}
            </Text>
          ) : null}
        </View>
        {!overdue && info && (
          <MuscleMap primary={info.primary} secondary={info.secondary} view={info.view} height={64} />
        )}
        {overdue && (
          <Pressable
            style={s.movePill}
            onPress={() => moveToToday(cw)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Move ${wr.name || 'session'} to today`}
          >
            <Text style={s.movePillText}>Move to today</Text>
          </Pressable>
        )}
        {!done && <Ionicons name="chevron-forward" size={15} color={C.textFaint} />}
      </Pressable>
    );
  };

  // Real CTA into the pass storefront — only when the coach actually sells one.
  const findSeasonCard =
    (plans || []).length > 0 ? (
      <View style={s.noteCard}>
        <Text style={s.noteTitle}>Find your season</Text>
        <Text style={s.noteBody}>
          A full multi-week programme from {coachFirst} — every session mapped out, week by week.
        </Text>
        <Pressable
          style={s.emptyBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(ClientRoute.myPass);
          }}
          accessibilityRole="button"
          accessibilityLabel="Find your season. Double tap to see the pass"
        >
          <Text style={s.emptyBtnText}>See the pass</Text>
        </Pressable>
      </View>
    ) : null;

  // ── Body ──────────────────────────────────────────────────────────────────

  let body: React.ReactNode;

  if (programme) {
    const planName = programme.plan?.name || 'Your programme';

    body = (
      <>
        {/* Season hero — pass name, real week-of-weeks, true progress */}
        <SeasonHero
          planName={planName}
          description={programme.plan?.description || null}
          currentWeek={programme.currentWeek}
          totalWeeks={programme.weeks}
          position={Math.min(programme.position, programme.track.length)}
          trackLength={programme.track.length}
          completed={programme.completed}
          reducedMotion={reducedMotion}
        />

        {/* Glanceable position — the whole season as a scrubber, no scrolling
            into the list needed. Taps jump the list to that week. */}
        <TrackStrip
          track={programme.track}
          durationWeeks={programme.durationWeeks}
          position={programme.position}
          currentWeek={programme.currentWeek}
          seasonCompleted={programme.completed}
          onPressWeek={scrollToWeek}
        />

        {/* The track — the season's nodes, grouped and labeled by week */}
        <SectionHead label="Your season" sub={`${planName} — every session in order, at your pace.`} />
        <View onLayout={(e) => { seasonTrackTopRef.current = e.nativeEvent.layout.y; }}>
          <SeasonTrack
            track={programme.track}
            durationWeeks={programme.durationWeeks}
            position={programme.position}
            currentWeek={programme.currentWeek}
            seasonCompleted={programme.completed}
            workoutById={workoutById}
            muscleInfoFor={muscleInfoFor}
            coachFirst={coachFirst}
            onOpenWorkout={(w, opts) => startTrackWorkout(w, opts)}
            onOpenDiet={() => router.push(ClientRoute.myDiet)}
            reducedMotion={reducedMotion}
            onWeekLayout={(week, y) => { weekYsRef.current[week] = y; }}
          />
        </View>

        {programme.completed && (
          <View style={s.noteCard}>
            <Text style={s.noteTitle}>You finished the whole plan</Text>
            <Text style={s.noteBody}>
              Every session is in your history, and {coachFirst} can see all of it. What comes next
              is a conversation, not a countdown.
            </Text>
            <Pressable
              style={s.emptyBtn}
              onPress={() => router.push(ClientRoute.myMessages)}
              accessibilityRole="button"
            >
              <Text style={s.emptyBtnText}>Ask {coachFirst} what's next</Text>
            </Pressable>
          </View>
        )}

        {/* One-off assignments — a different thing than the season, and labeled so */}
        {assignedList.length > 0 && (
          <>
            <SectionHead
              label="Extras from your coach"
              sub={`One-off sessions from ${coachFirst}, on top of your season.`}
            />
            <View style={{ gap: 10 }}>{assignedList.map(renderAssignment)}</View>
          </>
        )}
      </>
    );
  } else if (assignedList.length > 0) {
    // Direct assignments, no pass — the main surface, plus the way into one.
    body = (
      <>
        <Text style={s.screenTitle}>Train</Text>
        <Text style={s.screenSub}>Sessions {coachFirst} put on your plan</Text>
        <View style={{ gap: 9, marginTop: 18 }}>{assignedList.map(renderAssignment)}</View>
        {findSeasonCard}
      </>
    );
  } else {
    // No programme, no assignments — honest empty state.
    body = (
      <>
        <Text style={s.screenTitle}>Train</Text>
        <View style={s.emptyCard}>
          <Text style={s.noteTitle}>{trainer ? 'Nothing on your plan yet' : 'No coach yet'}</Text>
          <Text style={s.noteBody}>
            {trainer
              ? `When ${coachFirst} puts you on a programme or assigns a session, it shows up here — done, current, and ahead, in order.`
              : 'Once a coach takes you on, your whole programme lives here — what you did, what is next, and what is ahead.'}
          </Text>
          {trainer && (
            <Pressable
              style={s.emptyBtn}
              onPress={() => router.push(ClientRoute.myMessages)}
              accessibilityRole="button"
            >
              <Text style={s.emptyBtnText}>Message {coachFirst}</Text>
            </Pressable>
          )}
        </View>
        {trainer ? findSeasonCard : null}
      </>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingBottom: insets.bottom + 130,
          paddingHorizontal: 20,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} />}
      >
        {body}

        {/* On-demand browsing kept reachable — one honest entry, no fake counts */}
        <SectionHead label="On demand" />
        <Pressable style={s.nodeRow} onPress={() => setShowExplore(true)} accessibilityRole="button">
          <Ionicons name="compass-outline" size={16} color={C.textSecondary} style={s.nodeIcon} />
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>Browse workouts and coaches</Text>
            <Text style={s.nodeSub}>Sessions outside your programme, any time</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={C.textFaint} />
        </Pressable>
      </ScrollView>

      {/* Season finish — the receipt, then the question (24a) */}
      {finishedSeason && (
        <SeasonComplete
          enrollment={finishedSeason}
          planName={
            (plans || []).find((p: any) => p.id === finishedSeason.plan_id)?.name || 'your programme'
          }
          weeks={totalWeeks(
            Array.isArray(finishedSeason.track_snapshot) ? finishedSeason.track_snapshot : [],
            (plans || []).find((p: any) => p.id === finishedSeason.plan_id)?.duration_weeks ?? null
          )}
          trainerWorkouts={trainerWorkouts}
          otherPlans={(plans || []).filter((p: any) => p.id !== finishedSeason.plan_id)}
          coachName={coachFirst}
          canSend={!!trainer && !!clientData}
          onSend={sendToCoach}
          squad={
            finishedSeason.plan_id && clientData?.id
              ? {
                  planId: finishedSeason.plan_id,
                  clientId: clientData.id,
                  firstName: (clientData.name || '').split(' ')[0] || 'Someone',
                }
              : null
          }
          onViewPlans={() => {
            setFinishedSeason(null);
            router.push(ClientRoute.myPass);
          }}
          onDone={() => setFinishedSeason(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  screenTitle: { fontFamily: F.headingBold, fontSize: 22, color: C.textPrimary },
  screenSub: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 3 },

  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 15,
  },
  nodeRowDone: { opacity: 0.6 },
  nodeIcon: { width: 20, textAlign: 'center' },
  nodeName: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  nodeSub: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2, lineHeight: 16 },

  // Assignment card anatomy — when-row, done chip, focus line (mirrors the
  // season node cards in WeekSection so both sections speak one language).
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  whenText: {
    flexShrink: 1,
    fontFamily: F.bodyBold,
    fontSize: 10,
    color: C.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  whenTextOverdue: { color: C.warning },
  doneChip: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  doneChipText: { fontFamily: F.bodyBold, fontSize: 10, color: C.accent },
  focusText: { fontFamily: F.body, fontSize: 11.5, color: C.textSecondary, marginTop: 3, lineHeight: 16 },

  // Slip recovery — the one-tap move.
  movePill: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  movePillText: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.accent },

  noteCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    padding: 15,
    marginTop: 15,
  },
  noteTitle: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  noteBody: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 4, lineHeight: 18 },

  emptyCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  emptyBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 14,
  },
  emptyBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },

  // Section chapters — hairline, eyebrow, one-line sub. The rhythm change is
  // what keeps the column from reading as one flat newspaper.
  sectionHead: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    marginTop: 30,
    paddingTop: 18,
    marginBottom: 12,
  },
  sectionHeadLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionHeadSub: {
    fontFamily: F.body,
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 17,
    marginTop: 4,
  },

  exploreBack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  exploreBackText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },
});
