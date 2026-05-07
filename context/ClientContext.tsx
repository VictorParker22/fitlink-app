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
  goals?: string;
  notes?: string;
  auth_user_id?: string;
  progress?: { streak: number; workoutsThisMonth: number };
  created_at: string;
}

interface ClientContextType {
  loading: boolean;
  clientData: ClientData | null;
  trainer: any;
  sessions: any[];
  workouts: any[];
  conversation: any;
  upcomingSessions: any[];
  todayWorkout: any;
  markWorkoutComplete: (id: string) => Promise<void>;
  markWorkoutSkipped: (id: string) => Promise<void>;
}

const ClientContext = createContext<ClientContextType | null>(null);

export function ClientProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [trainer, setTrainer] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [conversation, setConversation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let mounted = true;

    async function fetchClientData() {
      setLoading(true);
      try {
        const { data: client } = await supabase
          .from('clients')
          .select('*')
          .eq('auth_user_id', user!.id)
          .single();

        if (!client || !mounted) { setLoading(false); return; }
        setClientData(client);

        const [trainerRes, sessionsRes, workoutsRes, convRes] = await Promise.all([
          supabase.from('trainers').select('*').eq('id', client.trainer_id).single(),
          supabase.from('sessions').select('*').eq('client_id', client.id).order('date'),
          supabase.from('client_workouts')
            .select('*, workouts(*, workout_exercises(*, exercises(*)))')
            .eq('client_id', client.id)
            .order('assigned_date', { ascending: false }),
          supabase.from('conversations').select('*').eq('client_id', client.id).single(),
        ]);

        if (!mounted) return;
        if (trainerRes.data) setTrainer(trainerRes.data);
        if (sessionsRes.data) setSessions(sessionsRes.data);
        if (workoutsRes.data) setWorkouts(workoutsRes.data);
        if (convRes.data) setConversation(convRes.data);
      } catch (err) {
        console.error('Error loading client data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchClientData();
    return () => { mounted = false; };
  }, [user]);

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

  return (
    <ClientContext.Provider value={{ loading, clientData, trainer, sessions, workouts, conversation, upcomingSessions, todayWorkout, markWorkoutComplete, markWorkoutSkipped }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient() {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useClient must be used within ClientProvider');
  return context;
}
