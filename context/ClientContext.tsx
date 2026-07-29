import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import * as Notifications from 'expo-notifications';
import { decode } from 'base-64';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
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
  health_sharing_enabled?: boolean;
  health_sharing_requested?: boolean;
  completed_workouts?: number;
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
  completeTrackWorkout: () => Promise<void>;
  skipTrackWorkout: () => Promise<void>;
  subscription: any;
  paymentHistory: any[];
  exerciseLogs: Record<string, ExerciseLogEntry>;
  logExerciseSet: (workoutId: string, exerciseId: string, setIndex: number, weight: number, reps: number) => void;
  clearExerciseLogs: () => void;
  completeWorkoutWithLog: (clientWorkoutId: string, durationSeconds: number) => Promise<void>;
  markWorkoutComplete: (id: string) => Promise<void>;
  markWorkoutSkipped: (id: string) => Promise<void>;
  
  // Diet Tracking
  mealLogs: Record<string, boolean>;
  logMealEaten: (dietPlanId: string, dietPlanMealId: string) => Promise<void>;
  unlogMeal: (dietPlanId: string, dietPlanMealId: string) => Promise<void>;

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
  const [healthSharingEnabled, setHealthSharingEnabled] = useState(false);
  const [activeGymVisit, setActiveGymVisit] = useState<any>(null);
  const [mealLogs, setMealLogs] = useState<Record<string, boolean>>({});

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

      if (!client) { setLoading(false); return; }
      setClientData(client);
      setHealthSharingEnabled(!!client.health_sharing_enabled);

      const [
        trainerRes, sessionsRes, workoutsRes, dietsRes, progressRes, convRes, plansRes, payRes, visitRes, mealLogsRes, enrollmentRes, trainerWorkoutsRes
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
        supabase.from('client_meal_logs').select('*').eq('client_id', client.id).eq('logged_date', new Date().toISOString().split('T')[0]),
        supabase.from('client_plan_enrollments').select('*').eq('client_id', client.id).eq('status', 'active').order('started_at', { ascending: false }).limit(1),
        supabase.from('workouts').select('*, workout_exercises(*, exercises(*))').eq('trainer_id', client.trainer_id)
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
      if (enrollmentRes?.data && enrollmentRes.data.length > 0) setEnrollment(enrollmentRes.data[0]);
      else setEnrollment(null);
      if (trainerWorkoutsRes?.data) setAllTrainerWorkouts(trainerWorkoutsRes.data);
      
      // Auto-expire stale gym visits (older than 4 hours)
      const MAX_GYM_VISIT_MS = 4 * 60 * 60 * 1000; // 4 hours
      if (visitRes && visitRes.data) {
        const checkInTime = new Date(visitRes.data.check_in_time).getTime();
        const elapsed = Date.now() - checkInTime;
        
        if (elapsed > MAX_GYM_VISIT_MS) {
          // Auto-checkout stale visit with capped duration
          const cappedMinutes = Math.round(MAX_GYM_VISIT_MS / 60000);
          await supabase.from('gym_visits').update({
            check_out_time: new Date(checkInTime + MAX_GYM_VISIT_MS).toISOString(),
            duration_minutes: cappedMinutes,
          }).eq('id', visitRes.data.id);
          setActiveGymVisit(null);
          if (__DEV__) console.log('[ClientContext] Auto-expired stale gym visit:', visitRes.data.id);
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
    await fetchClientData(true);
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
    // Group exerciseLogs by exerciseId
    const exercisesData: Record<string, { id: string, sets: any[] }> = {};
    Object.entries(exerciseLogs)
      .filter(([key]) => key.startsWith(clientWorkoutId))
      .forEach(([key, entry]) => {
        const parts = key.replace(`${clientWorkoutId}-`, '').split('-');
        const setIndex = parseInt(parts.pop()!, 10);
        const exerciseId = parts.join('-');
        
        if (!exercisesData[exerciseId]) {
          exercisesData[exerciseId] = { id: exerciseId, sets: [] };
        }
        exercisesData[exerciseId].sets[setIndex] = {
           weight: entry.weight,
           reps: entry.reps,
           completed: entry.completed
        };
      });

    const exercisesJson = Object.values(exercisesData);

    const logPayload = {
       client_id: clientData?.id,
       client_workout_id: clientWorkoutId,
       workout_id: todayWorkout?.id || null,
       exercises: exercisesJson,
       duration_minutes: Math.round(durationSeconds / 60)
    };

    // Try to save logs (table may not exist yet — that's OK, we still complete)
    if (exercisesJson.length > 0) {
      const { error: logError } = await supabase.from('client_workout_logs').insert(logPayload);
      if (logError && __DEV__) console.warn('[ClientContext] Log save skipped:', logError.message);
    }

    // Mark workout complete
    const { error } = await supabase
      .from('client_workouts')
      .update({ status: 'completed' })
      .eq('id', clientWorkoutId);

    if (error) {
       console.error('[ClientContext] Failed to mark workout complete:', error);
    }

    if (!error) {
      if (clientData) {
        await supabase.from('clients').update({ xp: (clientData.xp || 0) + 50 }).eq('id', clientData.id);
        setClientData(prev => prev ? { ...prev, xp: (prev.xp || 0) + 50 } as any : prev);
      }
      setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
      // Clear logs for this workout
      setExerciseLogs((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { if (k.startsWith(clientWorkoutId)) delete next[k]; });
        return next;
      });
    }
  }, [exerciseLogs, clientData]);

  const markWorkoutComplete = useCallback(async (clientWorkoutId: string) => {
    const { error } = await supabase.from('client_workouts').update({ status: 'completed' }).eq('id', clientWorkoutId);
    if (!error) {
      if (clientData) {
        await supabase.from('clients').update({ xp: (clientData.xp || 0) + 50 }).eq('id', clientData.id);
        setClientData(prev => prev ? { ...prev, xp: (prev.xp || 0) + 50 } as any : prev);
      }
      setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'completed' } : w));
    }
  }, [clientData]);

  const markWorkoutSkipped = useCallback(async (clientWorkoutId: string) => {
    const { error } = await supabase.from('client_workouts').update({ status: 'skipped' }).eq('id', clientWorkoutId);
    if (!error) setWorkouts((prev) => prev.map((w) => w.id === clientWorkoutId ? { ...w, status: 'skipped' } : w));
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
    
    if (error && __DEV__) {
      console.warn('[ClientContext] Failed to log meal:', error);
      // Revert if error
      setMealLogs((prev) => {
        const next = { ...prev };
        delete next[dietPlanMealId];
        return next;
      });
    } else if (!error) {
      await supabase.from('clients').update({ xp: (clientData.xp || 0) + 10 }).eq('id', clientData.id);
      setClientData(prev => prev ? { ...prev, xp: (prev.xp || 0) + 10 } as any : prev);
    }
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
      
    if (error && __DEV__) {
      console.warn('[ClientContext] Failed to unlog meal:', error);
      // Revert if error
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

  const completeTrackWorkout = useCallback(async () => {
    if (!enrollment || !todayWorkout?.enrollmentId) return;
    try {
      const track = Array.isArray(enrollment.track_snapshot)
        ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        : [];
      const node = track[enrollment.track_position];
      
      // Log completion event
      await supabase.from('track_events').insert({
        enrollment_id: enrollment.id,
        client_id: clientData?.id,
        track_position: enrollment.track_position,
        node_type: node?.type || 'workout',
        node_id: node?.id || null,
        event_type: 'completed',
      });
      
      // Advance position
      const newPos = enrollment.track_position + 1;
      const isComplete = newPos >= track.length;
      
      await supabase.from('client_plan_enrollments').update({
        track_position: newPos,
        status: isComplete ? 'completed' : 'active',
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', enrollment.id);
      
      // Refresh enrollment state
      setEnrollment((prev: any) => prev ? { ...prev, track_position: newPos, status: isComplete ? 'completed' : 'active' } : null);
    } catch (e) {
      console.log('[ClientContext] completeTrackWorkout error:', e);
    }
  }, [enrollment, todayWorkout, clientData]);

  const skipTrackWorkout = useCallback(async () => {
    if (!enrollment) return;
    try {
      const track = Array.isArray(enrollment.track_snapshot)
        ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
        : [];
      const node = track[enrollment.track_position];
      
      await supabase.from('track_events').insert({
        enrollment_id: enrollment.id,
        client_id: clientData?.id,
        track_position: enrollment.track_position,
        node_type: node?.type || 'workout',
        node_id: node?.id || null,
        event_type: 'skipped',
      });
      
      const newPos = enrollment.track_position + 1;
      const isComplete = newPos >= track.length;
      
      await supabase.from('client_plan_enrollments').update({
        track_position: newPos,
        status: isComplete ? 'completed' : 'active',
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', enrollment.id);
      
      setEnrollment((prev: any) => prev ? { ...prev, track_position: newPos, status: isComplete ? 'completed' : 'active' } : null);
    } catch (e) {
      console.log('[ClientContext] skipTrackWorkout error:', e);
    }
  }, [enrollment, clientData]);

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
      xp: (clientData.xp || 0) + xpReward,
    }).eq('id', clientData.id);
    
    await supabase.from('activities').insert({
      trainer_id: clientData.trainer_id,
      type: 'workout_completed',
      message: `${clientData.name} checked out of the gym. Duration: ${durationMinutes} mins (+${xpReward} XP)`,
    });
    
    // Optimistic UI update
    setClientData(prev => prev ? { ...prev, completed_workouts: (prev.completed_workouts || 0) + 1, xp: (prev.xp || 0) + xpReward } as any : prev);
    
    // Refresh to get updated XP from backend just in case
    refreshData();
  }, [clientData, activeGymVisit, refreshData]);

  return (
    <ClientContext.Provider value={{
      loading, clientData, trainer, sessions, workouts, diets, progressLogs,
      conversation, plans, upcomingSessions, todayWorkout, enrollment, exerciseLogs,
      subscription, paymentHistory, healthSharingEnabled, activeGymVisit,
        logExerciseSet,
        clearExerciseLogs,
        completeWorkoutWithLog,
        markWorkoutComplete,
        markWorkoutSkipped,
        completeTrackWorkout,
        skipTrackWorkout,
        mealLogs,
        logMealEaten,
        unlogMeal,
        requestPlanUpgrade,
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
