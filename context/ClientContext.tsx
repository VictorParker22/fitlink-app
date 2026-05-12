import { createContext, useContext, useState, useEffect, useCallback, useMemo, type PropsWithChildren } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

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
  markWorkoutComplete: (id: string) => Promise<void>;
  markWorkoutSkipped: (id: string) => Promise<void>;
  requestPlanUpgrade: (planId: string) => Promise<void>;
  updateAssessment: (data: any) => Promise<void>;
  refreshData: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  const fetchClientData = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    setLoading(true);
    try {
      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      console.log('[ClientContext] Fetch result:', JSON.stringify({ userId: user.id, client: client?.id, clientErr }));

      if (!client) { setLoading(false); return; }
      setClientData(client);

      const [trainerRes, sessionsRes, workoutsRes, dietsRes, progressRes, convRes, plansRes] = await Promise.all([
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
      ]);

      console.log('[ClientContext] Related data:', JSON.stringify({
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
    } catch (err) {
      console.error('Error loading client data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchClientData();
  }, [fetchClientData]);

  const refreshData = useCallback(async () => {
    await fetchClientData();
  }, [fetchClientData]);

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

  return (
    <ClientContext.Provider value={{
      loading, clientData, trainer, sessions, workouts, diets, progressLogs,
      conversation, plans, upcomingSessions, todayWorkout,
      markWorkoutComplete, markWorkoutSkipped, requestPlanUpgrade, updateAssessment, refreshData,
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
