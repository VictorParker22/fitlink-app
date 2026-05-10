import { createContext, useContext, useState, useEffect, useCallback, useMemo, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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
}

interface Client {
  id: string;
  trainer_id: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'active' | 'trial' | 'inactive';
  plan_id?: string;
  notes?: string;
  goals?: string;
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

interface Plan {
  id: string;
  trainer_id: string;
  name: string;
  price: number;
  interval: string;
}

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
}

interface WorkoutExercise {
  id: string;
  workout_id: string;
  exercise_id: string;
  sets: number;
  reps: number;
  rest_seconds: number;
  order_index: number;
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
}

interface DietPlanMeal {
  id: string;
  diet_plan_id: string;
  meal_id: string;
  order_index: number;
  meals?: Meal;
}

interface DietPlan {
  id: string;
  trainer_id: string;
  name: string;
  description?: string;
  created_at?: string;
  diet_plan_meals?: DietPlanMeal[];
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
  diets: DietPlan[];
  meals: Meal[];
  notifications: NotificationData[];
  clientWorkouts: ClientWorkout[];
  clientDiets: ClientDiet[];
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
  getClientById: (id: string) => Client | undefined;
  addSession: (data: Partial<Session>) => Promise<Session>;
  updateSession: (id: string, updates: Partial<Session>) => Promise<Session>;
  getSessionsForDate: (date: Date) => Session[];
  getClientSessions: (clientId: string) => Session[];
  updateTrainer: (updates: Partial<Trainer>) => Promise<Trainer>;
  createWorkout: (name: string, description: string, exerciseList: { exercise_id: string; sets: number; reps: number; rest_seconds: number }[]) => Promise<Workout>;
  deleteWorkout: (id: string) => Promise<void>;
  assignWorkout: (workoutId: string, clientId: string, date: string) => Promise<void>;
  createDietPlan: (name: string, description: string, mealList: { meal_id: string }[]) => Promise<DietPlan>;
  deleteDietPlan: (id: string) => Promise<void>;
  assignDietPlan: (dietPlanId: string, clientId: string, date: string) => Promise<void>;
  getClientWorkouts: (clientId: string) => { assignment: ClientWorkout; workout: Workout }[];
  getClientDiets: (clientId: string) => { assignment: ClientDiet; diet: DietPlan }[];
  getClientProgress: (clientId: string) => ProgressLog[];
  addProgressLog: (log: Partial<ProgressLog>) => Promise<ProgressLog>;
  deleteProgressLog: (id: string) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

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
  const [diets, setDiets] = useState<DietPlan[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [clientWorkoutsList, setClientWorkoutsList] = useState<ClientWorkout[]>([]);
  const [clientDietsList, setClientDietsList] = useState<ClientDiet[]>([]);
  const [progressLogs, setProgressLogs] = useState<ProgressLog[]>([]);
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
      setLoading(false);
      return;
    }

    let mounted = true;

    async function fetchAll() {
      setLoading(true);
      try {
        const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes, workoutsRes, exercisesRes, dietsRes, mealsRes, notifRes, cwRes, cdRes, progressRes] = await Promise.all([
          supabase.from('trainers').select('*').eq('id', user!.id).single(),
          supabase.from('clients').select('*').order('created_at', { ascending: false }),
          supabase.from('plans').select('*').order('price'),
          supabase.from('sessions').select('*').order('date'),
          supabase.from('referrals').select('*').order('date', { ascending: false }),
          supabase.from('activities').select('*').order('timestamp', { ascending: false }).limit(20),
          supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').order('created_at', { ascending: false }),
          supabase.from('exercises').select('*').order('name'),
          supabase.from('diet_plans').select('*, diet_plan_meals(*, meals(*))').order('created_at', { ascending: false }),
          supabase.from('meals').select('*').order('name'),
          supabase.from('notifications').select('*').order('created_at', { ascending: false }),
          supabase.from('client_workouts').select('*').order('assigned_date', { ascending: false }),
          supabase.from('client_diets').select('*').order('assigned_date', { ascending: false }),
          supabase.from('client_progress').select('*').order('date', { ascending: false }),
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
        // Default to empty array if table doesn't exist yet (before migration)
        setDiets(dietsRes.data || []);
        setMeals(mealsRes.data || []);
        setNotifications(notifRes.data || []);
        setClientWorkoutsList(cwRes.data || []);
        setClientDietsList(cdRes.data || []);
        // Progress logs might fail if migration not run yet, handle gracefully
        if (progressRes && progressRes.data) setProgressLogs(progressRes.data);
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchAll();
    return () => { mounted = false; };
  }, [user]);

  const refreshData = useCallback(async () => {
    if (!user) return;
    const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes, workoutsRes, exercisesRes, dietsRes, mealsRes, notifRes, cwRes, cdRes] = await Promise.all([
      supabase.from('trainers').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('price'),
      supabase.from('sessions').select('*').order('date'),
      supabase.from('referrals').select('*').order('date', { ascending: false }),
      supabase.from('activities').select('*').order('timestamp', { ascending: false }).limit(20),
      supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').order('created_at', { ascending: false }),
      supabase.from('exercises').select('*').order('name'),
      supabase.from('diet_plans').select('*, diet_plan_meals(*, meals(*))').order('created_at', { ascending: false }),
      supabase.from('meals').select('*').order('name'),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }),
      supabase.from('client_workouts').select('*').order('assigned_date', { ascending: false }),
      supabase.from('client_diets').select('*').order('assigned_date', { ascending: false }),
      supabase.from('client_progress').select('*').order('date', { ascending: false }),
    ]);
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
    
