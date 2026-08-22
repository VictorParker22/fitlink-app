import { createContext, useContext, useState, useEffect, useCallback, useMemo, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { loadSnapshot, saveSnapshot } from '../lib/offlineCache';
import { useAuth } from './AuthContext';
import { Colors } from '../constants/theme';
import { isMissingSchemaError } from '../lib/schemaErrors';
import { buildCompletedWorkoutCounts } from '../lib/workoutCounts';

interface Trainer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  bio?: string;
  specialization?: string;
  certifications?: string;
  working_hours?: any;
  notification_prefs?: any;
  avatar_url?: string;
  /** Hero photo (coach-media bucket) — the athlete-facing card image. */
  cover_url?: string;
  stripe_account_id?: string;
  stripe_onboarding_complete?: boolean;
  stripe_charges_enabled?: boolean;
  referral_code?: string;
}

export interface Client {
  id: string;
  trainer_id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'active' | 'trial' | 'inactive';
  plan_id?: string;
  notes?: string;
  /**
   * WRITE-ONLY. There is no `goals` column on public.clients; updateClient
   * translates this into assessment_data.fitness_goals. Reading it back always
   * yields undefined — use lib/clientGoals.ts instead.
   */
  goals?: string;
  avatar_url?: string;
  assessment_data?: any;
  trial_end_date?: string;
  /**
   * `completed_workouts` used to be declared here. It is GONE — public.clients
   * has no such column, so it only ever arrived as undefined and every screen
   * that read it showed 0 forever. Use `completedWorkoutCounts` from this
   * context (lib/workoutCounts.ts) for the real number. Do not re-add it.
   */
  progress?: { streak: number; workoutsThisMonth: number };
  xp?: number;
  created_at: string;
}

interface Session {
  id: string;
  trainer_id: string;
  client_id?: string;
  group_name?: string;
  date: string;
  duration: number;
  type: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  notes?: string;
}

interface Activity {
  id: string;
  trainer_id: string;
  type: string;
  message: string;
  timestamp: string;
}

export interface TrackNode {
  type: 'workout' | 'diet' | 'milestone' | 'class';
  id?: string; // workout_id, diet_plan_id, or class_id
  label?: string; // for milestones
  order: number;
}

export interface PlanEnrollment {
  id: string;
  client_id: string;
  plan_id: string;
  track_snapshot: TrackNode[];
  track_position: number;
  status: 'active' | 'paused' | 'completed';
  started_at: string;
  completed_at?: string;
  paused_at?: string;
  sync_with_plan: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassItem {
  id: string;
  trainer_id: string;
  title: string;
  description?: string;
  category: string;
  tags: string[];
  difficulty: string;
  duration_minutes: number;
  video_url?: string;
  thumbnail_url?: string;
  equipment: string[];
  is_free: boolean;
  plan_id?: string;
  workout_id?: string;
  status: 'draft' | 'published' | 'archived';
  take_count: number;
  total_watch_minutes: number;
  avg_rating: number;
  rating_count: number;
  created_at: string;
}

export interface LiveClassItem {
  id: string;
  trainer_id: string;
  title: string;
  description?: string;
  scheduled_for: string;
  mux_playback_id?: string;
  status: 'scheduled' | 'live' | 'ended' | 'cancelled';
  went_live_at?: string;       // set by trigger when status → 'live'; used for stream_offset_ms
  viewer_count?: number;       // atomic increment/decrement via RPC; reconciled by cron
  category?: string;           // used when promoting stream recording to VOD
  duration_minutes?: number;   // used when promoting stream recording to VOD
  created_at: string;
  updated_at: string;
}


interface Plan {
  id: string;
  trainer_id: string;
  name: string;
  price: number;
  period: string;
  features?: string[];
  color?: string;
  is_popular?: boolean;
  stripe_price_id?: string;
  stripe_product_id?: string;
  track?: TrackNode[];
  // Autoflow
  autoflow_enabled?: boolean;
  autoflow_workout_id?: string | null;
  autoflow_welcome_message?: string | null;
  // Season builder (added by supabase/migrations/add_plan_season_fields.sql)
  description?: string | null;
  duration_weeks?: number | null;
  season_settings?: Record<string, any> | null;
  // Cohort programs (added by supabase/migrations/add_cohort_programs.sql).
  // starts_on set ⇒ this pass is a cohort; null ⇒ evergreen, athlete-paced.
  starts_on?: string | null;
  enrollment_closes?: string | null;
  capacity?: number | null;
}

export interface PlanSeasonExtras {
  description?: string;
  /** Pass card photo (coach-media bucket) — COACH_IDENTITY_PLAN.md Phase 2. */
  cover_url?: string | null;
  duration_weeks?: number;
  season_settings?: Record<string, any>;
  starts_on?: string | null;
  enrollment_closes?: string | null;
  capacity?: number | null;
}

/** Columns from add_cohort_programs.sql — dropped first when the DB predates it. */
const COHORT_EXTRA_KEYS = ['starts_on', 'enrollment_closes', 'capacity'] as const;

interface Referral {
  id: string;
  trainer_id: string;
  name: string;
  status: string;
  reward?: number;
  date: string;
}

interface Exercise {
  id: string;
  name: string;
  category: string;
  muscle_group: string;
  equipment?: string;
  trainer_id?: string | null;
  is_custom?: boolean;
  instructions?: string;
  image_url?: string;
  description?: string;
  difficulty?: string;
  secondary_muscles?: string[];
}

interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  rest_seconds: number;
  order_index: number;
  video_url?: string;
  notes?: string;
  group_id?: string;
  group_type?: string;
  exercises?: Exercise;
}

interface Workout {
  id: string;
  trainer_id: string;
  name: string;
  description?: string;
  created_at?: string;
  workout_exercises?: WorkoutExercise[];
}

interface ClientWorkout {
  id: string;
  client_id: string;
  workout_id: string;
  assigned_date: string;
  status: string;
}

interface Meal {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  trainer_id?: string | null;
  is_custom?: boolean;
  serving_size_g?: number;
  fiber?: number;
  sugar?: number;
  sodium_mg?: number;
  image_url?: string;
}

interface DietPlanMeal {
  id: string;
  diet_plan_id: string;
  meal_id: string;
  order_index: number;
  meal_time?: string;  // 'breakfast' | 'lunch' | 'dinner' | 'snack'
  servings?: number;
  meals?: Meal;
}

// -- Week structure / swaps JSON shapes (diet_plans.week_structure, diet_plans.swaps) --
// See supabase/migrations/add_diet_week_structure.sql for the canonical documentation.
export interface DietRestMealSnapshot {
  meal_id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  meal_time: string;
  servings: number;
  slotLabel: string;
}

export interface DietWeekStructure {
  mealsPerDay: number;
  slotLabels: string[];
  trainingDays: string[]; // 'mon'..'sun'
  restVariant: { mealList: DietRestMealSnapshot[] };
  freeMeal: { enabled: boolean; day: string } | null;
}

// Keyed by the training-day meal's order_index in diet_plan_meals.
export type DietSwapsMap = Record<string, { allowedMealIds: string[]; allowOwnLog: boolean }>;

export interface DietPlanExtras {
  week_structure?: DietWeekStructure | null;
  swaps?: DietSwapsMap | null;
}

interface DietPlan {
  id: string;
  trainer_id: string;
  name: string;
  description?: string;
  category?: string;  // 'balanced' | 'high-protein' | 'keto' | 'vegan' | 'weight-loss' | 'custom'
  target_calories?: number;
  target_protein?: number;
  target_carbs?: number;
  target_fat?: number;
  image_url?: string;
  created_at?: string;
  diet_plan_meals?: DietPlanMeal[];
  week_structure?: DietWeekStructure | null;
  swaps?: DietSwapsMap | null;
}

interface ClientDiet {
  id: string;
  client_id: string;
  diet_plan_id: string;
  assigned_date: string;
  status: string;
}

export interface NotificationData {
  id: string;
  trainer_id: string;
  type: 'message' | 'score' | 'water' | 'workout' | 'nutrition' | 'file';
  title: string;
  description: string;
  metadata: any;
  is_read: boolean;
  created_at: string;
}

export interface ProgressLog {
  id: string;
  client_id: string;
  trainer_id: string;
  date: string;
  weight: number | null;
  body_fat: number | null;
  measurements: any;
  photos: string[];
  notes: string | null;
  created_at: string;
}

type CreateClassData = Omit<ClassItem, 'id' | 'trainer_id' | 'take_count' | 'total_watch_minutes' | 'avg_rating' | 'rating_count' | 'created_at'>;

interface AppContextType {
  loading: boolean;
  trainer: Trainer | null;
  clients: Client[];
  sessions: Session[];
  activities: Activity[];
  plans: Plan[];
  referrals: Referral[];
  workouts: Workout[];
  exercises: Exercise[];
  autoAddExerciseId: string | null;
  setAutoAddExerciseId: (id: string | null) => void;
  diets: DietPlan[];
  meals: Meal[];
  notifications: NotificationData[];
  /**
   * Habit rows received over realtime, keyed `${client_id}:${date}`.
   * Overlay these on top of any locally-fetched client_habits rows so the
   * coach heatmap/sheet reflects athlete check-offs without pull-to-refresh.
   * Empty until the realtime publication migration is run — everything still
   * works, just without live updates.
   */
  liveHabitRows: Record<string, any>;
  classes: ClassItem[];
  liveClasses: LiveClassItem[];
  clientWorkouts: ClientWorkout[];
  clientDiets: ClientDiet[];
  /**
   * clientId → workouts completed, per the single definition in
   * lib/workoutCounts.ts. Built once from data already in memory, so the roster
   * can render a real number for every row without a query per row.
   * `null` until the underlying rows have loaded — surfaces must OMIT the stat
   * while it is null rather than show a placeholder 0.
   */
  completedWorkoutCounts: Record<string, number> | null;
  progressLogs: ProgressLog[];

