/**
 * (client-tabs)/workouts.tsx — Train (design turn 24, option 24c).
 *
 * "The whole pass, without the season map." The athlete's programme as a
 * browsable list: done weeks collapsed into compact receipts, the current
 * node prominent with a Start session button, upcoming weeks visible but
 * never startable early. Week chips come from the same week math as every
 * other surface (lib/passWeeks.ts). Milestones read as markers, not nodes.
 *
 * Direct client_workouts assignments (no pass) render as a simple flat list.
 * No coach work at all → honest empty state pointing at the thread, plus the
 * legacy on-demand explore view kept reachable behind one entry row.
 *
 * Contract preserved: Today pushes here with { startWorkoutId } and this
 * screen resolves it into the ActiveWorkoutPlayer — do not change that.
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 * Every number on this screen is real or omitted.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useClient } from '../../context/ClientContext';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import { isOverdue, parseLocalDay } from '../../lib/streak';
import type { TrackNode } from '../../context/AppContext';

import ExploreDashboard from '../../components/client-tabs/explore/ExploreDashboard';
import ActiveWorkoutPlayer from '../../components/client-tabs/explore/ActiveWorkoutPlayer';
import WorkoutSummary from '../../components/client-tabs/explore/WorkoutSummary';
import SeasonComplete from '../../components/client-tabs/SeasonComplete';

const C = CoachColors;
const F = CoachFonts;

const WEEK_LABEL_RE = /^Week (\d+):\s*/;

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