    // Check if progress table exists/returned data
    const pRes = await supabase.from('client_progress').select('*').order('date', { ascending: false });
    if (pRes.data) setProgressLogs(pRes.data);
  }, [user]);

  // --- Client operations ---
  const addClient = useCallback(async (clientData: Partial<Client>) => {
    const { data, error } = await supabase
      .from('clients')
      .insert({ ...clientData, trainer_id: user!.id })
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => [data, ...prev]);
    await supabase.from('activities').insert({
      trainer_id: user!.id,
      type: 'signup',
      message: `${data.name} was added as a new client`,
    });
    return data;
  }, [user]);

  const updateClient = useCallback(async (id: string, updates: Partial<Client>) => {
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === id ? data : c)));
    return data;
  }, []);

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
    await supabase.from('activities').insert({
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
      await supabase.from('activities').insert({
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
    exerciseList: { exercise_id: string; sets: number; reps: number; rest_seconds: number }[]
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
      }));
      await supabase.from('workout_exercises').insert(rows);
    }

    // Refetch full workout with exercises
    const { data: full } = await supabase
      .from('workouts')
      .select('*, workout_exercises(*, exercises(*))')
      .eq('id', workout.id)
      .single();
    if (full) setWorkouts((prev) => [full, ...prev]);

    await supabase.from('activities').insert({
      trainer_id: user!.id,
      type: 'workout',
      message: `Created workout "${name}"`,
    });
    return full || workout;
  }, [user]);

  const deleteWorkout = useCallback(async (id: string) => {
    await supabase.from('workout_exercises').delete().eq('workout_id', id);
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) throw error;
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const assignWorkout = useCallback(async (workoutId: string, clientId: string, date: string) => {
    const { data, error } = await supabase.from('client_workouts').insert({
      workout_id: workoutId,
      client_id: clientId,
      assigned_date: date,
      status: 'assigned',
    }).select().single();
    if (error) throw error;
    if (data) setClientWorkoutsList((prev) => [data, ...prev]);
    const client = clients.find((c) => c.id === clientId);
    const workout = workouts.find((w) => w.id === workoutId);
    await supabase.from('activities').insert({
      trainer_id: user!.id,
      type: 'workout',
      message: `Assigned "${workout?.name}" to ${client?.name || 'client'}`,
    });
  }, [user, clients, workouts]);

  // --- Diet Plan operations ---
  const createDietPlan = useCallback(async (
    name: string,
    description: string,
    mealList: { meal_id: string }[]
  ) => {
    const { data: dietPlan, error } = await supabase
      .from('diet_plans')
      .insert({ trainer_id: user!.id, name, description })
      .select()
      .single();
    if (error) throw error;

    if (mealList.length > 0) {
      const rows = mealList.map((m, i) => ({
        diet_plan_id: dietPlan.id,
        meal_id: m.meal_id,
        order_index: i,
      }));
      await supabase.from('diet_plan_meals').insert(rows);
    }

    const { data: full } = await supabase
      .from('diet_plans')
      .select('*, diet_plan_meals(*, meals(*))')
      .eq('id', dietPlan.id)
      .single();
    if (full) setDiets((prev) => [full, ...prev]);

    await supabase.from('activities').insert({
      trainer_id: user!.id,
      type: 'diet',
      message: `Created diet plan "${name}"`,
    });
    return full || dietPlan;
  }, [user]);

  const deleteDietPlan = useCallback(async (id: string) => {
    await supabase.from('diet_plan_meals').delete().eq('diet_plan_id', id);
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
    await supabase.from('activities').insert({
      trainer_id: user!.id,
      type: 'diet',
      message: `Assigned "${diet?.name}" to ${client?.name || 'client'}`,
    });
  }, [user, clients, diets]);

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

  // --- Notification operations ---
  const markNotificationRead = useCallback(async (id: string) => {
    // Update local state immediately for UI responsiveness
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    // Update db
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  }, []);

  // --- Computed values ---
  const activeClients = useMemo(() => clients.filter((c) => c.status === 'active'), [clients]);
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

  const value: AppContextType = {
    loading,
    trainer,
    clients,
    sessions,
    activities,
    plans,
    referrals,
    workouts,
    exercises,
    diets,
    meals,
    notifications,
    clientWorkouts: clientWorkoutsList,
    clientDiets: clientDietsList,
    activeClients,
    trialClients,
    inactiveClients,
    todaySessions,
    upcomingSessions,
    totalReferrals,
    totalMonthlyRevenue,
    addClient,
    updateClient,
    getClientById,
    addSession,
    updateSession,
    getSessionsForDate,
    getClientSessions,
    updateTrainer,
    createWorkout,
    deleteWorkout,
    assignWorkout,
    createDietPlan,
    deleteDietPlan,
    assignDietPlan,
    getClientWorkouts,
    getClientDiets,
    progressLogs,
    getClientProgress,
    addProgressLog,
    deleteProgressLog,
    markNotificationRead,
    refreshData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