  // Computed
  activeClients: Client[];
  trialClients: Client[];
  inactiveClients: Client[];
  todaySessions: Session[];
  upcomingSessions: Session[];
  totalReferrals: number;
  totalMonthlyRevenue: number;

  // Operations
  addClient: (data: Partial<Client>) => Promise<Client>;
  updateClient: (id: string, updates: Partial<Client>) => Promise<Client>;
  upgradeClientToPlan: (clientId: string, planId: string) => Promise<void>;
  extendClientTrial: (clientId: string, days: number) => Promise<void>;
  updateClientAssessment: (clientId: string, assessmentData: any) => Promise<void>;
  getClientById: (id: string) => Client | undefined;
  enrollClientInPlan: (clientId: string, planId: string) => Promise<PlanEnrollment>;
  pauseEnrollment: (enrollmentId: string) => Promise<void>;
  resumeEnrollment: (enrollmentId: string) => Promise<void>;
  getClientEnrollment: (clientId: string) => Promise<PlanEnrollment | null>;
  addSession: (data: Partial<Session>) => Promise<Session>;
  updateSession: (id: string, updates: Partial<Session>) => Promise<Session>;
  getSessionsForDate: (date: Date) => Session[];
  getClientSessions: (clientId: string) => Session[];
  updateTrainer: (updates: Partial<Trainer>) => Promise<Trainer>;
  createPlan: (name: string, price: number, period: string, features?: string[], color?: string, isPopular?: boolean, extras?: PlanSeasonExtras) => Promise<Plan>;
  updatePlan: (planId: string, updates: Partial<Pick<Plan, 'name' | 'price' | 'period' | 'description' | 'duration_weeks' | 'season_settings' | 'starts_on' | 'enrollment_closes' | 'capacity'>> & { cover_url?: string | null }) => Promise<Plan>;
  updatePlanTrack: (planId: string, track: TrackNode[]) => Promise<void>;
  createExercise: (name: string, category: string, muscleGroup: string, equipment?: string, instructions?: string, imageUrl?: string) => Promise<Exercise>;
  updateExercise: (id: string, name: string, category: string, muscleGroup: string, equipment?: string, instructions?: string, imageUrl?: string) => Promise<Exercise>;
  importExercise: (exData: { name: string; category: string; muscle_group: string; equipment: string; image_url?: string | null; instructions?: string }) => Promise<Exercise>;
  createWorkout: (name: string, description: string, exercises: { exercise_id: string; sets: number; reps: number; rest_seconds: number; video_url?: string; notes?: string; group_id?: string; group_type?: string }[]) => Promise<Workout>;
  updateWorkout: (id: string, name: string, description: string, exercises: { exercise_id: string; sets: number; reps: number; rest_seconds: number; video_url?: string; notes?: string; group_id?: string; group_type?: string }[]) => Promise<Workout>;
  deleteWorkout: (id: string) => Promise<void>;
  duplicateWorkout: (id: string) => Promise<Workout>;
  assignWorkout: (workoutId: string, clientId: string, date: string) => Promise<void>;
  createMeal: (meal: Partial<Meal>, isGlobal?: boolean) => Promise<Meal>;
  createDietPlan: (name: string, description: string, mealList: { meal_id: string; meal_time?: string; servings?: number }[], category?: string, targets?: { calories: number; protein: number; carbs: number; fat: number }, imageUrl?: string | null, extras?: DietPlanExtras) => Promise<DietPlan>;
  updateDietPlan: (id: string, name: string, description: string, mealList: { meal_id: string; meal_time?: string; servings?: number }[], category?: string, targets?: { calories: number; protein: number; carbs: number; fat: number }, imageUrl?: string | null, extras?: DietPlanExtras) => Promise<DietPlan>;
  duplicateDietPlan: (id: string) => Promise<DietPlan>;
  deleteDietPlan: (id: string) => Promise<void>;
  assignDietPlan: (dietPlanId: string, clientId: string, date: string) => Promise<void>;
  getClientWorkouts: (clientId: string) => { assignment: ClientWorkout; workout: Workout }[];
  getClientDiets: (clientId: string) => { assignment: ClientDiet; diet: DietPlan }[];
  getClientProgress: (clientId: string) => ProgressLog[];
  addProgressLog: (log: Partial<ProgressLog>) => Promise<ProgressLog>;
  deleteProgressLog: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  updatePushToken: (token: string) => Promise<void>;
  getClientHealthSnapshot: (clientId: string) => any | null;
  requestHealthAccess: (clientId: string) => Promise<void>;
  createClass: (data: CreateClassData) => Promise<ClassItem>;
  updateClass: (id: string, data: Partial<ClassItem>) => Promise<ClassItem>;
  deleteClass: (id: string) => Promise<void>;
  publishClass: (id: string) => Promise<void>;
  createLiveClass: (data: Omit<LiveClassItem, 'id' | 'trainer_id' | 'mux_playback_id' | 'status' | 'went_live_at' | 'viewer_count' | 'created_at' | 'updated_at'>) => Promise<LiveClassItem>;
  updateLiveClass: (id: string, data: Partial<LiveClassItem>) => Promise<LiveClassItem>;
  deleteLiveClass: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
  refreshClients: () => Promise<void>;
  refreshPlans: () => Promise<void>;
  refreshSessions: (data: Session[]) => void;
  createStripeConnectAccount: () => Promise<{ url: string; accountId: string }>;
  fetchAnalytics: () => Promise<{
    growth: any[];
    sessionStats: any[];
    sessionTypes: any[];
    revenue: any;
  }>;
}

const AppContext = createContext<AppContextType | null>(null);

/** Missing table/column, i.e. a migration that has not run — never a real failure. */
const isMissingSchema = (e: any) =>
  isMissingSchemaError(e) || /column .* does not exist/i.test(e?.message || '');

/**
 * Coach activity-feed rows are telemetry: a failure must never break the
 * operation that produced them, but it should not vanish without a trace
 * either. Supabase writes resolve with `{ error }` instead of throwing.
 */
async function logActivity(row: { trainer_id: string; type: string; message: string }) {
  const { error } = await supabase.from('activities').insert(row);
  if (error && __DEV__) console.warn('[AppContext] Activity not recorded:', error.message);
}

const sanitizeEquipment = (eq?: string): string | null => {
  if (!eq || eq.toLowerCase() === 'none') return null;
  const e = eq.toLowerCase();
  if (e.includes('barbell')) return 'barbell';
  if (e.includes('dumbbell')) return 'dumbbell';
  if (e.includes('machine')) return 'machine';
  if (e.includes('cable')) return 'cable';
  if (e.includes('kettlebell')) return 'kettlebell';
  if (e.includes('band')) return 'band';
  if (e.includes('bodyweight')) return 'bodyweight';
  if (e.includes('plate')) return 'plate';
  return null;
};

export const sanitizeCategory = (cat?: string): string => {
  if (!cat) return 'full body';
  const c = cat.toLowerCase();
  if (c.includes('chest')) return 'chest';
  if (c.includes('back')) return 'back';
  if (c.includes('leg') || c.includes('calv')) return 'legs';
  if (c.includes('arm')) return 'arms';
  if (c.includes('shoulder')) return 'shoulders';
  if (c.includes('ab') || c.includes('core')) return 'core';
  if (c.includes('cardio')) return 'cardio';
  if (c.includes('flex')) return 'flexibility';
  return 'full body';
};

