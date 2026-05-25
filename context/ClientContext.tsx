import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface ExerciseLogEntry {
  weight: number;
  reps: number;
  completed: boolean;
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
  assessment_data?: any;
  trial_end_date?: string;
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
  subscription: any;
  paymentHistory: any[];
  exerciseLogs: Record<string, ExerciseLogEntry>;
  logExerciseSet: (workoutId: string, exerciseId: string, setIndex: number, weight: number, reps: number) => void;
  clearExerciseLogs: () => void;
  completeWorkoutWithLog: (clientWorkoutId: string, durationSeconds: number) => Promise<void>;
  markWorkoutComplete: (id: string) => Promise<void>;
  markWorkoutSkipped: (id: string) => Promise<void>;
  requestPlanUpgrade: (planId: string) => Promise<void>;
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
  const [healthSharingEnabled, setHealthSharingEnabled] = useState(false);
  const [activeGymVisit, setActiveGymVisit] = useState<any>(null);

  const fetchClientData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    setLoading(true);
    try {
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (__DEV__) console.log('[ClientContext] Fetch result:', JSON.stringify({ userId: user.id, client: client?.id, clientErr }));

      if (!client) { setLoading(false); return; }
      setClientData(client);
      setHealthSharingEnabled(!!client.health_sharing_enabled);

      const [
        trainerRes, sessionsRes, workoutsRes, dietsRes, progressRes, convRes, plansRes, payRes, visitRes
      ] = await Promise.all([
        supabase.from('trainers').select('*').eq('id', client.trainer_id).single(),
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
      if (convRes.data) setConversation(convRes.data);
      if (plansRes.data) setPlans(plansRes.data);
      if (payRes.data) setPaymentHistory(payRes.data);
      
      // If there's an active gym visit, set it
      if (visitRes && visitRes.data) setActiveGymVisit(visitRes.data);
      else setActiveGymVisit(null);
    } catch (err) {
      if (__DEV__) console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  // Synthesize subscription object from clientData
  useEffect(() => {
    if (clientData && clientData.status === 'active') {
      const activePlan = plans.find(p => p.id === clientData.plan_id) || {
        id: clientData.plan_id || 'custom-plan',
        name: 'Personal Coaching',
        price: '---',
        interval: 'monthly'
      };
      
      setSubscription({
        id: 'sub_' + clientData.id,
        status: clientData.status,
        current_period_end: clientData.trial_end_date || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        plans: activePlan
      });
      return;
    }
    setSubscription(null);
  }, [clientData, plans]);

  const refreshData = useCallback(async () => {
    await fetchClientData();
  }, [fetchClientData]);

  // Log individual exercise set completion (in-memory only)
  const logExerciseSet = useCallback((workoutId: string, exerciseId: string, setIndex: number, weight: number, reps: number) => {
    const key = `${workoutId}-${exerciseId}-${setIndex}`;
    setExerciseLogs((prev) => ({
      ...prev,
      [key]: { weight, reps, completed: true },
    }));
  }, []);

  const clearExerciseLogs = useCallback(() => {
    setExerciseLogs({});
  }, []);

  // Complete workout with full exercise log data
  const completeWorkoutWithLog = useCallback(async (clientWorkoutId: string, durationSeconds: number) => {
    // Persist the log data alongside the workout completion
    const logEntries = Object.entries(exerciseLogs)
      .filter(([key]) => key.startsWith(clientWorkoutId))
      .map(([key, entry]) => {
        const parts = key.replace(`${clientWorkoutId}-`, '').split('-');
        const setIndex = parseInt(parts.pop()!, 10);
        const exerciseId = parts.join('-');
        return {
          client_workout_id: clientWorkoutId,
          exercise_id: exerciseId,
          set_index: setIndex,
          weight: entry.weight,
          reps: entry.reps,
        };
      });

    // Try to save logs (table may not exist yet — that's OK, we still complete)
    if (logEntries.length > 0) {
      const { error: logError } = await supabase.from('client_workout_logs').insert(logEntries);
      if (logError && __DEV__) console.warn('[ClientContext] Log save skipped:', logError.message);
    }

    // Mark workout complete with duration metadata
    const { error } = await supabase
      .from('client_workouts')
      .update({ status: 'completed', duration_seconds: durationSeconds })
      .eq('id', clientWorkoutId);

    if (!error) {
      setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
      // Clear logs for this workout
      setExerciseLogs((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { if (k.startsWith(clientWorkoutId)) delete next[k]; });
        return next;
      });
    }
  }, [exerciseLogs]);

  const markWorkoutComplete = useCallback(async (clientWorkoutId: string) => {
    const { error } = await supabase.from('client_workouts').update({ status: 'completed' }).eq('id', clientWorkoutId);
    if (!error) setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
  }, []);

  const markWorkoutSkipped = useCallback(async (clientWorkoutId: string) => {
    const { error } = await supabase.from('client_workouts').update({ status: 'skipped' }).eq('id', clientWorkoutId);
    if (!error) setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'skipped' } : w));
  }, []);

  const upcomingSessions = useMemo(() =>
    sessions.filter((s) => new Date(s.date) > new Date() && s.status === 'upcoming'), [sessions]);

  const todayWorkout = useMemo(() =>
    workouts.find((w) => new Date(w.assigned_date).toDateString() === new Date().toDateString() && w.status === 'assigned'), [workouts]);

  const requestPlanUpgrade = useCallback(async (planId: string) => {
    if (!clientData) return;
    const { data, error } = await supabase
      .from('clients')
      .update({ status: 'active', plan_id: planId, trial_end_date: null })
      .eq('id', clientData.id)
      .select()
      .single();
    if (error) throw error;
    setClientData(data);
  }, [clientData]);

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
    const binaryStr = atob(base64);
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
    if (!error) {
      setHealthSharingEnabled(enabled);
      setClientData((prev) => prev ? { ...prev, health_sharing_enabled: enabled } as any : prev);
    } else {
      throw error;
    }
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
    
    // Schedule smart reminders
    const { status } = await Notifications.requestPermissionsAsync();
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
    
    // Add XP and drop an activity for the coach
    const xpReward = 50;
    await supabase.from('clients').update({
      completed_workouts: (clientData.completed_workouts || 0) + 1, // Treat gym visit as a workout for XP purposes
    }).eq('id', clientData.id);
    
    await supabase.from('activities').insert({
      trainer_id: clientData.trainer_id,
      type: 'workout_completed',
      message: `${clientData.name} checked out of the gym. Duration: ${durationMinutes} mins (+${xpReward} XP)`,
    });
    
    // Refresh to get updated XP
    refreshData();
  }, [clientData, activeGymVisit]);

  return (
    <ClientContext.Provider value={{
      loading, clientData, trainer, sessions, workouts, diets, progressLogs,
      conversation, plans, upcomingSessions, todayWorkout, exerciseLogs,
      subscription, paymentHistory, healthSharingEnabled, activeGymVisit,
      logExerciseSet, clearExerciseLogs, completeWorkoutWithLog,
      markWorkoutComplete, markWorkoutSkipped, requestPlanUpgrade, updateAssessment, updateClientAvatar, logProgress, cancelSubscription, setupPaymentMethod, toggleHealthSharing, refreshData,
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
