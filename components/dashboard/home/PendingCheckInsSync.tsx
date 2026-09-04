import React, { useEffect } from 'react';
import { useAppBusiness } from '../../../context/AppContext';
import { useRenderCount } from '../../../lib/devRenderCount';
import { supabase } from '../../../lib/supabase';

interface PendingCheckInsSyncProps {
  /** Stable setter from the shell; called with the pending count once fetched. */
  onCount: (count: number) => void;
}

/**
 * Check-ins waiting on a reply — lightweight count, mirrors CheckInInbox's
 * query. Renders nothing. Lives here (business slice, for the trainer id) so
 * the count is fetched once and shared by the subtitle and "Between sessions"
 * rows via a primitive prop, instead of each of them querying.
 */
const PendingCheckInsSync = React.memo(function PendingCheckInsSync({ onCount }: PendingCheckInsSyncProps) {
  useRenderCount('PendingCheckInsSync');
  const { trainer } = useAppBusiness();
  const trainerId = trainer?.id;

  useEffect(() => {
    if (!trainerId) return;
    let cancelled = false;
    (async () => {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const { count } = await supabase
        .from('client_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('trainer_id', trainerId)
        .not('submitted_at', 'is', null)
        .is('coach_replied_at', null)
        .gte('week_start', twoWeeksAgo.toISOString().split('T')[0]);
      if (!cancelled) onCount(count || 0);
    })();
    return () => { cancelled = true; };
  }, [trainerId, onCount]);

  return null;
});

export default PendingCheckInsSync;
