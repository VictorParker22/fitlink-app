import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { loadSnapshot, saveSnapshot } from '../lib/offlineCache';
import { useAuth } from './AuthContext';
import type { SetFeel } from './WorkoutContext';
import * as Notifications from 'expo-notifications';
import { decode } from 'base-64';
import { isMissingSchemaError } from '../lib/schemaErrors';
import { countCompletedWorkoutsForClient } from '../lib/workoutCounts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Result of a write that must never claim a false success. Supabase writes
 * resolve with `{ error }` instead of throwing, so callers that need to know
 * whether the server actually accepted the change get this back.
 */
export interface WriteResult {
  ok: boolean;
  error?: string;
}

export interface ExerciseLogEntry {
  weight: number;
  reps: number;
  completed: boolean;
  feel?: SetFeel; // optional — how the set felt; older logs won't have it
  /**
   * Wall-clock seconds the athlete actually spent under tension, when they
   * chose to time the set. Optional and opt-in: a set that was not timed
   * carries no `seconds` at all rather than a 0, because 0 would read as
   * "instant" in every consumer. `exercises` is jsonb, so this needed no
   * migration — same way `feel` was added.
   */
  seconds?: number;
}

interface ClientData {
  id: string;
  trainer_id: string;
  name: string;
  email?: string;
  phone?: string;
  status: string;
  plan_id?: string;
  goals?: string;
  notes?: string;
  auth_user_id?: string;
  avatar_url?: string;
  /**
   * NOTE: `goals` above has NO column on public.clients — it only ever arrives
   * as undefined. Goals live inside `assessment_data` (read them with
   * lib/clientGoals.ts). Do not write it back to the table.
   *
   * `completed_workouts` used to be declared here too. It is GONE, not merely
   * stripped on write: there is no such column, so it was permanently
   * undefined and every screen reading it showed 0. The real number is
   * `completedWorkoutCount` on this context (see lib/workoutCounts.ts).
   */
  assessment_data?: any;
  trial_end_date?: string;
  health_sharing_enabled?: boolean;
  health_sharing_requested?: boolean;
  xp?: number;
  progress?: { streak: number; workoutsThisMonth: number };
  created_at: string;
}

interface ClientContextType {
  loading: boolean;
  clientData: ClientData | null;
  trainer: any;
  sessions: any[];
  workouts: any[];
  diets: any[];
  progressLogs: any[];
  conversation: any;
  plans: any[];
  upcomingSessions: any[];
  todayWorkout: any;
  enrollment: any;
  /** Resolves { ok:false, error } when the server rejected the write — never throws. */
  completeTrackWorkout: (sessionId?: string, durationSeconds?: number) => Promise<WriteResult>;
  /** Resolves { ok:false, error } when the server rejected the write — never throws. */
  skipTrackWorkout: () => Promise<WriteResult>;
  /**
   * Advance the enrollment by one node — the raw primitive the two wrappers
   * above use. Exposed for the class player's completion screen, which
   * advances a CLASS node (completeTrackWorkout only handles workout nodes).
   * Resolves { result: { ok:false, error } } on rejection — never throws.
   */
  advanceEnrollment: (eventType: 'completed' | 'skipped') => Promise<{ result: WriteResult; node?: any }>;
  subscription: any;
  paymentHistory: any[];
  exerciseLogs: Record<string, ExerciseLogEntry>;
  exercisePrs: Record<string, number>; // exerciseId → max weight ever lifted (kg or lb, whichever client uses)
  /**
   * Workouts this athlete has actually completed, per the single app-wide
   * definition in lib/workoutCounts.ts. Computed from rows already fetched for
   * this screen — no extra query. `null` until they load (or if the fetch
   * failed); surfaces must OMIT the stat while null, never render 0.
   */
  completedWorkoutCount: number | null;
  logExerciseSet: (workoutId: string, exerciseId: string, setIndex: number, weight: number, reps: number, feel?: SetFeel, seconds?: number) => void;
  checkAndUpdatePr: (exerciseId: string, weight: number) => boolean; // returns true if this is a new PR
  clearExerciseLogs: () => void;
  /** Resolves { ok:false, error } when the server rejected the write — never throws. */
  completeWorkoutWithLog: (clientWorkoutId: string, durationSeconds: number) => Promise<WriteResult>;
  /** Resolves { ok:false, error } when the server rejected the write — never throws. */
  markWorkoutComplete: (id: string) => Promise<WriteResult>;
  /** Resolves { ok:false, error } when the server rejected the write — never throws. */
  markWorkoutSkipped: (id: string) => Promise<WriteResult>;
  /** Slip recovery — move a missed assigned workout to today. Resolves false on failure (already reverted). */
  rescheduleWorkoutToToday: (clientWorkoutId: string) => Promise<boolean>;
  
  // Diet Tracking
  mealLogs: Record<string, boolean>;
  logMealEaten: (dietPlanId: string, dietPlanMealId: string) => Promise<void>;
  unlogMeal: (dietPlanId: string, dietPlanMealId: string) => Promise<void>;

  /**
   * Records interest in a coach's pass and messages the coach. Grants nothing
   * and charges nothing — purchase lives in the my-pass storefront.
   */
  updateAssessment: (data: any) => Promise<void>;
  updateClientAvatar: (base64: string, uri: string) => Promise<void>;
  logProgress: (data: { weight?: number; bodyFat?: number; measurements?: any; notes?: string }) => Promise<void>;
  cancelSubscription: (subscriptionId: string) => Promise<void>;
  setupPaymentMethod: () => Promise<{ clientSecret: string, customerId: string }>;
  healthSharingEnabled: boolean;
  toggleHealthSharing: (enabled: boolean) => Promise<void>;
  refreshData: () => Promise<void>;
  activeGymVisit: any;
  checkInGym: () => Promise<void>;
  checkOutGym: () => Promise<void>;
}

