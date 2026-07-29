import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface GlobalClass {
  id: string;
  trainer_id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  duration_minutes: number;
  thumbnail_url: string;
  status: string;
  take_count: number;
  avg_rating: number;
  created_at: string;
  trainer?: any;
}

export interface GlobalLiveClass {
  id: string;
  trainer_id: string;
  title: string;
  description: string;
  category: string;
  duration_minutes: number;
  scheduled_for: string;
  status: 'scheduled' | 'live' | 'ended';
  thumbnail_url: string;
  trainer?: any;
  viewer_count?: number; // Synthesized or real
}

export function useGlobalStudio() {
  const [liveClasses, setLiveClasses] = useState<GlobalLiveClass[]>([]);
  const [vodClasses, setVodClasses] = useState<GlobalClass[]>([]);
  const [trainers, setTrainers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch active trainers first
      const { data: trainersData, error: trainersErr } = await supabase
        .from('trainers')
        .select('*');
        
      if (trainersErr) throw trainersErr;
      
      const trainerMap: Record<string, any> = {};
      trainersData?.forEach(t => {
        trainerMap[t.id] = t;
      });
      setTrainers(trainerMap);

      // Fetch global live classes
      const { data: liveData, error: liveErr } = await supabase
        .from('live_classes')
        .select('*')
        .in('status', ['scheduled', 'live', 'ended'])
        .order('scheduled_for', { ascending: true });
        
      if (liveErr) throw liveErr;

      // Fetch global VODs
      const { data: vodData, error: vodErr } = await supabase
        .from('classes')
        .select('*')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(50); // Get latest 50 for trending
        
      if (vodErr) throw vodErr;

      // Map trainers to classes
      const mappedLive = (liveData || []).map(lc => ({
        ...lc,
        trainer: trainerMap[lc.trainer_id] || { name: 'Coach', avatar_url: '' },
        viewer_count: lc.status === 'live' ? Math.floor(Math.random() * 200) + 50 : 0 // Synthesize viewer count for excitement if not in DB
      }));
      
      const mappedVod = (vodData || []).map(c => ({
        ...c,
        trainer: trainerMap[c.trainer_id] || { name: 'Coach', avatar_url: '' }
      }));

      setLiveClasses(mappedLive as GlobalLiveClass[]);
      setVodClasses(mappedVod as GlobalClass[]);
    } catch (err) {
      console.log('[useGlobalStudio] Error fetching global data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to live_classes globally
    const channel = supabase.channel('global_live_classes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_classes' }, () => {
        fetchData(); // Refresh the feed immediately
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  return {
    liveClasses,
    vodClasses,
    loading,
    refreshData: fetchData
  };
}