export default function ClientWorkoutsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // Active workout state
  const [activeWorkout, setActiveWorkout] = useState<any | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryElapsedSeconds, setSummaryElapsedSeconds] = useState(0);
  const [summaryExerciseStates, setSummaryExerciseStates] = useState<any[]>([]);

  // Trainer's workout library — resolves track node ids into real sessions.
  const [trainerWorkouts, setTrainerWorkouts] = useState<any[]>([]);

  // Season finish (24a) — the enrollment snapshot at the moment the final
  // node was completed, so the receipt survives the refresh that follows.
  const [finishedSeason, setFinishedSeason] = useState<any | null>(null);
  // Conversation created here when the context has none yet.
  const [localConversation, setLocalConversation] = useState<any>(null);

  // ── startWorkoutId contract (Today depends on this — preserved exactly) ──
  useEffect(() => {
    if (params?.view === 'explore') setShowExplore(true);

    if (params?.startWorkoutId) {
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

    // Group node indices per week (1-based)
    const byWeek: number[][] = Array.from({ length: weeks }, () => []);
    track.forEach((_, i) => {
      const w = Math.min(weekOfPosition(i, track, durationWeeks), weeks);
      byWeek[w - 1].push(i);
    });

    return { track, plan, durationWeeks, position, weeks, currentWeek, byWeek, completed: enrollment.status === 'completed' };
  }, [enrollment, plans]);

  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const viewWeek = selectedWeek ?? programme?.currentWeek ?? 1;

  const workoutById = useCallback(
    (id?: string) => (id ? trainerWorkouts.find((w: any) => w.id === id) || null : null),
    [trainerWorkouts]
  );

  const coachFirst = firstName(trainer?.name) || 'your coach';

  // ── Starting sessions ─────────────────────────────────────────────────────
  const startTrackWorkout = useCallback(
    (workoutRow: any) => {
      setActiveWorkout({
        id: `track-${workoutRow.id}`,
        workout_id: workoutRow.id,
        workouts: workoutRow,
        status: 'assigned',
        source: 'track',
        enrollmentId: enrollment?.id,
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
    setShowSummary(false);
    setSummaryExerciseStates([]);
    setSummaryElapsedSeconds(0);
    setSelectedWeek(null);
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

  if (activeWorkout) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <ActiveWorkoutPlayer
          activeWorkout={activeWorkout}
          onFinishWorkout={handleFinishWorkout}
          onCancelWorkout={() => setActiveWorkout(null)}
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

  const renderNode = (nodeIndex: number) => {
    if (!programme) return null;
    const node = programme.track[nodeIndex];
    const done = nodeIndex < programme.position;
    const isCurrent = nodeIndex === programme.position && !programme.completed;

    // Milestones read as markers, in athlete language. Week-start labels are
    // machinery ("Week 3: Deload") — strip the prefix; if nothing remains, the
    // week chip already says it, so skip the row.
    if (node.type === 'milestone') {
      const label = (node.label || '').replace(WEEK_LABEL_RE, '').trim();
      if (!label && WEEK_LABEL_RE.test(node.label || '')) return null;
      return (
        <View
          key={nodeIndex}
          style={s.markerRow}
          accessible={true}
          accessibilityLabel={`Marker: ${label || 'A marker your coach set here'}${done ? ', done' : ''}`}
        >
          <View style={s.markerDot} />
          <Text style={s.markerText}>{label || 'A marker your coach set here'}</Text>
          {done && <Ionicons name="checkmark" size={14} color={C.textFaint} />}
        </View>
      );
    }

    if (node.type === 'diet') {
      return (
        <Pressable
          key={nodeIndex}
          style={[s.nodeRow, done && s.nodeRowDone]}
          onPress={() => router.push(ClientRoute.myDiet)}
          accessibilityRole="button"
        >
          {done ? (
            <Ionicons name="checkmark" size={17} color={C.accent} style={s.nodeIcon} />
          ) : (
            <Ionicons name="restaurant-outline" size={16} color={isCurrent ? C.accent : C.textFaint} style={s.nodeIcon} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>Food focus</Text>
            <Text style={s.nodeSub}>
              {done ? 'Done' : `${coachFirst} wants the plate in focus here — details in your meal plan`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={C.textFaint} />
        </Pressable>
      );
    }

    if (node.type === 'class') {
      return (
        <View
          key={nodeIndex}
          style={[s.nodeRow, done && s.nodeRowDone]}
          accessible={true}
          accessibilityLabel={`${node.label || 'Class session'}, ${done ? 'done' : 'a class your coach put on the plan'}`}
        >
          {done ? (
            <Ionicons name="checkmark" size={17} color={C.accent} style={s.nodeIcon} />
          ) : (
            <Ionicons name="people-outline" size={16} color={C.textFaint} style={s.nodeIcon} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>{node.label || 'Class session'}</Text>
            <Text style={s.nodeSub}>{done ? 'Done' : 'A class your coach put on the plan'}</Text>
          </View>
        </View>
      );
    }

    // Workout node
    const w = workoutById(node.id);
    const exercises: any[] = w?.workout_exercises || [];
    const mins = w?.duration || w?.duration_minutes || null;
    const meta: string[] = [];
    if (exercises.length > 0) meta.push(`${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`);
    if (mins) meta.push(`${mins} min`);

    if (isCurrent) {
      return (
        <View key={nodeIndex} style={s.todayCard}>
          <View style={s.todayEyebrowRow}>
            <View style={s.todayDot} />
            <Text style={s.todayEyebrow}>Today</Text>
          </View>
          <Text style={s.todayTitle}>{w?.name || node.label || 'Your next session'}</Text>
          {exercises.length > 0 && (
            <View style={s.exerciseList}>
              {[...exercises]
                .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
                .slice(0, 6)
                .map((ex: any, i: number) => (
                  <View key={ex.id || i} style={s.exerciseRow}>
                    <Text style={s.exerciseName} numberOfLines={1}>
                      {ex.exercises?.name || 'Exercise'}
                    </Text>
                    {ex.sets && ex.reps ? <Text style={s.exerciseMeta}>{ex.sets}×{ex.reps}</Text> : null}
                  </View>
                ))}
              {exercises.length > 6 && <Text style={s.exerciseMore}>+{exercises.length - 6} more</Text>}
            </View>
          )}
          {w ? (
            <Pressable style={s.startBtn} onPress={() => startTrackWorkout(w)} accessibilityRole="button">
              <Text style={s.startBtnText}>Start session</Text>
            </Pressable>
          ) : (
            <Text style={s.nodeSub}>Loading the session details…</Text>
          )}
        </View>
      );
    }

    return (
      <View
        key={nodeIndex}
        style={[s.nodeRow, done && s.nodeRowDone]}
        accessible={true}
        accessibilityLabel={`${w?.name || node.label || 'Session'}, ${done ? 'done' : meta.length > 0 ? meta.join(', ') : 'ahead on your plan'}`}
      >
        {done ? (
          <Ionicons name="checkmark" size={17} color={C.accent} style={s.nodeIcon} />
        ) : (
          <Ionicons name="barbell-outline" size={16} color={C.textFaint} style={s.nodeIcon} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.nodeName}>{w?.name || node.label || 'Session'}</Text>
          <Text style={s.nodeSub}>{done ? 'Done' : meta.length > 0 ? meta.join(' · ') : 'Ahead on your plan'}</Text>
        </View>
      </View>
    );
  };

  // ── Body ──────────────────────────────────────────────────────────────────

  let body: React.ReactNode;

  if (programme) {
    const planName = programme.plan?.name || 'Your programme';
    const weekNodes = programme.byWeek[viewWeek - 1] || [];
    const isAheadWeek = viewWeek > programme.currentWeek;
    const isPastWeek = viewWeek < programme.currentWeek;

    body = (
      <>
        <Text style={s.screenTitle}>Train</Text>
        <Text style={s.screenSub}>
          {planName}
          {programme.completed
            ? ' · finished'
            : ` · week ${programme.currentWeek} of ${programme.weeks}`}
        </Text>

        {/* Week chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 15, marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
        >
          {Array.from({ length: programme.weeks }, (_, i) => i + 1).map((wk) => {
            const isPast = wk < programme.currentWeek || (programme.completed && wk <= programme.weeks);
            const isCurrent = wk === programme.currentWeek && !programme.completed;
            const isNear = wk === programme.currentWeek + 1;
            const isSelected = wk === viewWeek;
            return (
              <Pressable
                key={wk}
                onPress={() => setSelectedWeek(wk)}
                accessibilityRole="button"
                accessibilityLabel={`Week ${wk}${isPast ? ', done' : isCurrent ? ', current week' : ''}`}
                accessibilityState={{ selected: isSelected }}
                style={[
                  s.weekChip,
                  isCurrent && s.weekChipCurrent,
                  !isCurrent && !isPast && !isNear && s.weekChipFar,
                  isSelected && !isCurrent && s.weekChipSelected,
                ]}
              >
                <Text
                  style={[
                    s.weekChipText,
                    isCurrent && s.weekChipTextCurrent,
                    isNear && !isCurrent && s.weekChipTextNear,
                    !isCurrent && !isPast && !isNear && s.weekChipTextFar,
                  ]}
                >
                  W{wk}
                  {isPast ? ' ✓' : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Week context line for past/ahead weeks */}
        {isPastWeek && <Text style={s.weekNote}>Week {viewWeek} — behind you. Every row here is done.</Text>}
        {isAheadWeek && (
          <Text style={s.weekNote}>
            Week {viewWeek} — you can see it, but it opens in order. {coachFirst} built the sequence on purpose.
          </Text>
        )}

        <View style={{ gap: 9, marginTop: 14 }}>
          {weekNodes.length > 0 ? (
            weekNodes.map((i) => renderNode(i))
          ) : (
            <Text style={s.nodeSub}>Nothing scheduled in this week.</Text>
          )}
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
      </>
    );
  } else if (assignedList.length > 0) {
    // Direct assignments, no pass — a simple flat list.
    body = (
      <>
        <Text style={s.screenTitle}>Train</Text>
        <Text style={s.screenSub}>Sessions {coachFirst} put on your plan</Text>
        <View style={{ gap: 9, marginTop: 18 }}>
          {assignedList.map((cw: any) => {
            const wr = cw.workouts || {};
            const exs: any[] = wr.workout_exercises || [];
            const done = cw.status === 'completed';
            const overdue = !done && isOverdue(cw.assigned_date);
            const fromDay = overdue
              ? parseLocalDay(cw.assigned_date)?.toLocaleDateString('en-GB', { weekday: 'short' })
              : null;
            const meta: string[] = [];
            if (exs.length > 0) meta.push(`${exs.length} exercise${exs.length === 1 ? '' : 's'}`);
            const mins = wr.duration || wr.duration_minutes;
            if (mins) meta.push(`${mins} min`);
            return (
              <Pressable
                key={cw.id}
                style={[s.nodeRow, done && s.nodeRowDone]}
                onPress={() => !done && startAssignedWorkout(cw)}
                disabled={done}
                accessibilityRole="button"
                accessibilityLabel={`${wr.name || 'Session'}, ${done ? 'done' : meta.length > 0 ? meta.join(', ') : 'assigned'}${overdue && fromDay ? `, from ${fromDay}` : ''}${done ? '' : '. Double tap to start'}`}
              >
                {done ? (
                  <Ionicons name="checkmark" size={17} color={C.accent} style={s.nodeIcon} />
                ) : (
                  <Ionicons name="barbell-outline" size={16} color={C.textSecondary} style={s.nodeIcon} />
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={[s.nodeName, { flexShrink: 1 }]} numberOfLines={1}>{wr.name || 'Session'}</Text>
                    {overdue && !!fromDay && (
                      <View style={s.fromTag}>
                        <Text style={s.fromTagText}>from {fromDay}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.nodeSub}>{done ? 'Done' : meta.length > 0 ? meta.join(' · ') : 'Assigned'}</Text>
                </View>
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
          })}
        </View>
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
      </>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
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
        <Text style={s.sectionLabel}>On demand</Text>
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

  weekChip: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  weekChipCurrent: { backgroundColor: C.accent, borderColor: C.accent },
  weekChipFar: { borderColor: '#1E211D' },
  weekChipSelected: { borderColor: C.textSecondary },
  weekChipText: { fontFamily: F.bodyMedium, fontSize: 11.5, color: C.textFaint },
  weekChipTextCurrent: { fontFamily: F.bodyBold, color: C.onAccent },
  weekChipTextNear: { color: '#C9CEC2' },
  weekChipTextFar: { color: '#4E5449' },

  weekNote: {
    fontFamily: F.body,
    fontSize: 12,
    color: C.textMuted,
    marginTop: 14,
    lineHeight: 17,
  },

  todayCard: {
    backgroundColor: '#1E211D',
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: 18,
    padding: 16,
  },
  todayEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  todayEyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  todayTitle: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary, marginTop: 9 },
  exerciseList: { gap: 7, marginTop: 13 },
  exerciseRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  exerciseName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  exerciseMeta: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  exerciseMore: { fontFamily: F.body, fontSize: 11.5, color: C.textFaint },
  startBtn: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  startBtnText: { fontFamily: F.bodyBold, fontSize: 14.5, color: C.onAccent },

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

  // Slip recovery — the subtle "from <weekday>" tag and the one-tap move.
  fromTag: {
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  fromTagText: { fontFamily: F.bodyMedium, fontSize: 10.5, color: C.textMuted },
  movePill: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  movePillText: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.accent },

  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  markerDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.textFaint },
  markerText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textSecondary },

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

  sectionLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 26,
    marginBottom: 11,
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