const ClientContext = createContext<ClientContextType | null>(null);

export function ClientProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [trainer, setTrainer] = useState<any>(null);
  const [enrollment, setEnrollment] = useState<any>(null);
  const [allTrainerWorkouts, setAllTrainerWorkouts] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [diets, setDiets] = useState<any[]>([]);
  const [progressLogs, setProgressLogs] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exerciseLogs, setExerciseLogs] = useState<Record<string, ExerciseLogEntry>>({});
  const [exercisePrs, setExercisePrs] = useState<Record<string, number>>({});
  /** Session-log rows, narrowed to what the completed-workout count needs. null = not loaded. */
  const [workoutLogRows, setWorkoutLogRows] = useState<
    { client_id: string; client_workout_id: string | null }[] | null
  >(null);
  const [healthSharingEnabled, setHealthSharingEnabled] = useState(false);
  const [activeGymVisit, setActiveGymVisit] = useState<any>(null);
  const [mealLogs, setMealLogs] = useState<Record<string, boolean>>({});
  // True once a network fetch has landed — hydration then stays hands-off so
  // stale snapshots can never overwrite fresh (or legitimately empty) data.
  const netLoadedRef = useRef(false);

  // Everything that belongs to one athlete. Called when the signed-in user
  // changes (sign-out, or a different account signs in on the same phone)
  // and when the network says this user has no client row.
  const resetAthleteState = useCallback(() => {
    setClientData(null);
    setTrainer(null);
    setEnrollment(null);
    setAllTrainerWorkouts([]);
    setSessions([]);
    setWorkouts([]);
    setDiets([]);
    setProgressLogs([]);
    setConversation(null);
    setPlans([]);
    setSubscription(null);
    setPaymentHistory([]);
    setExerciseLogs({});
    setExercisePrs({});
    setWorkoutLogRows([]);
    setHealthSharingEnabled(false);
    setActiveGymVisit(null);
    setMealLogs({});
  }, []);

  // The provider lives above the auth switch and is never remounted, so
  // state must be cleared by hand whenever the account changes.
  const lastUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = user?.id ?? null;
    if (lastUserIdRef.current !== null && lastUserIdRef.current !== id) {
      resetAthleteState();
      setLoading(!!id);
    }
    lastUserIdRef.current = id;
  }, [user?.id, resetAthleteState]);

  // Hydrate the athlete's core data from the last-known-good snapshot so the
  // Today/Train/Food screens render instantly, even in airplane mode.
  useEffect(() => {
    if (!user) return;
    netLoadedRef.current = false;
    let mounted = true;
    (async () => {
      const [profile, coach, wk, dt, en, ss, cv] = await Promise.all([
        loadSnapshot<ClientData>(user.id, 'client_profile'),
        loadSnapshot<any>(user.id, 'client_trainer'),
        loadSnapshot<any[]>(user.id, 'client_workouts'),
        loadSnapshot<any[]>(user.id, 'client_diets'),
        loadSnapshot<any>(user.id, 'client_enrollment'),
        loadSnapshot<any[]>(user.id, 'client_sessions'),
        loadSnapshot<any>(user.id, 'client_conversation'),
      ]);
      if (!mounted || netLoadedRef.current) return;
      if (profile) {
        setClientData((prev) => prev ?? profile);
        setHealthSharingEnabled((prev) => prev || !!profile.health_sharing_enabled);
        setLoading(false);
      }
      if (coach) setTrainer((prev: any) => prev ?? coach);
      if (wk?.length) setWorkouts((prev) => (prev.length ? prev : wk));
      if (dt?.length) setDiets((prev) => (prev.length ? prev : dt));
      if (en) setEnrollment((prev: any) => prev ?? en);
      if (ss?.length) setSessions((prev) => (prev.length ? prev : ss));
      if (cv) setConversation((prev: any) => prev ?? cv);
    })();
    return () => { mounted = false; };
  }, [user]);

  const fetchClientData = useCallback(async (isBackground = false) => {
    if (!user) { setLoading(false); return; }

    if (!isBackground) setLoading(true);
    try {
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (__DEV__) console.log('[ClientContext] Fetch result:', JSON.stringify({ userId: user.id, client: client?.id, clientErr }));

      if (!client) {
        // No client row for THIS user. Clear everything: a freshly signed-up
        // athlete on a phone that previously held another athlete was shown
        // that athlete's coach, pass and messages (TestFlight build 25).
        resetAthleteState();
        setLoading(false);
        return;
      }
      setClientData(client);
      setHealthSharingEnabled(!!client.health_sharing_enabled);

      const [
        trainerRes, sessionsRes, workoutsRes, dietsRes, progressRes, convRes, plansRes, payRes, visitRes, mealLogsRes, enrollmentRes, trainerWorkoutsRes, workoutLogsRes, subscriptionRes
      ] = await Promise.all([
        // Explicit columns, not select('*'): the athlete's own coach row was
        // handing over stripe_account_id (the coach's Stripe Connect account)
        // and every other private field. expo_push_token stays because the
        // athlete legitimately messages this coach, and the push function now
        // authorises by relationship anyway.
        supabase.from('trainers')
          // stripe_onboarding_complete is deliberately included: checkout
          // gates on it, and an athlete paying their own coach legitimately
          // needs the boolean "can this coach take payments". The Stripe
          // ACCOUNT ID stays excluded — the flag is not the key.
          .select('id, name, email, phone, bio, specialization, specializations, certifications, working_hours, avatar_url, cover_url, referral_code, expo_push_token, notification_prefs, onboarding_complete, stripe_onboarding_complete, created_at')
          // Solo athletes have no trainer: a null eq is a PostgREST error,
          // and .single() on zero rows is another. Neither should exist.
          .eq('id', client.trainer_id ?? '00000000-0000-0000-0000-000000000000').maybeSingle(),
        supabase.from('sessions').select('*').eq('client_id', client.id).order('date'),
        supabase.from('client_workouts')
          .select('*, workouts(*, workout_exercises(*, exercises(*)))')
          .eq('client_id', client.id)
          .order('assigned_date', { ascending: false }),
        supabase.from('client_diets')
          .select('*, diet_plans(*, diet_plan_meals(*, meals(*)))')
          .eq('client_id', client.id)
          .order('assigned_date', { ascending: false }),
        supabase.from('client_progress')
          .select('*')
          .eq('client_id', client.id)
          .order('date', { ascending: false }),
        supabase.from('conversations').select('*').eq('client_id', client.id).maybeSingle(),
        supabase.from('plans').select('*').eq('trainer_id', client.trainer_id),
        supabase.from('payments').select('*, plans(*)').eq('client_id', client.id).order('created_at', { ascending: false }),
        supabase.from('gym_visits').select('*').eq('client_id', client.id).is('check_out_time', null).maybeSingle(),
        supabase.from('client_meal_logs').select('*').eq('client_id', client.id).eq('logged_date', new Date().toISOString().split('T')[0]),
        // Active first, else the most recent completed one — the finished-season
        // states on Today/Train need the completed enrollment to survive a refresh.
        supabase.from('client_plan_enrollments').select('*').eq('client_id', client.id).in('status', ['active', 'completed']).order('started_at', { ascending: false }).limit(5),
        supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').eq('trainer_id', client.trainer_id),
        // Fetch only the columns actually used — the exercises JSONB for the PR
        // map, and client_workout_id so the completed-workout count can tell an
        // assignment log apart from a standalone session (lib/workoutCounts.ts).
        // Avoids pulling full log rows (notes, duration, etc).
        supabase.from('client_workout_logs').select('exercises, client_workout_id').eq('client_id', client.id),
        // The athlete's REAL membership row — written by create-subscription and
        // kept current by the stripe-webhook. Latest row wins; null when the
        // athlete has never checked out. Replaces a client-side synthesis that
        // invented a current_period_end one month out.
        supabase.from('client_subscriptions')
          .select('id, status, current_period_start, current_period_end, cancel_at_period_end, stripe_subscription_id, plan_id')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (__DEV__) console.log('[ClientContext] Related data:', JSON.stringify({
        trainer: !!trainerRes.data,
        sessions: sessionsRes.data?.length,
        workouts: workoutsRes.data?.length,
        trainerErr: trainerRes.error?.message,
      }));



      if (trainerRes.data) setTrainer(trainerRes.data);
      if (sessionsRes.data) setSessions(sessionsRes.data);
      if (workoutsRes.data) setWorkouts(workoutsRes.data);
      if (dietsRes.data) setDiets(dietsRes.data);
      if (progressRes.data) setProgressLogs(progressRes.data);
      
      if (mealLogsRes.data) {
        const logs: Record<string, boolean> = {};
        mealLogsRes.data.forEach((log: any) => {
          logs[log.diet_plan_meal_id] = true;
        });
        setMealLogs(logs);
      }
      if (convRes.data) setConversation(convRes.data);
      if (plansRes.data) setPlans(plansRes.data);
      if (payRes.data) setPaymentHistory(payRes.data);
      if (subscriptionRes?.error) {
        if (__DEV__) console.log('[ClientContext] subscription fetch error:', subscriptionRes.error.message);
        setSubscription(null);
      } else if (subscriptionRes?.data) {
        const row: any = subscriptionRes.data;
        setSubscription({
          ...row,
          plans: (plansRes.data || []).find((p: any) => p.id === row.plan_id) ?? null,
        });
      } else {
        setSubscription(null);
      }
      let pickedEnrollment: any = null;
      if (enrollmentRes?.error && __DEV__) {
        console.log('[ClientContext] enrollment fetch error:', enrollmentRes.error.message);
      }
      if (enrollmentRes?.data && enrollmentRes.data.length > 0) {
        const active = enrollmentRes.data.find((e: any) => e.status === 'active');
        pickedEnrollment = active || enrollmentRes.data[0];
        // Legacy enrollments frozen from an empty source: fall back to the
        // plan's current track so the season still renders. (New enrollments
        // snapshot correctly; the fix_enrollment_client_rls migration also
        // backfills these rows server-side.)
        const snapEmpty =
          !Array.isArray(pickedEnrollment.track_snapshot) ||
          pickedEnrollment.track_snapshot.length === 0;
        if (snapEmpty && plansRes.data) {
          const plan = plansRes.data.find((p: any) => p.id === pickedEnrollment.plan_id);
          if (Array.isArray(plan?.track) && plan.track.length > 0) {
            pickedEnrollment = { ...pickedEnrollment, track_snapshot: plan.track };
            if (__DEV__) console.log('[ClientContext] enrollment snapshot empty — using plan track fallback');
          }
        }
        setEnrollment(pickedEnrollment);
      } else setEnrollment(null);
      if (trainerWorkoutsRes?.data) setAllTrainerWorkouts(trainerWorkoutsRes.data);

      // Network data landed — snapshot it for the next cold/offline start,
      // and stop any late hydration from overwriting it.
      netLoadedRef.current = true;
      saveSnapshot(user.id, 'client_profile', client);
      if (trainerRes.data) saveSnapshot(user.id, 'client_trainer', trainerRes.data);
      if (workoutsRes.data) saveSnapshot(user.id, 'client_workouts', workoutsRes.data);
      if (dietsRes.data) saveSnapshot(user.id, 'client_diets', dietsRes.data);
      if (sessionsRes.data) saveSnapshot(user.id, 'client_sessions', sessionsRes.data);
      if (convRes.data) saveSnapshot(user.id, 'client_conversation', convRes.data);
      saveSnapshot(user.id, 'client_enrollment', pickedEnrollment);

      // ── Build exercise PR map from historical logs ───────────────────────────
      // Scan all past workout logs and keep the max weight per exercise ID.
      // This runs once on load; individual PRs are updated in-memory via checkAndUpdatePr.
      if (workoutLogsRes.data && workoutLogsRes.data.length > 0) {
        const prMap: Record<string, number> = {};
        workoutLogsRes.data.forEach((row: any) => {
          const exercises: Array<{ id: string; sets: Array<{ weight: number | string; completed: boolean }> }> = row.exercises || [];
          exercises.forEach(ex => {
            if (!ex?.id) return;
            ex.sets?.forEach(set => {
              if (!set?.completed) return;
              const w = parseFloat(String(set.weight)) || 0;
              if (w > (prMap[ex.id] ?? 0)) prMap[ex.id] = w;
            });
          });
        });
        setExercisePrs(prMap);
      }
      // Stays null when the fetch failed, so the profile omits the stat rather
      // than telling the athlete they have completed zero workouts.
      if (workoutLogsRes.data) {
        setWorkoutLogRows(workoutLogsRes.data.map((row: any) => ({
          client_id: client.id,
          client_workout_id: row.client_workout_id ?? null,
        })));
      }
      
      // Auto-expire stale gym visits (older than 4 hours)
      const MAX_GYM_VISIT_MS = 4 * 60 * 60 * 1000; // 4 hours
      if (visitRes && visitRes.data) {
        const checkInTime = new Date(visitRes.data.check_in_time).getTime();
        const elapsed = Date.now() - checkInTime;
        
        if (elapsed > MAX_GYM_VISIT_MS) {
          // Auto-checkout stale visit with capped duration
          const cappedMinutes = Math.round(MAX_GYM_VISIT_MS / 60000);
          const { error: expireErr } = await supabase.from('gym_visits').update({
            check_out_time: new Date(checkInTime + MAX_GYM_VISIT_MS).toISOString(),
            duration_minutes: cappedMinutes,
          }).eq('id', visitRes.data.id);
          if (expireErr) {
            // Server still has the visit open — keep showing it rather than
            // pretending it closed, so the next load retries the expiry.
            if (__DEV__) console.warn('[ClientContext] Auto-expire of stale gym visit failed:', expireErr.message);
            setActiveGymVisit(visitRes.data);
          } else {
            setActiveGymVisit(null);
            if (__DEV__) console.log('[ClientContext] Auto-expired stale gym visit:', visitRes.data.id);
          }
        } else {
          setActiveGymVisit(visitRes.data);
        }
      } else {
        setActiveGymVisit(null);
      }
    } catch (err) {
      if (__DEV__) console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  // Realtime Subscriptions
  const refreshData = useCallback(async () => {
    await fetchClientData(true);
  }, [fetchClientData]);

  useEffect(() => {
    if (!clientData?.id) return;

    const channel = supabase.channel(`client_sync_${clientData.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `id=eq.${clientData.id}` }, () => {
        refreshData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_workouts', filter: `client_id=eq.${clientData.id}` }, () => {
        refreshData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_plan_enrollments', filter: `client_id=eq.${clientData.id}` }, () => {
        refreshData();
      })
      .subscribe((status) => {
        if (__DEV__) console.log('[ClientContext] Realtime subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientData?.id, refreshData]);

  // `subscription` is the real client_subscriptions row (set in fetchClientData
  // above). It is no longer synthesised from clientData.status — that version
  // invented a current_period_end and showed a "membership" to anyone the coach
  // had marked active, checkout or not.


  // Log individual exercise set completion (in-memory only)
  const logExerciseSet = useCallback((workoutId: string, exerciseId: string, setIndex: number, weight: number, reps: number, feel?: SetFeel, seconds?: number) => {
    const key = `${workoutId}-${exerciseId}-${setIndex}`;
    setExerciseLogs((prev) => ({
      ...prev,
      [key]: {
        weight,
        reps,
        completed: true,
        ...(feel ? { feel } : {}),
        // Guard on > 0, not on presence: an untimed set passes undefined and a
        // stopwatch stopped on the same second passes 0. Neither is a duration.
        ...(seconds && seconds > 0 ? { seconds: Math.round(seconds) } : {}),
      },
    }));
  }, []);

  const clearExerciseLogs = useCallback(() => {
    setExerciseLogs({});
  }, []);

  // Notify the coach a workout was finished — in-app notifications row (lands
  // live via the coach's existing notifications realtime channel) plus a push
  // when the trainer has a token. Set count is only mentioned when we truly
  // have one. Fire-and-forget: failures never block the completion flow.
  const notifyCoachWorkoutDone = useCallback((workoutName?: string | null, completedSets?: number, backOnTrack?: boolean) => {
    if (!clientData?.trainer_id) return;
    const name = workoutName || 'a workout';
    let summary = completedSets && completedSets > 0
      ? `${clientData.name} finished ${name} — ${completedSets} set${completedSets === 1 ? '' : 's'} logged`
      : `${clientData.name} finished ${name}`;
    // A slipped workout the athlete moved to today and then completed — let
    // the coach see the save, not just the finish.
    if (backOnTrack) summary += ' — back on track';
    (async () => {
      const { error } = await supabase.from('notifications').insert({
        trainer_id: clientData.trainer_id,
        type: 'workout',
        title: 'Workout completed',
        description: summary,
        metadata: { client_id: clientData.id, ...(completedSets && completedSets > 0 ? { sets: completedSets } : {}) },
        is_read: false,
      });
      if (error && __DEV__) console.warn('[ClientContext] Coach notification skipped:', error.message);
    })();
    if (trainer?.expo_push_token) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: trainer.expo_push_token,
          title: 'Workout completed',
          body: summary,
          data: { url: `/client/${clientData.id}` },
        },
      }).catch(() => {});
    }
  }, [clientData, trainer]);

  // ── Slip recovery ──────────────────────────────────────────────────────────
  // Ids rescheduled this session — when one is later completed, the coach
  // notification appends "back on track" so the save is visible. In-memory
  // only on purpose: it's a nicety, not state worth persisting.
  const rescheduledIdsRef = useRef<Set<string>>(new Set());

  // Move a missed assigned workout to today. Optimistic local update first;
  // the DB write is resilient — any failure (including missing column/table)
  // reverts the local row and resolves false so the caller can show a plain
  // alert. Never throws.
  const rescheduleWorkoutToToday = useCallback(async (clientWorkoutId: string): Promise<boolean> => {
    const existing = workouts.find((w: any) => w.id === clientWorkoutId);
    if (!existing) return false;
    const prevDate = existing.assigned_date;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setWorkouts((prev) => prev.map((w: any) => (w.id === clientWorkoutId ? { ...w, assigned_date: todayStr } : w)));
    try {
      const { error } = await supabase
        .from('client_workouts')
        .update({ assigned_date: todayStr })
        .eq('id', clientWorkoutId);
      if (error) throw error;
      rescheduledIdsRef.current.add(clientWorkoutId);
      return true;
    } catch (e: any) {
      if (__DEV__) console.warn('[ClientContext] Reschedule skipped:', e?.message);
      setWorkouts((prev) => prev.map((w: any) => (w.id === clientWorkoutId ? { ...w, assigned_date: prevDate } : w)));
      return false;
    }
  }, [workouts]);

  /**
   * exerciseLogs keys are `${sessionId}-${exerciseId}-${setIndex}` — this
   * groups one session's entries into the exercises JSONB that
   * client_workout_logs stores. Shared by BOTH completion paths: assigned
   * workouts (sessionId = client_workouts.id) and season/track sessions
   * (sessionId = `track-${workouts.id}`).
   */
  const buildExercisesJson = useCallback((sessionId: string) => {
    const exercisesData: Record<string, { id: string, sets: any[] }> = {};
    Object.entries(exerciseLogs)
      .filter(([key]) => key.startsWith(`${sessionId}-`))
      .forEach(([key, entry]) => {
        const parts = key.replace(`${sessionId}-`, '').split('-');
        const setIndex = parseInt(parts.pop()!, 10);
        const exerciseId = parts.join('-');

        if (!exercisesData[exerciseId]) {
          exercisesData[exerciseId] = { id: exerciseId, sets: [] };
        }
        exercisesData[exerciseId].sets[setIndex] = {
           weight: entry.weight,
           reps: entry.reps,
           completed: entry.completed,
           ...(entry.feel ? { feel: entry.feel } : {}),
           ...(entry.seconds ? { seconds: entry.seconds } : {})
        };
      });
    return Object.values(exercisesData);
  }, [exerciseLogs]);

  // Complete workout with full exercise log data
  const completeWorkoutWithLog = useCallback(async (clientWorkoutId: string, durationSeconds: number): Promise<WriteResult> => {
    const exercisesJson = buildExercisesJson(clientWorkoutId);

    const logPayload = {
       client_id: clientData?.id,
       client_workout_id: clientWorkoutId,
       workout_id: todayWorkout?.id || null,
       exercises: exercisesJson,
       duration_minutes: Math.round(durationSeconds / 60)
    };

    // Try to save logs. A not-yet-migrated table/column is tolerated (the
    // completion itself still counts); any other failure is real data loss and
    // gets logged loudly.
    if (exercisesJson.length > 0) {
      const { error: logError } = await supabase.from('client_workout_logs').insert(logPayload);
      if (logError && isMissingSchemaError(logError)) {
        if (__DEV__) console.warn('[ClientContext] Log save skipped (migration pending):', logError.message);
      } else if (logError) {
        console.error('[ClientContext] Workout log NOT saved:', logError.message);
      }
    }

    // Mark workout complete
    const { error } = await supabase
      .from('client_workouts')
      .update({ status: 'completed' })
      .eq('id', clientWorkoutId);

    if (error) {
       console.error('[ClientContext] Failed to mark workout complete:', error);
       return { ok: false, error: error.message };
    }

    // XP retired: clients.xp was written here (+50 per workout) and read by
    // NOTHING — no screen, no query, no coach view. A write-only number is the
    // same shape as the phantom-column bugs, just one step earlier. The column
    // stays in the DB; if gamification ever earns a surface, re-add the write
    // WITH the surface in the same commit.
    setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
    // Tell the coach — real completed-set count only (0 sets → no count claim).
    const completedSets = exercisesJson.reduce(
      (sum, ex: any) => sum + (ex.sets || []).filter((s: any) => s?.completed).length, 0);
    const assignment = workouts.find((w: any) => w.id === clientWorkoutId);
    // Rescheduled slip completed → the coach sees the save, not just the finish.
    const backOnTrack = rescheduledIdsRef.current.has(clientWorkoutId);
    if (backOnTrack) rescheduledIdsRef.current.delete(clientWorkoutId);
    notifyCoachWorkoutDone(assignment?.workouts?.name || todayWorkout?.workouts?.name, completedSets, backOnTrack);
    // Clear logs for this workout
    setExerciseLogs((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(clientWorkoutId)) delete next[k]; });
      return next;
    });
    return { ok: true };
  // todayWorkout is intentionally absent: it is declared later in this file
  // (TDZ at render if referenced here) and only feeds the optional workout_id
  // tag on the log row — pre-existing behavior, kept as-is.
  }, [buildExercisesJson, clientData, workouts, notifyCoachWorkoutDone]);

  const markWorkoutComplete = useCallback(async (clientWorkoutId: string): Promise<WriteResult> => {
    const { error } = await supabase.from('client_workouts').update({ status: 'completed' }).eq('id', clientWorkoutId);
    if (error) {
      console.error('[ClientContext] Failed to mark workout complete:', error.message);
      return { ok: false, error: error.message };
    }
    // XP retired — written, read nowhere. See the note in completeWorkoutWithLog.
    setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
    return { ok: true };
  }, [clientData]);

  const markWorkoutSkipped = useCallback(async (clientWorkoutId: string): Promise<WriteResult> => {
    const { error } = await supabase.from('client_workouts').update({ status: 'skipped' }).eq('id', clientWorkoutId);
    if (error) {
      console.error('[ClientContext] Failed to mark workout skipped:', error.message);
      return { ok: false, error: error.message };
    }
    setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'skipped' } : w));
    return { ok: true };
  }, []);

  // --- Diet Tracking ---
  const logMealEaten = useCallback(async (dietPlanId: string, dietPlanMealId: string) => {
    if (!clientData) return;
    
    // Optimistic UI update
    setMealLogs((prev) => ({ ...prev, [dietPlanMealId]: true }));
    
    const { error } = await supabase.from('client_meal_logs').insert({
      client_id: clientData.id,
      diet_plan_id: dietPlanId,
      diet_plan_meal_id: dietPlanMealId,
      logged_date: new Date().toISOString().split('T')[0]
    });
    
    if (error) {
      // Revert — the server has no such log, so the checkmark must go away
      // (this used to only revert in __DEV__, leaving release builds lying).
      if (__DEV__) console.warn('[ClientContext] Failed to log meal:', error.message);
      setMealLogs((prev) => {
        const next = { ...prev };
        delete next[dietPlanMealId];
        return next;
      });
    }
    // XP retired — written, read nowhere. See the note in completeWorkoutWithLog.
  }, [clientData]);

  const unlogMeal = useCallback(async (dietPlanId: string, dietPlanMealId: string) => {
    if (!clientData) return;
    
    // Optimistic UI update
    setMealLogs((prev) => {
      const next = { ...prev };
      delete next[dietPlanMealId];
      return next;
    });

    const { error } = await supabase.from('client_meal_logs')
      .delete()
      .eq('client_id', clientData.id)
      .eq('diet_plan_meal_id', dietPlanMealId)
      .eq('logged_date', new Date().toISOString().split('T')[0]);
      
    if (error) {
      // Revert — the row is still there server-side.
      if (__DEV__) console.warn('[ClientContext] Failed to unlog meal:', error.message);
      setMealLogs((prev) => ({ ...prev, [dietPlanMealId]: true }));
    }
  }, [clientData]);

  const upcomingSessions = useMemo(() =>
    sessions.filter((s) => new Date(s.date) > new Date() && s.status === 'upcoming'), [sessions]);

  const todayWorkout = useMemo(() => {
    // Priority 1: Explicit coach assignment for today
    const today = new Date().toDateString();
    const explicit = workouts.find((w: any) =>
      new Date(w.assigned_date).toDateString() === today
      && w.status === 'assigned'
    );
    if (explicit) return { ...explicit, source: 'coach' as const };

    // Priority 2: Active enrollment track
    if (enrollment && enrollment.status === 'active') {
      const track = Array.isArray(enrollment.track_snapshot)
        ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        : [];
      const pos = enrollment.track_position || 0;

      // Bounds check
      if (pos >= track.length) return null; // Track complete

      const node = track[pos];

      // Skip milestone/diet nodes (show as rest day)
      if (!node || node.type === 'milestone' || node.type === 'diet') return null;

      if (node.type === 'workout' && node.id) {
        // Find the actual workout from trainer's library
        const trackWorkout = allTrainerWorkouts.find((w: any) => w.id === node.id);
        if (trackWorkout) {
          return {
            ...trackWorkout,
            source: 'track' as const,
            trackPosition: pos,
            trackTotal: track.length,
            enrollmentId: enrollment.id,
            planName: '', // Will be resolved from plan data if available
          };
        }
      }
    }

    return null;
  }, [workouts, enrollment, allTrainerWorkouts]);

  // Advance (or skip) the enrollment by one node. Supabase writes resolve with
  // `{ error }` rather than throwing — the old try/catch here could never fire,
  // so a rejected write still advanced the athlete's season locally and the
  // position silently snapped back on the next refresh.
  const advanceEnrollment = useCallback(async (
    eventType: 'completed' | 'skipped',
  ): Promise<{ result: WriteResult; node?: any }> => {
    if (!enrollment) return { result: { ok: false, error: 'No active enrollment' } };
    const track = Array.isArray(enrollment.track_snapshot)
      ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      : [];
    const node = track[enrollment.track_position];

    // The event row is history, not state — a failure here must not block the
    // athlete's progress, but it should never vanish silently either.
    const { error: eventError } = await supabase.from('track_events').insert({
      enrollment_id: enrollment.id,
      client_id: clientData?.id,
      track_position: enrollment.track_position,
      node_type: node?.type || 'workout',
      node_id: node?.id || null,
      event_type: eventType,
    });
    if (eventError && __DEV__) {
      console.warn('[ClientContext] track_event not recorded:', eventError.message);
    }

    const newPos = enrollment.track_position + 1;
    const isComplete = newPos >= track.length;

    const { error } = await supabase.from('client_plan_enrollments').update({
      track_position: newPos,
      status: isComplete ? 'completed' : 'active',
      completed_at: isComplete ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', enrollment.id);

    if (error) {
      // Local state is deliberately left untouched: the season did not move.
      console.error(`[ClientContext] Failed to advance enrollment (${eventType}):`, error.message);
      return { result: { ok: false, error: error.message }, node };
    }

    setEnrollment((prev: any) => prev ? { ...prev, track_position: newPos, status: isComplete ? 'completed' : 'active' } : null);
    return { result: { ok: true }, node };
  }, [enrollment, clientData]);

  /**
   * @param sessionId  the player's activeWorkout.id (`track-${workouts.id}`) —
   *                   the prefix its sets were logged under in exerciseLogs.
   * @param durationSeconds  real elapsed time from the session timer.
   *
   * Season sessions used to advance the enrollment and DISCARD every logged
   * set — pass athletes had no lift history, empty progress curves, and their
   * coach saw a name with no numbers. The log write mirrors
   * completeWorkoutWithLog: same exercises JSONB, but client_workout_id is
   * null because no client_workouts row exists for a track session —
   * lib/workoutCounts.ts already counts null-client_workout_id logs as
   * sessions, so this is the shape the readers were built for.
   */
  const completeTrackWorkout = useCallback(async (
    sessionId?: string,
    durationSeconds?: number,
  ): Promise<WriteResult> => {
    if (!enrollment || !todayWorkout?.enrollmentId) {
      return { ok: false, error: 'No active season workout' };
    }
    const { result, node } = await advanceEnrollment('completed');
    if (!result.ok) return result;

    // Persist the sets AFTER the enrollment advanced: the advance is the
    // thing the athlete cannot redo, so it must never be blocked by the log
    // write — but a failed log write is still real data loss and logs loudly.
    let completedSets = 0;
    if (sessionId && node?.type === 'workout' && node?.id && clientData) {
      const exercisesJson = buildExercisesJson(sessionId);
      completedSets = exercisesJson.reduce(
        (sum, ex: any) => sum + (ex.sets || []).filter((s: any) => s?.completed).length, 0);
      if (exercisesJson.length > 0) {
        const { error: logError } = await supabase.from('client_workout_logs').insert({
          client_id: clientData.id,
          client_workout_id: null,
          workout_id: node.id,
          exercises: exercisesJson,
          ...(durationSeconds && durationSeconds > 0
            ? { duration_minutes: Math.round(durationSeconds / 60) }
            : {}),
        });
        if (logError && isMissingSchemaError(logError)) {
          if (__DEV__) console.warn('[ClientContext] Season log skipped (migration pending):', logError.message);
          completedSets = 0; // not stored — do not claim it to the coach
        } else if (logError) {
          console.error('[ClientContext] Season workout log NOT saved:', logError.message);
          completedSets = 0;
        }
      }
    }

    // Tell the coach — with the real stored set count when there is one.
    if (node?.type === 'workout' && node?.id) {
      const trackWorkout = allTrainerWorkouts.find((w: any) => w.id === node.id);
      notifyCoachWorkoutDone(trackWorkout?.name, completedSets);
    }
    return result;
  }, [enrollment, todayWorkout, advanceEnrollment, allTrainerWorkouts, notifyCoachWorkoutDone, clientData, buildExercisesJson]);

  const skipTrackWorkout = useCallback(async (): Promise<WriteResult> => {
    if (!enrollment) return { ok: false, error: 'No active enrollment' };
    const { result } = await advanceEnrollment('skipped');
    return result;
  }, [enrollment, advanceEnrollment]);

  const updateAssessment = useCallback(async (assessmentData: any) => {
    if (!clientData) return;
    const { data, error } = await supabase
      .from('clients')
      .update({ assessment_data: assessmentData })
      .eq('id', clientData.id)
      .select()
      .single();
    if (error) throw error;
    setClientData(data);
  }, [clientData]);

  const updateClientAvatar = useCallback(async (base64: string, uri: string) => {
    if (!clientData || !user) return;
    
    const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${user.id}/avatar.${fileExt}`;
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';
    const binaryStr = decode(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) { bytes[i] = binaryStr.charCodeAt(i); }

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, bytes.buffer, { contentType, upsert: true });
      
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    const avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;
    
    const { data, error } = await supabase
      .from('clients')
      .update({ avatar_url })
      .eq('id', clientData.id)
      .select()
      .single();
      
    if (error) throw error;
    setClientData(data);
  }, [clientData, user]);

  const logProgress = useCallback(async (data: { weight?: number; bodyFat?: number; measurements?: any; notes?: string }) => {
    if (!clientData) return;
    const { error } = await supabase.from('client_progress').insert({
      client_id: clientData.id,
      trainer_id: clientData.trainer_id,
      date: new Date().toISOString().split('T')[0],
      weight: data.weight ?? null,
      body_fat: data.bodyFat ?? null,
      measurements: data.measurements ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw error;
    await refreshData();
  }, [clientData, refreshData]);

  const cancelSubscription = useCallback(async () => {
    if (!clientData) return;
    const { data, error } = await supabase.functions.invoke('cancel-subscription', {
      body: { clientId: clientData.id }
    });
    if (error) throw error;
    await refreshData();
  }, [clientData, refreshData]);

  const setupPaymentMethod = useCallback(async () => {
    if (!clientData) throw new Error("No client data");
    const { data, error } = await supabase.functions.invoke('create-setup-intent', {
      body: { clientId: clientData.id }
    });
    if (error) throw error;
    return data;
  }, [clientData]);

  const toggleHealthSharing = useCallback(async (enabled: boolean) => {
    if (!clientData) return;
    const { error } = await supabase
      .from('clients')
      .update({ health_sharing_enabled: enabled })
      .eq('id', clientData.id);
    if (error) throw error;

    setHealthSharingEnabled(enabled);
    setClientData((prev) => prev ? { ...prev, health_sharing_enabled: enabled } as any : prev);

    if (!enabled) {
      // Withdrawing consent removes what was already shared, not just future
      // syncs. Retried once; a failure is reported (dev) but does not undo
      // the flag — the coach-side read is gated on the flag regardless.
      const wipe = () => supabase.from('client_health_snapshots').delete().eq('client_id', clientData.id);
      let { error: wipeError } = await wipe();
      if (wipeError) ({ error: wipeError } = await wipe());
      if (wipeError && __DEV__) {
        console.warn('[ClientContext] Health snapshots not deleted after opting out:', wipeError.message);
      }
    }
    // Turning ON: HealthContext watches healthSharingEnabled and syncs on the
    // rising edge (it sits below this provider, so it cannot be called here).
  }, [clientData]);

  const checkInGym = useCallback(async () => {
    if (!clientData) return;
    const { data, error } = await supabase
      .from('gym_visits')
      .insert({ client_id: clientData.id })
      .select()
      .single();
      
    if (error) throw error;
    setActiveGymVisit(data);
    
    // Schedule smart reminders. Only READ the permission here — firing the
    // system prompt off the back of a gym check-in is a cold ask in the middle
    // of an unrelated action, and it would race the primed ask in AuthContext
    // for the single prompt iOS allows.
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') {
      await Notifications.scheduleNotificationAsync({
        content: { title: "Still at the gym? 🏋️‍♂️", body: "You've been checked in for 1 hour!" },
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 3600 
        },
      });
      await Notifications.scheduleNotificationAsync({
        content: { title: "Gym Check-in Active ⏰", body: "You've been checked in for 2 hours. Don't forget to check out!" },
        trigger: { 
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 7200 
        },
      });
    }
  }, [clientData]);

  const checkOutGym = useCallback(async () => {
    if (!clientData || !activeGymVisit) return;
    const now = new Date();
    const checkInTime = new Date(activeGymVisit.check_in_time);
    const durationMinutes = Math.round((now.getTime() - checkInTime.getTime()) / 60000);
    
    const { error } = await supabase
      .from('gym_visits')
      .update({ check_out_time: now.toISOString(), duration_minutes: durationMinutes })
      .eq('id', activeGymVisit.id);
      
    if (error) throw error;
    setActiveGymVisit(null);
    
    // Cancel all scheduled reminders
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // XP retired — written, read nowhere (see the note in
    // completeWorkoutWithLog). The coach activity keeps the real facts and
    // drops the XP claim, which described a number no screen ever showed.
    const { error: activityError } = await supabase.from('activities').insert({
      trainer_id: clientData.trainer_id,
      type: 'workout_completed',
      message: `${clientData.name} checked out of the gym. Duration: ${durationMinutes} mins`,
    });
    if (activityError && __DEV__) {
      console.warn('[ClientContext] Coach activity not recorded:', activityError.message);
    }

    refreshData();
  }, [clientData, activeGymVisit, refreshData]);

  // Returns true if this weight is a new all-time PR for the given exercise.
  // Immediately updates the in-memory PR map so the same exercise can't trigger twice in one session.
  const checkAndUpdatePr = useCallback((exerciseId: string, weight: number): boolean => {
    if (!exerciseId || weight <= 0) return false;
    const current = exercisePrs[exerciseId] ?? 0;
    if (weight > current) {
      setExercisePrs(prev => ({ ...prev, [exerciseId]: weight }));
      return true;
    }
    return false;
  }, [exercisePrs]);

  /**
   * The one app-wide definition of "workouts completed" (lib/workoutCounts.ts),
   * applied to rows this provider has already fetched: `workouts` is the
   * athlete's client_workouts, `workoutLogRows` their session logs. No extra
   * query, and it matches exactly what the coach roster shows for them.
   */
  const completedWorkoutCount = useMemo(() => {
    if (workoutLogRows === null) return null;
    return countCompletedWorkoutsForClient(workouts as any, workoutLogRows);
  }, [workouts, workoutLogRows]);

  return (
    <ClientContext.Provider value={{
      loading, clientData, trainer, sessions, workouts, diets, progressLogs,
      conversation, plans, upcomingSessions, todayWorkout, enrollment, exerciseLogs, exercisePrs,
      completedWorkoutCount,
      subscription, paymentHistory, healthSharingEnabled, activeGymVisit,
        logExerciseSet,
        checkAndUpdatePr,
        clearExerciseLogs,
        completeWorkoutWithLog,
        markWorkoutComplete,
        markWorkoutSkipped,
        rescheduleWorkoutToToday,
        completeTrackWorkout,
        skipTrackWorkout,
        advanceEnrollment,
        mealLogs,
        logMealEaten,
        unlogMeal,
        updateAssessment, updateClientAvatar, logProgress, cancelSubscription, setupPaymentMethod, toggleHealthSharing, refreshData,
      checkInGym, checkOutGym,
    }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useClient must be used within ClientProvider');
  return context;
}
