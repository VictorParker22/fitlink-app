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

interface AppContextType {
  loading: boolean;
  trainer: Trainer | null;
  clients: Client[];
  sessions: Session[];
  activities: Activity[];
  plans: Plan[];
  referrals: Referral[];

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
        const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes] = await Promise.all([
          supabase.from('trainers').select('*').eq('id', user!.id).single(),
          supabase.from('clients').select('*').order('created_at', { ascending: false }),
          supabase.from('plans').select('*').order('price'),
          supabase.from('sessions').select('*').order('date'),
          supabase.from('referrals').select('*').order('date', { ascending: false }),
          supabase.from('activities').select('*').order('timestamp', { ascending: false }).limit(20),
        ]);

        if (!mounted) return;
        if (trainerRes.data) setTrainer(trainerRes.data);
        if (clientsRes.data) setClients(clientsRes.data);
        if (plansRes.data) setPlans(plansRes.data);
        if (sessionsRes.data) setSessions(sessionsRes.data);
        if (referralsRes.data) setReferrals(referralsRes.data);
        if (activitiesRes.data) setActivities(activitiesRes.data);
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
    const [trainerRes, clientsRes, plansRes, sessionsRes, referralsRes, activitiesRes] = await Promise.all([
      supabase.from('trainers').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').order('price'),
      supabase.from('sessions').select('*').order('date'),
      supabase.from('referrals').select('*').order('date', { ascending: false }),
      supabase.from('activities').select('*').order('timestamp', { ascending: false }).limit(20),
    ]);
    if (trainerRes.data) setTrainer(trainerRes.data);
    if (clientsRes.data) setClients(clientsRes.data);
    if (plansRes.data) setPlans(plansRes.data);
    if (sessionsRes.data) setSessions(sessionsRes.data);
    if (referralsRes.data) setReferrals(referralsRes.data);
    if (activitiesRes.data) setActivities(activitiesRes.data);
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
    refreshData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