export function AppProvider({ children }: PropsWithChildren) {
  const { user, signOut } = useAuth();
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [autoAddExerciseId, setAutoAddExerciseId] = useState<string | null>(null);
  const [diets, setDiets] = useState<DietPlan[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [clientWorkoutsList, setClientWorkoutsList] = useState<ClientWorkout[]>([]);
  const [clientDietsList, setClientDietsList] = useState<ClientDiet[]>([]);
  /**
   * Only the two columns needed to count sessions — never the exercises JSONB,
   * which would be megabytes across a whole roster. null = not loaded yet.
   */
  const [workoutLogRows, setWorkoutLogRows] = useState<
    { client_id: string; client_workout_id: string | null }[] | null
  >(null);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
  const [clientHealthSnapshots, setClientHealthSnapshots] = useState<any[]>([]);
  const [liveHabitRows, setLiveHabitRows] = useState<Record<string, any>>({});
  const [trainerClasses, setTrainerClasses] = useState<ClassItem[]>([]);
  const [liveClassesList, setLiveClassesList] = useState<LiveClassItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all data when user is authenticated
  useEffect(() => {
    if (!user) {
      setTrainer(null);
      setClients([]);
      setPlans([]);
      setReferrals([]);
      setSessions([]);
      setActivities([]);
      setLiveHabitRows({});
      setWorkoutLogRows(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    const uid = user.id;

    // Hydrate core lists from the last-known-good snapshot so screens render
    // instantly (and keep rendering in airplane mode). Functional setters keep
    // network data if the fetch somehow lands first. Returns true when
    // anything hydrated so fetchAll can skip the loading gate.
    async function hydrateFromCache(): Promise<boolean> {
      const [t, c, s, p, w, d, n] = await Promise.all([
        loadSnapshot<Trainer>(uid, 'trainer'),
        loadSnapshot<Client[]>(uid, 'clients'),
        loadSnapshot<Session[]>(uid, 'sessions'),
        loadSnapshot<Plan[]>(uid, 'plans'),
        loadSnapshot<Workout[]>(uid, 'workouts'),
        loadSnapshot<DietPlan[]>(uid, 'diets'),
        loadSnapshot<NotificationData[]>(uid, 'notifications'),
      ]);
      if (!mounted) return false;
      let any = false;
      if (t) { setTrainer((prev) => prev ?? t); any = true; }
      if (c?.length) { setClients((prev) => (prev.length ? prev : c)); any = true; }
      if (s?.length) { setSessions((prev) => (prev.length ? prev : s)); any = true; }
      if (p?.length) { setPlans((prev) => (prev.length ? prev : p)); any = true; }
      if (w?.length) { setWorkouts((prev) => (prev.length ? prev : w)); any = true; }
      if (d?.length) { setDiets((prev) => (prev.length ? prev : d)); any = true; }
      if (n?.length) { setNotifications((prev) => (prev.length ? prev : n)); any = true; }
      return any;
    }

    async function fetchAll(hydrated: boolean) {
      // Only gate on the spinner when there is truly nothing to show yet.
      if (!hydrated) setLoading(true);
      try {
        const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes, workoutsRes, exercisesRes, dietsRes, mealsRes, notifRes, cwRes, cdRes, progressRes, healthSnapshotsRes, classesRes, liveClassesRes, logsRes] = await Promise.all([
          supabase.from('trainers').select('*').eq('id', user!.id).single(),
          supabase.from('clients').select('*').eq('trainer_id', user!.id).order('created_at', { ascending: false }),
          supabase.from('plans').select('*').eq('trainer_id', user!.id).order('price'),
          supabase.from('sessions').select('*').eq('trainer_id', user!.id).order('date'),
          supabase.from('referrals').select('*').eq('trainer_id', user!.id).order('date', { ascending: false }),
          supabase.from('activities').select('*').eq('trainer_id', user!.id).order('timestamp', { ascending: false }).limit(20),
          supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').eq('trainer_id', user!.id).order('created_at', { ascending: false }),
          supabase.from('exercises').select('*').or(`is_custom.eq.false,trainer_id.eq.${user!.id}`).order('name'),
          supabase.from('diet_plans').select('*, diet_plan_meals(*, meals(*))').eq('trainer_id', user!.id).order('created_at', { ascending: false }),
          supabase.from('meals').select('*').or(`is_custom.eq.false,trainer_id.eq.${user!.id}`).order('name'),
          supabase.from('notifications').select('*').eq('trainer_id', user!.id).order('created_at', { ascending: false }),
          supabase.from('client_workouts').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user!.id).order('assigned_date', { ascending: false }),
          supabase.from('client_diets').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user!.id).order('assigned_date', { ascending: false }),
          supabase.from('client_progress').select('*').eq('trainer_id', user!.id).order('date', { ascending: false }),
          supabase.from('client_health_snapshots').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user!.id).order('date', { ascending: false }),
          supabase.from('classes').select('*').eq('trainer_id', user!.id).order('created_at', { ascending: false }),
          supabase.from('live_classes').select('*').eq('trainer_id', user!.id).order('scheduled_for', { ascending: true }),
          // ONE query for the whole roster's session logs — two narrow columns,
          // never the exercises JSONB. Counting happens in memory afterwards so
          // no row on the athletes list fires a query of its own.
          supabase.from('client_workout_logs')
            .select('client_id, client_workout_id, clients!inner(trainer_id)')
            .eq('clients.trainer_id', user!.id),
        ]);

        if (!mounted) return;
        if (trainerRes.data) setTrainer(trainerRes.data);
        if (clientsRes.data) setClients(clientsRes.data);
        if (plansRes.data) setPlans(plansRes.data);
        if (sessionsRes.data) setSessions(sessionsRes.data);
        if (referralsRes.data) setReferrals(referralsRes.data);
        if (activitiesRes.data) setActivities(activitiesRes.data);
        if (workoutsRes.data) setWorkouts(workoutsRes.data);
        if (exercisesRes.data) setExercises(exercisesRes.data);
        // Guarded sets: a failed fetch (offline, table missing pre-migration)
        // must never wipe hydrated snapshot state back to empty arrays.
        if (dietsRes.data) setDiets(dietsRes.data);
        if (mealsRes.data) setMeals(mealsRes.data);
        if (notifRes.data) setNotifications(notifRes.data);
        if (cwRes.data) setClientWorkoutsList(cwRes.data);
        if (cdRes.data) setClientDietsList(cdRes.data);
        // Progress logs might fail if migration not run yet, handle gracefully
        if (progressRes && progressRes.data) setProgressLogs(progressRes.data);
        if (healthSnapshotsRes && healthSnapshotsRes.data) setClientHealthSnapshots(healthSnapshotsRes.data);
        if (classesRes.data) setTrainerClasses(classesRes.data);
        if (liveClassesRes?.data) setLiveClassesList(liveClassesRes.data);
        // Stays null on failure so the roster omits the stat instead of
        // claiming everyone has completed zero workouts.
        if (logsRes?.data) setWorkoutLogRows(logsRes.data as any);

        // Re-save the offline snapshot after every successful fetch.
        if (trainerRes.data) saveSnapshot(uid, 'trainer', trainerRes.data);
        if (clientsRes.data) saveSnapshot(uid, 'clients', clientsRes.data);
        if (sessionsRes.data) saveSnapshot(uid, 'sessions', sessionsRes.data);
        if (plansRes.data) saveSnapshot(uid, 'plans', plansRes.data);
        if (workoutsRes.data) saveSnapshot(uid, 'workouts', workoutsRes.data);
        if (dietsRes.data) saveSnapshot(uid, 'diets', dietsRes.data);
        if (notifRes.data) saveSnapshot(uid, 'notifications', notifRes.data);
      } catch (err) {
        if (__DEV__) console.error('Error fetching data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    (async () => {
      const hydrated = await hydrateFromCache();
      if (mounted && hydrated) setLoading(false);
      await fetchAll(hydrated);
    })();
    return () => { mounted = false; };
  }, [user]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes, workoutsRes, exercisesRes, dietsRes, mealsRes, notifRes, cwRes, cdRes, logsRes] = await Promise.all([
      supabase.from('trainers').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('*').eq('trainer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('trainer_id', user.id).order('price'),
      supabase.from('sessions').select('*').eq('trainer_id', user.id).order('date'),
      supabase.from('referrals').select('*').eq('trainer_id', user.id).order('date', { ascending: false }),
      supabase.from('activities').select('*').eq('trainer_id', user.id).order('timestamp', { ascending: false }).limit(20),
      supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').eq('trainer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('exercises').select('*').or(`is_custom.eq.false,trainer_id.eq.${user.id}`).order('name'),
      supabase.from('diet_plans').select('*, diet_plan_meals(*, meals(*))').eq('trainer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('meals').select('*').or(`is_custom.eq.false,trainer_id.eq.${user.id}`).order('name'),
      supabase.from('notifications').select('*').eq('trainer_id', user.id).order('created_at', { ascending: false }),
      supabase.from('client_workouts').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user.id).order('assigned_date', { ascending: false }),
      supabase.from('client_diets').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user.id).order('assigned_date', { ascending: false }),
      supabase.from('client_workout_logs')
        .select('client_id, client_workout_id, clients!inner(trainer_id)')
        .eq('clients.trainer_id', user.id),
    ]);

    // Check if health snapshots table exists/returned data
    const hsRes = await supabase.from('client_health_snapshots').select('*, clients!inner(trainer_id)').eq('clients.trainer_id', user.id).order('date', { ascending: false });
    if (hsRes.data) setClientHealthSnapshots(hsRes.data);

    if (trainerRes.data) setTrainer(trainerRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    if (plansRes.data) setPlans(plansRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (referralsRes.data) setReferrals(referralsRes.data);
    if (activitiesRes.data) setActivities(activitiesRes.data);
    if (workoutsRes.data) setWorkouts(workoutsRes.data);
    if (exercisesRes.data) setExercises(exercisesRes.data);
    if (dietsRes.data) setDiets(dietsRes.data);
    if (mealsRes.data) setMeals(mealsRes.data);
    if (notifRes.data) setNotifications(notifRes.data);
    if (cwRes.data) setClientWorkoutsList(cwRes.data);
    if (cdRes.data) setClientDietsList(cdRes.data);
    if (logsRes?.data) setWorkoutLogRows(logsRes.data as any);

    // Keep the offline snapshot fresh.
    if (trainerRes.data) saveSnapshot(user.id, 'trainer', trainerRes.data);
    if (clientsRes.data) saveSnapshot(user.id, 'clients', clientsRes.data);
    if (sessionsRes.data) saveSnapshot(user.id, 'sessions', sessionsRes.data);
    if (plansRes.data) saveSnapshot(user.id, 'plans', plansRes.data);
    if (workoutsRes.data) saveSnapshot(user.id, 'workouts', workoutsRes.data);
    if (dietsRes.data) saveSnapshot(user.id, 'diets', dietsRes.data);
    if (notifRes.data) saveSnapshot(user.id, 'notifications', notifRes.data);
    
    // Check if progress table exists/returned data
    const pRes = await supabase.from('client_progress').select('*').eq('trainer_id', user.id).order('date', { ascending: false });
    if (pRes.data) setProgressLogs(pRes.data);

    // Refresh classes
    if (user) {
      const [clsRes, liveClsRes] = await Promise.all([
        supabase.from('classes').select('*').eq('trainer_id', user.id).order('created_at', { ascending: false }),
        supabase.from('live_classes').select('*').eq('trainer_id', user.id).order('scheduled_for', { ascending: true })
      ]);
      if (clsRes.data) setTrainerClasses(clsRes.data);
      if (liveClsRes.data) setLiveClassesList(liveClsRes.data);
    }
  }, [user]);

  // Lightweight refresh — only clients table (1 query, 1 setState)
  const refreshClients = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('trainer_id', user.id)
      .order('created_at', { ascending: false });
    if (data) {
      setClients(data);
      saveSnapshot(user.id, 'clients', data);
    }
  }, [user]);

  // Lightweight refresh — only plans table (1 query, 1 setState)
  const refreshPlans = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('plans')
      .select('*')
      .eq('trainer_id', user.id)
      .order('price');
    if (data) {
      setPlans(data);
      saveSnapshot(user.id, 'plans', data);
    }
  }, [user]);

  // Ultra-lightweight: just set sessions from pre-fetched data
  const refreshSessions = useCallback((data: Session[]) => {
    setSessions(data);
  }, []);

  // --- Realtime Subscriptions ---
  useEffect(() => {
    if (!user) return;

    const notifChannel = supabase
      .channel('public:notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `trainer_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as NotificationData, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `trainer_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? (payload.new as NotificationData) : n))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notifChannel);
    };
  }, [user]);

  // --- Realtime: sessions + weight logs (coach-scoped tables) ---
  // Same pattern as the notifications channel above. Payloads carry the full
  // row, so we merge directly into state — no refetch, no API burst to debounce.
  // Requires the tables to be in the supabase_realtime publication
  // (supabase/migrations/enable_realtime_magic.sql); until that migration runs
  // these channels simply never fire and the app behaves as before.
  useEffect(() => {
    if (!user) return;

    const coachChannel = supabase
      .channel(`coach_sync_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sessions', filter: `trainer_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Session;
          setSessions((prev) => {
            if (prev.some((s) => s.id === row.id)) return prev; // already added optimistically
            return [...prev, row].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `trainer_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as Session;
          setSessions((prev) => prev.map((s) => (s.id === row.id ? row : s)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_progress', filter: `trainer_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as ProgressLog;
          setProgressLogs((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [row, ...prev];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(coachChannel);
    };
  }, [user]);

  // --- Realtime: client_habits (client-owned table, no trainer_id column) ---
  // Scoped with an `in` filter over the coach's current client ids; the channel
  // re-subscribes when the roster changes. RLS already limits events to rows
  // the coach can read, the filter just keeps the stream narrow.
  const clientIdsKey = useMemo(() => clients.map((c) => c.id).sort().join(','), [clients]);
  useEffect(() => {
    if (!user || !clientIdsKey) return;

    const handleHabitRow = (payload: any) => {
      const row = payload.new;
      if (!row?.client_id || !row?.date) return;
      setLiveHabitRows((prev) => ({ ...prev, [`${row.client_id}:${row.date}`]: row }));
    };

    const habitChannel = supabase
      .channel(`coach_habits_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_habits', filter: `client_id=in.(${clientIdsKey})` },
        handleHabitRow
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'client_habits', filter: `client_id=in.(${clientIdsKey})` },
        handleHabitRow
      )
      .subscribe();

    return () => {
      supabase.removeChannel(habitChannel);
    };
  }, [user, clientIdsKey]);

  // --- Client operations ---
  /**
   * public.clients has NO `goals` or `completed_workouts` column — writing
   * either fails the whole statement with 42703 and takes every other field
   * down with it (this is why editing a client with goals filled in never
   * saved).
   *
   * `completed_workouts` is now GONE from the Client interface entirely, not
   * merely stripped here, so it cannot be read or written anywhere. The real
   * number comes from `completedWorkoutCounts` (lib/workoutCounts.ts). The
   * destructure below stays purely as a runtime guard against an untyped
   * caller reintroducing it via `as any`.
   *
   * `goals` remains on the interface as a WRITE-ONLY convenience: it is
   * translated here into assessment_data.fitness_goals, the same shape
   * app/add-client.tsx writes. Never read `client.goals` back — it is always
   * undefined; read assessment_data instead (lib/clientGoals.ts).
   */
  const stripPhantomClientColumns = (updates: Partial<Client>, existingAssessment?: any) => {
    const { goals, completed_workouts, ...rest } = updates as any; // invariant-ok: this IS the guard that strips the phantom columns
    const payload: Record<string, any> = { ...rest };
    if (goals !== undefined) {
      const list = String(goals).split(',').map((g) => g.trim()).filter(Boolean);
      payload.assessment_data = {
        ...(existingAssessment && typeof existingAssessment === 'object' ? existingAssessment : {}),
        ...(payload.assessment_data && typeof payload.assessment_data === 'object' ? payload.assessment_data : {}),
        fitness_goals: list,
      };
    }
    return payload;
  };

  const addClient = useCallback(async (clientData: Partial<Client>) => {
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...stripPhantomClientColumns(clientData), trainer_id: user!.id })
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => [data, ...prev]);
    await logActivity({
      trainer_id: user!.id,
      type: 'signup',
      message: `${data.name} was added as a new client`,
    });
    return data;
  }, [user]);

  const updateClientAssessment = useCallback(async (clientId: string, assessmentData: any) => {
    const { error } = await supabase
      .from('clients')
      .update({ assessment_data: assessmentData })
      .eq('id', clientId);
      
    if (error) throw error;
    
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, assessment_data: assessmentData } : c));
  }, []);

  const updateClient = useCallback(async (id: string, updates: Partial<Client>) => {
    // Merge goals into the existing assessment_data rather than clobbering it.
    let existingAssessment: any;
    if ((updates as any).goals !== undefined) {
      const { data: current } = await supabase
        .from('clients').select('assessment_data').eq('id', id).maybeSingle();
      existingAssessment = current?.assessment_data;
    }
    const { data, error } = await supabase
      .from('clients')
      .update(stripPhantomClientColumns(updates, existingAssessment))
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  }, []);

  const enrollClientInPlan = useCallback(async (clientId: string, planId: string): Promise<PlanEnrollment> => {
    const plan = plans.find(p => p.id === planId);
    // The snapshot must come from the source of truth, not possibly-stale
    // local state — an empty freeze here silently breaks the athlete's whole
    // season (no track, no progress, no pulse card).
    let trackSnapshot: TrackNode[] = plan?.track || [];
    if (trackSnapshot.length === 0) {
      const { data: freshPlan } = await supabase
        .from('plans')
        .select('track')
        .eq('id', planId)
        .maybeSingle();
      if (Array.isArray(freshPlan?.track)) trackSnapshot = freshPlan.track;
    }

    const { data, error } = await supabase
      .from('client_plan_enrollments')
      .upsert({
        client_id: clientId,
        plan_id: planId,
        track_snapshot: trackSnapshot,
        track_position: 0,
        status: 'active',
        started_at: new Date().toISOString(),
        completed_at: null,
        paused_at: null,
        sync_with_plan: false,
      }, { onConflict: 'client_id,plan_id' })
      .select()
      .single();

    if (error) throw error;
    // Notify the athlete their pass is live. In-app state syncs via the
    // client_plan_enrollments realtime subscription in ClientContext.
    const client = clients.find((c) => c.id === clientId);
    const clientToken = (client as any)?.expo_push_token;
    if (clientToken && plan?.name) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: clientToken,
          title: trainer?.name ? `New pass from ${trainer.name}` : 'New pass activated',
          body: plan.name,
          data: { url: '/(client-tabs)/workouts' },
        },
      }).catch(() => {});
    }
    return data as PlanEnrollment;
  }, [plans, clients, trainer]);

  const pauseEnrollment = useCallback(async (enrollmentId: string) => {
    const { error } = await supabase.from('client_plan_enrollments')
      .update({ status: 'paused', paused_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', enrollmentId);
    if (error) throw error;
  }, []);

  const resumeEnrollment = useCallback(async (enrollmentId: string) => {
    const { error } = await supabase.from('client_plan_enrollments')
      .update({ status: 'active', paused_at: null, updated_at: new Date().toISOString() })
      .eq('id', enrollmentId);
    if (error) throw error;
  }, []);

  const getClientEnrollment = useCallback(async (clientId: string): Promise<PlanEnrollment | null> => {
    const { data } = await supabase
      .from('client_plan_enrollments')
      .select('*')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .single();
    return data as PlanEnrollment | null;
  }, []);

  const upgradeClientToPlan = useCallback(async (clientId: string, planId: string) => {
    const { data, error } = await supabase
      .from('clients')
      .update({ status: 'active', plan_id: planId, trial_end_date: null })
      .eq('id', clientId)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === clientId ? data : c)));
    const client = clients.find((c) => c.id === clientId);
    const plan = plans.find((p) => p.id === planId);
    
    await enrollClientInPlan(clientId, planId);
    
    await logActivity({
      trainer_id: user!.id,
      type: 'signup',
      message: `${client?.name || 'Client'} upgraded to "${plan?.name || 'plan'}"`,
    });
  }, [user, clients, plans, enrollClientInPlan]);

  const extendClientTrial = useCallback(async (clientId: string, days: number) => {
    const client = clients.find((c) => c.id === clientId);
    if (!client) throw new Error('Client not found');

    // Calculate current trial end (default 20 days from created_at)
    const currentEnd = client.trial_end_date
      ? new Date(client.trial_end_date)
      : new Date(new Date(client.created_at).getTime() + 20 * 86400000);
    const newEnd = new Date(currentEnd.getTime() + days * 86400000);
    
    // Max 40 days from created_at
    const maxEnd = new Date(new Date(client.created_at).getTime() + 40 * 86400000);
    const finalEnd = newEnd > maxEnd ? maxEnd : newEnd;

    const { data, error } = await supabase
      .from('clients')
      .update({ trial_end_date: finalEnd.toISOString() })
      .eq('id', clientId)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === clientId ? data : c)));
  }, [clients]);

  const getClientById = useCallback((id: string) => {
    return clients.find((c) => c.id === id);
  }, [clients]);

  // --- Session operations ---
  const addSession = useCallback(async (sessionData: Partial<Session>) => {
    const { data, error } = await supabase
      .from('sessions')
      .insert({ ...sessionData, trainer_id: user!.id })
      .select()
      .single();
    if (error) throw error;
    setSessions((prev) => [...prev, data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    const client = clients.find((c) => c.id === sessionData.client_id);
    await logActivity({
      trainer_id: user!.id,
      type: 'session',
      message: `Session booked with ${client?.name || sessionData.group_name || 'client'}`,
    });
    return data;
  }, [user, clients]);

  const updateSession = useCallback(async (id: string, updates: Partial<Session>) => {
    const { data, error } = await supabase
      .from('sessions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setSessions((prev) => prev.map((s) => (s.id === id ? data : s)));
    if (updates.status === 'completed') {
      const session = sessions.find((s) => s.id === id);
      const client = session ? clients.find((c) => c.id === session.client_id) : null;
      await logActivity({
        trainer_id: user!.id,
        type: 'session',
        message: `Session completed with ${client?.name || session?.group_name || 'client'}`,
      });
    }
    return data;
  }, [user, sessions, clients]);

  const getClientSessions = useCallback((clientId: string) => {
    return sessions.filter((s) => s.client_id === clientId);
  }, [sessions]);

  const getSessionsForDate = useCallback((date: Date) => {
    return sessions.filter((s) => {
      const sd = new Date(s.date);
      return sd.getFullYear() === date.getFullYear() &&
        sd.getMonth() === date.getMonth() &&
        sd.getDate() === date.getDate();
    });
  }, [sessions]);

  // --- Trainer operations ---
  const updateTrainer = useCallback(async (updates: Partial<Trainer>) => {
    const { data, error } = await supabase
      .from('trainers')
      .update(updates)
      .eq('id', user!.id)
      .select()
      .single();
    if (error) throw error;
    setTrainer(data);
    return data;
  }, [user]);

  // --- Workout operations ---
  const createWorkout = useCallback(async (
    name: string,
    description: string,
    exerciseList: { exercise_id: string; sets: number; reps: number; rest_seconds: number; video_url?: string; notes?: string; group_id?: string; group_type?: string }[]
  ) => {
    const { data: workout, error } = await supabase
      .from('workouts')
      .insert({ trainer_id: user!.id, name, description })
      .select()
      .single();
    if (error) throw error;

    if (exerciseList.length > 0) {
      const rows = exerciseList.map((ex, i) => ({
        workout_id: workout.id,
        exercise_id: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
        order_index: i,
        notes: ex.notes || null,
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        ...(ex.video_url ? { video_url: ex.video_url } : {}),
      }));
      const { error: exError } = await supabase.from('workout_exercises').insert(rows);
      if (exError) throw exError;
    }

    // Refetch full workout with exercises
    const { data: full } = await supabase
      .from('workouts')
      .select('*, workout_exercises(*, exercises(*))')
      .eq('id', workout.id)
      .single();
    if (full) setWorkouts((prev) => [full, ...prev]);

    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Created workout "${name}"`,
    });
    return full || workout;
  }, [user]);

  const updateWorkout = useCallback(async (
    id: string,
    name: string,
    description: string,
    exerciseList: { exercise_id: string; sets: number; reps: number; rest_seconds: number; video_url?: string; notes?: string; group_id?: string; group_type?: string }[]
  ) => {
    const { data: workout, error } = await supabase
      .from('workouts')
      .update({ name, description })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    // Delete existing workout exercises. If this fails, the insert below would
    // duplicate every exercise in the workout — stop instead.
    const { error: clearError } = await supabase.from('workout_exercises').delete().eq('workout_id', id);
    if (clearError) throw clearError;

    // Insert new workout exercises
    if (exerciseList.length > 0) {
      const rows = exerciseList.map((ex, i) => ({
        workout_id: id,
        exercise_id: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
        order_index: i,
        notes: ex.notes || null,
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        ...(ex.video_url ? { video_url: ex.video_url } : {}),
      }));
      const { error: exError } = await supabase.from('workout_exercises').insert(rows);
      if (exError) throw exError;
    }

    // Refetch full workout
    const { data: full } = await supabase
      .from('workouts')
      .select('*, workout_exercises(*, exercises(*))')
      .eq('id', id)
      .single();
      
    if (full) {
      setWorkouts((prev) => prev.map(w => w.id === id ? full : w));
    }

    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Updated workout "${name}"`,
    });

    return full || workout;
  }, [user]);

  const deleteWorkout = useCallback(async (id: string) => {
    const { error: childError } = await supabase.from('workout_exercises').delete().eq('workout_id', id);
    if (childError) throw childError;
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) throw error;
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const duplicateWorkout = useCallback(async (id: string) => {
    const existing = workouts.find((w) => w.id === id);
    if (!existing) throw new Error('Workout not found');

    const { data: newWorkout, error } = await supabase
      .from('workouts')
      .insert({ trainer_id: user!.id, name: `Copy of ${existing.name}`, description: existing.description })
      .select()
      .single();
    if (error) throw error;

    if (existing.workout_exercises && existing.workout_exercises.length > 0) {
      const rows = existing.workout_exercises.map((ex) => ({
        workout_id: newWorkout.id,
        exercise_id: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
        order_index: ex.order_index,
        notes: ex.notes || null,
        group_id: ex.group_id || null,
        group_type: ex.group_type || null,
        ...(ex.video_url ? { video_url: ex.video_url } : {}),
      }));
      const { error: exError } = await supabase.from('workout_exercises').insert(rows);
      if (exError) throw exError;
    }

    const { data: full } = await supabase
      .from('workouts')
      .select('*, workout_exercises(*, exercises(*))')
      .eq('id', newWorkout.id)
      .single();
    if (full) setWorkouts((prev) => [full, ...prev]);

    return full || newWorkout;
  }, [user, workouts]);

  const assignWorkout = useCallback(async (workoutId: string, clientId: string, date: string) => {
    const { data, error } = await supabase.from('client_workouts').insert({
      trainer_id: user!.id,
      workout_id: workoutId,
      client_id: clientId,
      assigned_date: date,
      status: 'assigned',
    }).select().single();
    if (error) throw error;
    if (data) setClientWorkoutsList((prev) => [data, ...prev]);
    const client = clients.find((c) => c.id === clientId);
    const workout = workouts.find((w) => w.id === workoutId);
    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Assigned "${workout?.name}" to ${client?.name || 'client'}`,
    });
    // Notify the athlete on their device. Their in-app list updates on its own:
    // ClientContext already subscribes to client_workouts inserts. Fire-and-forget
    // so a push failure never blocks the assignment.
    const clientToken = (client as any)?.expo_push_token;
    if (clientToken && workout?.name) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: clientToken,
          title: trainer?.name ? `New workout from ${trainer.name}` : 'New workout assigned',
          body: workout.name,
          data: { url: '/(client-tabs)/workouts' },
        },
      }).catch(() => {});
    }
  }, [user, clients, workouts, trainer]);

  // --- Diet Plan operations ---
  // --- Meal / Diet operations ---
  const createMeal = useCallback(async (mealData: Partial<Meal>, isGlobal: boolean = false) => {
    const payload = isGlobal 
      ? { ...mealData, is_custom: false } 
      : { ...mealData, trainer_id: user!.id, is_custom: true };

    const { data, error } = await supabase
      .from('meals')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    setMeals((prev) => [data, ...prev]);
    return data;
  }, [user]);

  const createDietPlan = useCallback(async (
    name: string,
    description: string,
    mealList: { meal_id: string; meal_time?: string; servings?: number }[],
    category?: string,
    targets?: { calories: number; protein: number; carbs: number; fat: number },
    imageUrl?: string | null,
    extras?: DietPlanExtras
  ) => {
    const basePayload = {
      trainer_id: user!.id,
      name,
      description,
      category: category || 'custom',
      target_calories: targets?.calories || 2000,
      target_protein: targets?.protein || 150,
      target_carbs: targets?.carbs || 200,
      target_fat: targets?.fat || 65,
      image_url: imageUrl || null,
    };
    const extrasPayload = extras ? {
      ...(extras.week_structure !== undefined && { week_structure: extras.week_structure }),
      ...(extras.swaps !== undefined && { swaps: extras.swaps }),
    } : {};

    let { data: dietPlan, error } = await supabase
      .from('diet_plans')
      .insert({ ...basePayload, ...extrasPayload })
      .select()
      .single();
    // Pre-migration resilience: retry without the new JSONB columns if missing.
    if (error && error.code === '42703' && Object.keys(extrasPayload).length > 0) {
      ({ data: dietPlan, error } = await supabase
        .from('diet_plans')
        .insert(basePayload)
        .select()
        .single());
    }
    if (error) throw error;

    if (mealList.length > 0) {
      const rows = mealList.map((m, i) => ({
        diet_plan_id: dietPlan.id,
        meal_id: m.meal_id,
        order_index: i,
        meal_time: m.meal_time || 'snack',
        servings: m.servings || 1,
      }));
      const { error: mealsError } = await supabase.from('diet_plan_meals').insert(rows);
      // A plan saved without its meals is an empty plan — do not report success.
      if (mealsError) throw mealsError;
    }

    const { data: full } = await supabase
      .from('diet_plans')
      .select('*, diet_plan_meals(*, meals(*))')
      .eq('id', dietPlan.id)
      .single();
    if (full) setDiets((prev) => [full, ...prev]);

    await logActivity({
      trainer_id: user!.id,
      type: 'diet',
      message: `Created diet plan "${name}"`,
    });
    return full || dietPlan;
  }, [user]);

  const updateDietPlan = useCallback(async (
    id: string,
    name: string,
    description: string,
    mealList: { meal_id: string; meal_time?: string; servings?: number }[],
    category?: string,
    targets?: { calories: number; protein: number; carbs: number; fat: number },
    imageUrl?: string | null,
    extras?: DietPlanExtras
  ) => {
    const baseUpdate = {
      name,
      description,
      category: category || 'custom',
      ...(targets && {
        target_calories: targets.calories,
        target_protein: targets.protein,
        target_carbs: targets.carbs,
        target_fat: targets.fat
      }),
      ...(imageUrl !== undefined && { image_url: imageUrl }),
    };
    const extrasUpdate = extras ? {
      ...(extras.week_structure !== undefined && { week_structure: extras.week_structure }),
      ...(extras.swaps !== undefined && { swaps: extras.swaps }),
    } : {};

    let { error } = await supabase
      .from('diet_plans')
      .update({ ...baseUpdate, ...extrasUpdate })
      .eq('id', id);
    // Pre-migration resilience: retry without the new JSONB columns if missing.
    if (error && error.code === '42703' && Object.keys(extrasUpdate).length > 0) {
      ({ error } = await supabase
        .from('diet_plans')
        .update(baseUpdate)
        .eq('id', id));
    }
    if (error) throw error;

    // Replace all meal associations
    const { error: clearMealsError } = await supabase.from('diet_plan_meals').delete().eq('diet_plan_id', id);
    // Without a clean slate the insert below would duplicate every meal.
    if (clearMealsError) throw clearMealsError;
    if (mealList.length > 0) {
      const rows = mealList.map((m, i) => ({
        diet_plan_id: id,
        meal_id: m.meal_id,
        order_index: i,
        meal_time: m.meal_time || 'snack',
        servings: m.servings || 1,
      }));
      const { error: mealsError } = await supabase.from('diet_plan_meals').insert(rows);
      // A plan saved without its meals is an empty plan — do not report success.
      if (mealsError) throw mealsError;
    }

    const { data: full } = await supabase
      .from('diet_plans')
      .select('*, diet_plan_meals(*, meals(*))')
      .eq('id', id)
      .single();
    if (full) setDiets((prev) => prev.map((d) => (d.id === id ? full : d)));
    return full!;
  }, []);

  const duplicateDietPlan = useCallback(async (id: string) => {
    const original = diets.find((d) => d.id === id);
    if (!original) throw new Error('Diet plan not found');

    const { data: copy, error } = await supabase
      .from('diet_plans')
      .insert({
        trainer_id: user!.id,
        name: `${original.name} (Copy)`,
        description: original.description,
        category: original.category,
        target_calories: original.target_calories,
        target_protein: original.target_protein,
        target_carbs: original.target_carbs,
        target_fat: original.target_fat,
        image_url: original.image_url,
      })
      .select()
      .single();
    if (error) throw error;

    if (original.diet_plan_meals && original.diet_plan_meals.length > 0) {
      const rows = original.diet_plan_meals.map((m) => ({
        diet_plan_id: copy.id,
        meal_id: m.meal_id,
        order_index: m.order_index,
        meal_time: m.meal_time,
        servings: m.servings || 1,
      }));
      const { error: mealsError } = await supabase.from('diet_plan_meals').insert(rows);
      // A plan saved without its meals is an empty plan — do not report success.
      if (mealsError) throw mealsError;
    }

    const { data: full } = await supabase
      .from('diet_plans')
      .select('*, diet_plan_meals(*, meals(*))')
      .eq('id', copy.id)
      .single();
    if (full) setDiets((prev) => [full, ...prev]);
    return full || copy;
  }, [user, diets]);

  const deleteDietPlan = useCallback(async (id: string) => {
    const { error: childError } = await supabase.from('diet_plan_meals').delete().eq('diet_plan_id', id);
    if (childError) throw childError;
    const { error } = await supabase.from('diet_plans').delete().eq('id', id);
    if (error) throw error;
    setDiets((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const assignDietPlan = useCallback(async (dietPlanId: string, clientId: string, date: string) => {
    const { data, error } = await supabase.from('client_diets').insert({
      diet_plan_id: dietPlanId,
      client_id: clientId,
      assigned_date: date,
      status: 'assigned',
    }).select().single();
    if (error) throw error;
    if (data) setClientDietsList((prev) => [data, ...prev]);
    const client = clients.find((c) => c.id === clientId);
    const diet = diets.find((d) => d.id === dietPlanId);
    await logActivity({
      trainer_id: user!.id,
      type: 'diet',
      message: `Assigned "${diet?.name}" to ${client?.name || 'client'}`,
    });
  }, [user, clients, diets]);

  // --- Plan operations ---
  const createPlan = useCallback(async (
    name: string,
    price: number,
    period: string,
    features: string[] = [],
    color: string = Colors.blue,
    isPopular: boolean = false,
    extras?: PlanSeasonExtras
  ) => {
    const basePayload = {
      trainer_id: user!.id,
      name,
      price,
      period,
      features,
      color,
      is_popular: isPopular,
    };

    let { data, error } = await supabase
      .from('plans')
      .insert(extras ? { ...basePayload, ...extras } : basePayload)
      .select()
      .single();

    // If a migration hasn't run yet, the insert fails with 42703 (undefined
    // column). Shed the newest fields first — a DB with the season columns but
    // not the cohort ones should still keep the promise line and duration —
    // then fall back to the base payload.
    const missingColumn = (e: any) => !!e && (e.code === '42703' || /column/i.test(e.message || ''));

    if (error && extras && missingColumn(error)) {
      const withoutCohort: Record<string, any> = { ...extras };
      // cover_url sheds with the cohort keys — it is the newest column
      // (coach_identity_media.sql), so a DB predating either migration still
      // keeps the promise line and duration.
      COHORT_EXTRA_KEYS.forEach(k => { delete withoutCohort[k]; });
      delete withoutCohort.cover_url;
      if (Object.keys(withoutCohort).length > 0) {
        ({ data, error } = await supabase
          .from('plans')
          .insert({ ...basePayload, ...withoutCohort })
          .select()
          .single());
      }
      if (error && missingColumn(error)) {
        ({ data, error } = await supabase
          .from('plans')
          .insert(basePayload)
          .select()
          .single());
      }
    }

    if (error) throw error;
    if (data) setPlans((prev) => [...prev, data].sort((a, b) => a.price - b.price));

    await logActivity({
      trainer_id: user!.id,
      type: 'plan',
      message: `Created new subscription plan "${name}"`,
    });

    return data as Plan;
  }, [user]);

  // Edit an existing pass's plans row (create-plan.tsx in edit mode). Sheds
  // cohort + cover columns on 42703 exactly like createPlan above, so a DB
  // predating those migrations still saves the rest of the edit.
  const updatePlan = useCallback(async (
    planId: string,
    updates: Partial<Pick<Plan, 'name' | 'price' | 'period' | 'description' | 'duration_weeks' | 'season_settings' | 'starts_on' | 'enrollment_closes' | 'capacity'>> & { cover_url?: string | null }
  ) => {
    let { data, error } = await supabase
      .from('plans')
      .update(updates)
      .eq('id', planId)
      .select()
      .single();

    const missingColumn = (e: any) => !!e && (e.code === '42703' || /column/i.test(e.message || ''));

    if (error && missingColumn(error)) {
      // Mirror createPlan's shedding order: cohort keys + cover_url first
      // (the newest columns), then fall back to the base columns only.
      const withoutCohort: Record<string, any> = { ...updates };
      COHORT_EXTRA_KEYS.forEach(k => { delete withoutCohort[k]; });
      delete withoutCohort.cover_url;
      if (Object.keys(withoutCohort).length > 0) {
        ({ data, error } = await supabase
          .from('plans')
          .update(withoutCohort)
          .eq('id', planId)
          .select()
          .single());
      }
      if (error && missingColumn(error)) {
        const base: Record<string, any> = {};
        (['name', 'price', 'period'] as const).forEach(k => {
          if (updates[k] !== undefined) base[k] = updates[k];
        });
        if (Object.keys(base).length > 0) {
          ({ data, error } = await supabase
            .from('plans')
            .update(base)
            .eq('id', planId)
            .select()
            .single());
        }
      }
    }

    if (error) throw error;
    if (data) {
      setPlans(prev => prev
        .map(p => (p.id === planId ? { ...p, ...data } : p))
        .sort((a, b) => a.price - b.price));
    }

    await logActivity({
      trainer_id: user!.id,
      type: 'plan',
      message: `Updated subscription plan "${data?.name ?? updates.name ?? ''}"`,
    });

    return data as Plan;
  }, [user]);

  const updatePlanTrack = useCallback(async (planId: string, track: TrackNode[]) => {
    const { error } = await supabase
      .from('plans')
      .update({ track })
      .eq('id', planId);
    if (error) throw error;
    setPlans(prev => prev.map(p => p.id === planId ? { ...p, track } : p));
  }, []);

  const createExercise = useCallback(async (
    name: string,
    category: string,
    muscleGroup: string,
    equipment?: string,
    instructions?: string,
    imageUrl?: string
  ) => {
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        trainer_id: user!.id,
        name,
        category: sanitizeCategory(category),
        muscle_group: muscleGroup,
        equipment: sanitizeEquipment(equipment),
        instructions: instructions || '',
        image_url: imageUrl || null,
        is_custom: true,
      })
      .select()
      .single();

    if (error) throw error;
    if (data) {
        setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setAutoAddExerciseId(data.id);
    }

    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Created custom exercise "${name}"`,
    });

    return data as Exercise;
  }, [user]);

  const updateExercise = useCallback(async (
    id: string,
    name: string,
    category: string,
    muscleGroup: string,
    equipment?: string,
    instructions?: string,
    imageUrl?: string
  ) => {
    const { data, error } = await supabase
      .from('exercises')
      .update({
        name,
        category: sanitizeCategory(category),
        muscle_group: muscleGroup,
        equipment: sanitizeEquipment(equipment),
        instructions: instructions || '',
        image_url: imageUrl || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (data) {
        setExercises((prev) => prev.map(e => e.id === id ? data : e).sort((a, b) => a.name.localeCompare(b.name)));
    }

    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Updated custom exercise "${name}"`,
    });

    return data as Exercise;
  }, [user]);

  const importExercise = useCallback(async (exData: { 
    name: string; category: string; muscle_group: string; equipment: string; 
    image_url?: string | null; instructions?: string; 
  }) => {
    // Check if we already imported this exercise by name (to avoid duplicates)
    const existing = exercises.find((e) => e.name.toLowerCase() === exData.name.toLowerCase() && e.trainer_id === user!.id);
    if (existing) {
      // Update existing exercise if it's missing instructions or image
      const needsInstructions = !existing.instructions || existing.instructions.trim().length < 20;
      const needsImage = !existing.image_url && exData.image_url;
      
      if (needsInstructions || needsImage) {
        const newInstructions = exData.instructions || '';
        
        // Build update payload
        const updatePayload: Record<string, any> = {};
        if (needsInstructions && newInstructions.trim().length >= 20) {
          updatePayload.instructions = newInstructions;
        }
        if (needsImage) {
          updatePayload.image_url = exData.image_url;
        }

        if (Object.keys(updatePayload).length > 0) {
          try {
            const { data: updated } = await supabase
              .from('exercises')
              .update(updatePayload)
              .eq('id', existing.id)
              .select()
              .single();
            if (updated) {
              setExercises((prev) => prev.map(e => e.id === existing.id ? updated : e));
              return updated;
            }
          } catch (updateErr) {
            console.warn('Failed to update existing exercise:', updateErr);
          }
        }
        
        // Fall back to AI only if no instructions provided
        try {
          const { data: aiData, error: aiError } = await supabase.functions.invoke('generate-exercise', {
            body: { name: existing.name }
          });
          if (!aiError && aiData?.instructions) {
            const { data: updated } = await supabase
              .from('exercises')
              .update({ instructions: aiData.instructions })
              .eq('id', existing.id)
              .select()
              .single();
            if (updated) {
              setExercises((prev) => prev.map(e => e.id === existing.id ? updated : e));
              return updated;
            }
          }
        } catch (aiErr) {
          console.warn('AI regeneration failed for existing exercise', aiErr);
        }
      }
      return existing;
    }

    // Use provided instructions, or fall back to AI generation
    let finalInstructions = exData.instructions || '';
    if (!finalInstructions || finalInstructions.trim().length < 20) {
      try {
        const { data: aiData, error: aiError } = await supabase.functions.invoke('generate-exercise', {
          body: { name: exData.name }
        });
        if (!aiError && aiData?.instructions) {
          finalInstructions = aiData.instructions;
        }
      } catch (aiErr) {
        console.warn('AI generation failed for imported exercise', aiErr);
      }
    }

    // Create the exercise
    const { data, error } = await supabase
      .from('exercises')
      .insert({
        trainer_id: user!.id,
        name: exData.name,
        category: exData.category,
        muscle_group: exData.muscle_group,
        equipment: exData.equipment,
        instructions: finalInstructions,
        is_custom: true,
        image_url: exData.image_url || null,
      })
      .select()
      .single();

    if (error) throw error;
    if (data) setExercises((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));

    await logActivity({
      trainer_id: user!.id,
      type: 'workout',
      message: `Imported exercise "${exData.name}"`,
    });

    return data as Exercise;
  }, [user, exercises]);

  /**
   * clientId → workouts completed, computed ONCE from rows already in memory
   * (see lib/workoutCounts.ts for the definition). The roster reads this map by
   * key, so rendering 200 athletes still costs zero extra round trips.
   * null while the log rows have not loaded — consumers omit the stat instead
   * of rendering a fake 0.
   */
  const completedWorkoutCounts = useMemo(() => {
    if (workoutLogRows === null) return null;
    return buildCompletedWorkoutCounts(clientWorkoutsList, workoutLogRows);
  }, [clientWorkoutsList, workoutLogRows]);

  // --- Client assignment lookups ---
  const getClientWorkouts = useCallback((clientId: string) => {
    return clientWorkoutsList
      .filter((cw) => cw.client_id === clientId)
      .map((cw) => ({
        assignment: cw,
        workout: workouts.find((w) => w.id === cw.workout_id)!,
      }))
      .filter((item) => item.workout);
  }, [clientWorkoutsList, workouts]);

  const getClientDiets = useCallback((clientId: string) => {
    return clientDietsList
      .filter((cd) => cd.client_id === clientId)
      .map((cd) => ({
        assignment: cd,
        diet: diets.find((d) => d.id === cd.diet_plan_id)!,
      }))
      .filter((item) => item.diet);
  }, [clientDietsList, diets]);

  // --- Progress operations ---
  const getClientProgress = useCallback((clientId: string) => {
    return progressLogs
      .filter(p => p.client_id === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [progressLogs]);

  const addProgressLog = useCallback(async (log: Partial<ProgressLog>) => {
    const { data, error } = await supabase.from('client_progress').insert({
      ...log,
      trainer_id: user!.id,
    }).select().single();
    if (error) throw error;
    setProgressLogs(prev => [data, ...prev]);
    return data;
  }, [user]);

  const deleteProgressLog = useCallback(async (id: string) => {
    const { error } = await supabase.from('client_progress').delete().eq('id', id);
    if (error) throw error;
    setProgressLogs(prev => prev.filter(p => p.id !== id));
  }, []);

  // --- Notification & Push operations ---
  const markNotificationRead = useCallback(async (id: string) => {
    // Update local state immediately for UI responsiveness
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      // Revert if error
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
      throw error;
    }
  }, []);

  const updatePushToken = useCallback(async (token: string) => {
    if (!user) return;
    try {
      // expo_push_token is the column the send paths read (see chat/[id].tsx,
      // client-autoflow) — clients rows are keyed by auth_user_id, not id.
      const { error } = trainer
        ? await supabase.from('trainers').update({ expo_push_token: token }).eq('id', user.id)
        : await supabase.from('clients').update({ expo_push_token: token }).eq('auth_user_id', user.id);
      if (error && __DEV__) console.warn('Failed to update push token', error.message);
    } catch (err) {
      if (__DEV__) console.warn('Failed to update push token', err);
    }
  }, [user, trainer]);

  // --- Health snapshot operations (coach-side) ---
  const getClientHealthSnapshot = useCallback((clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    // Only return data if client has consented to sharing
    if (!client || !(client as any).health_sharing_enabled) return null;
    return clientHealthSnapshots
      .filter((s) => s.client_id === clientId)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  }, [clients, clientHealthSnapshots]);

  const requestHealthAccess = useCallback(async (clientId: string) => {
    if (!user) return;
    // Set the request flag on client. The caller shows "Request Sent" on
    // success, so a rejected write has to reach it.
    const { error } = await supabase.from('clients').update({ health_sharing_requested: true }).eq('id', clientId);
    if (error) throw error;
    // Update local state
    setClients((prev) => prev.map((c) => c.id === clientId ? { ...c, health_sharing_requested: true } as any : c));
    // Send a notification to the client's trainer feed
    const client = clients.find((c) => c.id === clientId);
    await logActivity({
      trainer_id: user.id,
      type: 'health_request',
      message: `Requested health data access from ${client?.name || 'client'}`,
    });
  }, [user, clients]);

  // ─── CLASS CRUD ────────────────────────────────────────────
  const createClass = useCallback(async (data: CreateClassData): Promise<ClassItem> => {
    if (!user) throw new Error('Not authenticated');
    const { data: newClass, error } = await supabase
      .from('classes')
      .insert({
        trainer_id: user.id,
        title: data.title,
        description: data.description || null,
        category: data.category,
        tags: data.tags || [],
        difficulty: data.difficulty,
        duration_minutes: data.duration_minutes,
        video_url: data.video_url || null,
        thumbnail_url: data.thumbnail_url || null,
        equipment: data.equipment || [],
        is_free: data.is_free || false,
        plan_id: data.plan_id || null,
        workout_id: data.workout_id || null,
        status: data.status || 'draft',
      })
      .select()
      .single();
    if (error) throw error;
    setTrainerClasses((prev) => [newClass, ...prev]);
    return newClass;
  }, [user]);

  const updateClass = useCallback(async (id: string, data: Partial<ClassItem>): Promise<ClassItem> => {
    const { id: _id, trainer_id: _tid, created_at: _ca, take_count: _tc, total_watch_minutes: _tw, avg_rating: _ar, rating_count: _rc, ...safeData } = data as any;
    const { data: updated, error } = await supabase
      .from('classes')
      .update({ ...safeData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setTrainerClasses((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const deleteClass = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) throw error;
    setTrainerClasses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const publishClass = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('classes')
      .update({ status: 'published', updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    setTrainerClasses((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'published' as const } : c)));
  }, []);

  const createLiveClass = useCallback(async (data: Omit<LiveClassItem, 'id' | 'trainer_id' | 'mux_playback_id' | 'status' | 'went_live_at' | 'viewer_count' | 'created_at' | 'updated_at'>): Promise<LiveClassItem> => {
    let streamId = `stream_${Date.now()}`;
    let streamKey = `key_${Date.now()}`;
    let playbackId = `playback_${Date.now()}`;

    // 1. Try calling the Supabase Edge Function to get real Mux stream details.
    //    NOTE: supabase.functions.invoke returns { data, error: null } even on non-2xx responses —
    //    the HTTP error body is placed inside `data`, not `error`. We must check data?.error too.
    try {
      const { data: muxData, error: muxError } = await supabase.functions.invoke('create-mux-stream');
      if (!muxError && muxData?.stream_key && !muxData?.error) {
        streamId = muxData.stream_id;
        streamKey = muxData.stream_key;
        playbackId = muxData.playback_id;
      } else {
        const reason = muxError?.message ?? muxData?.error ?? 'unknown';
        console.warn('[AppContext] create-mux-stream failed, using fallback placeholder keys:', reason);
      }
    } catch (e) {
      console.warn('[AppContext] Edge Function not deployed or unreachable, using fallback values:', e);
    }
    
    // 2. Save in database.
    //    `category` and `duration_minutes` have no column on public.live_classes
    //    (they only exist on `classes`, for the VOD promotion). Sending them
    //    fails the whole insert with 42703, which is why scheduling a live class
    //    could never save. Try with them — so a future migration is picked up
    //    automatically — then shed them and retry.
    const { category: _cat, duration_minutes: _dur, ...baseData } = data as any;
    const vodExtras: Record<string, any> = {
      ...(_cat !== undefined ? { category: _cat } : {}),
      ...(_dur !== undefined ? { duration_minutes: _dur } : {}),
    };
    const basePayload = {
      ...baseData,
      trainer_id: user!.id,
      mux_playback_id: playbackId,
      status: 'scheduled',
    };

    let { data: newClass, error } = await supabase
      .from('live_classes')
      .insert(Object.keys(vodExtras).length ? { ...basePayload, ...vodExtras } : basePayload)
      .select()
      .single();
    if (error && Object.keys(vodExtras).length > 0 && isMissingSchema(error)) {
      if (__DEV__) console.warn('[AppContext] live_classes has no category/duration_minutes column — saving without them.'); // invariant-ok: warning names the phantom columns on purpose
      ({ data: newClass, error } = await supabase.from('live_classes').insert(basePayload).select().single());
    }
    if (error) throw error;

    // Insert stream credentials into secrets table (trainer-only RLS).
    // If this fails (e.g. RLS rejection) we log it but don't throw — the class row was already created.
    const { error: secretsError } = await supabase.from('live_class_secrets').insert({
      live_class_id: newClass.id,
      mux_stream_id: streamId,
      mux_stream_key: streamKey,
    });
    if (secretsError) {
      console.error('[AppContext] live_class_secrets insert failed — GO LIVE will not work:', secretsError.message);
    }
    
    setLiveClassesList((prev) => [newClass, ...prev].sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()));
    return newClass;
  }, [user]);

  const updateLiveClass = useCallback(async (id: string, updates: Partial<LiveClassItem>): Promise<LiveClassItem> => {
    // Same phantom-column guard as createLiveClass: category/duration_minutes
    // do not exist on public.live_classes, and would take the whole update
    // (title, schedule, status…) down with them.
    const { category: _cat, duration_minutes: _dur, ...baseUpdates } = updates as any;
    const vodExtras: Record<string, any> = {
      ...(_cat !== undefined ? { category: _cat } : {}),
      ...(_dur !== undefined ? { duration_minutes: _dur } : {}),
    };
    let { data, error } = await supabase
      .from('live_classes')
      .update(Object.keys(vodExtras).length ? { ...baseUpdates, ...vodExtras } : baseUpdates)
      .eq('id', id).select().single();
    if (error && Object.keys(vodExtras).length > 0 && isMissingSchema(error)) {
      if (__DEV__) console.warn('[AppContext] live_classes has no category/duration_minutes column — saving without them.'); // invariant-ok: warning names the phantom columns on purpose
      ({ data, error } = await supabase.from('live_classes').update(baseUpdates).eq('id', id).select().single());
    }
    if (error) throw error;
    setLiveClassesList((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  }, []);

  const deleteLiveClass = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('live_classes').delete().eq('id', id);
    if (error) throw error;
    setLiveClassesList((prev) => prev.filter((c) => c.id !== id));
  }, []);


  // --- Computed values ---
  const activeClients = useMemo(() => clients.filter((c) => c.status === 'active' || c.status === 'trial'), [clients]);
  const trialClients = useMemo(() => clients.filter((c) => c.status === 'trial'), [clients]);
  const inactiveClients = useMemo(() => clients.filter((c) => c.status === 'inactive'), [clients]);

  const todaySessions = useMemo(() => getSessionsForDate(new Date()), [getSessionsForDate]);
  const upcomingSessions = useMemo(() =>
    sessions.filter((s) => new Date(s.date) > new Date() && s.status === 'upcoming').slice(0, 5),
    [sessions]
  );

  const totalReferrals = referrals.length;

  const totalMonthlyRevenue = useMemo(() =>
    plans.reduce((sum, p) => {
      const subCount = clients.filter((c) => c.plan_id === p.id && c.status !== 'inactive').length;
      return sum + Number(p.price) * subCount;
    }, 0),
    [plans, clients]
  );

  const fetchAnalytics = useCallback(async () => {
    if (!user) return { growth: [], sessionStats: [], sessionTypes: [], revenue: null };
    try {
      const [growth, stats, types, revenue] = await Promise.all([
        supabase.from('coach_client_growth').select('*').eq('trainer_id', user.id).order('month', { ascending: true }),
        supabase.from('coach_session_stats').select('*').eq('trainer_id', user.id),
        supabase.from('coach_session_types').select('*').eq('trainer_id', user.id),
        supabase.from('coach_revenue_mrr').select('*').eq('trainer_id', user.id).single()
      ]);
      return {
        growth: growth.data || [],
        sessionStats: stats.data || [],
        sessionTypes: types.data || [],
        revenue: revenue.data || null,
      };
    } catch (e) {
      console.error('Error fetching analytics views:', e);
      return { growth: [], sessionStats: [], sessionTypes: [], revenue: null };
    }
  }, [user]);

  const createStripeConnectAccount = useCallback(async () => {
    if (!user) throw new Error('Not authenticated');
    
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('create-connect-account', {
      body: { 
        trainerId: user.id,
        email: trainer?.email || user.email,
        name: trainer?.name || 'FitLink Coach'
      }
    });

    if (error) throw error;
    return data as { url: string; accountId: string };
  }, [user, trainer]);

  const value: AppContextType = useMemo(() => ({
    loading,
    trainer,
    clients,
    sessions,
    activities,
    plans,
    referrals,
    workouts,
    exercises,
    autoAddExerciseId,
    setAutoAddExerciseId,
    diets,
    meals,
    notifications,
    liveHabitRows,
    classes: trainerClasses,
    liveClasses: liveClassesList,
    clientWorkouts: clientWorkoutsList,
    clientDiets: clientDietsList,
    completedWorkoutCounts,
    activeClients,
    trialClients,
    inactiveClients,
    todaySessions,
    upcomingSessions,
    totalReferrals,
    totalMonthlyRevenue,
    addClient,
    updateClient,
    upgradeClientToPlan,
    extendClientTrial,
    updateClientAssessment,
    getClientById,
    addSession,
    updateSession,
    getSessionsForDate,
    getClientSessions,
    updateTrainer,
    createPlan,
    updatePlan,
    updatePlanTrack,
    createExercise,
    updateExercise,
    importExercise,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    duplicateWorkout,
    assignWorkout,
    createMeal,
    createDietPlan,
    updateDietPlan,
    duplicateDietPlan,
    deleteDietPlan,
    assignDietPlan,
    getClientWorkouts,
    getClientDiets,
    progressLogs,
    getClientProgress,
    addProgressLog,
    deleteProgressLog,
    markNotificationRead,
    updatePushToken,
    getClientHealthSnapshot,
    requestHealthAccess,
    createClass,
    updateClass,
    deleteClass,
    publishClass,
    createLiveClass,
    updateLiveClass,
    deleteLiveClass,
    refreshData,
    refreshClients,
    refreshPlans,
    refreshSessions,
    createStripeConnectAccount,
    fetchAnalytics,
    enrollClientInPlan,
    pauseEnrollment,
    resumeEnrollment,
    getClientEnrollment,
  }), [
    loading, trainer, clients, sessions, activities, plans, referrals,
    workouts, exercises, autoAddExerciseId, diets, meals, notifications, liveHabitRows,
    clientWorkoutsList, clientDietsList, completedWorkoutCounts, activeClients, trialClients,
    inactiveClients, todaySessions, upcomingSessions, totalReferrals,
    totalMonthlyRevenue, addClient, updateClient, upgradeClientToPlan,
    extendClientTrial, updateClientAssessment, getClientById, addSession,
    updateSession, getSessionsForDate, getClientSessions, updateTrainer,
    createPlan, updatePlan, updatePlanTrack, createExercise, updateExercise, importExercise,
    createWorkout, updateWorkout, deleteWorkout, duplicateWorkout, assignWorkout,
    createMeal, createDietPlan, updateDietPlan, duplicateDietPlan, deleteDietPlan, assignDietPlan, getClientWorkouts,
    getClientDiets, progressLogs, getClientProgress, addProgressLog,
    deleteProgressLog, markNotificationRead, updatePushToken,
    getClientHealthSnapshot, requestHealthAccess,
    createClass, updateClass, deleteClass, publishClass,
    refreshData, refreshClients, refreshSessions,
    createStripeConnectAccount, fetchAnalytics, trainerClasses,
    enrollClientInPlan,
    pauseEnrollment, resumeEnrollment, getClientEnrollment,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
