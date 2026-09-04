import { useMemo } from 'react';
import { useAppClients, useAppSessions, type AppSessionsSlice, type Client } from '../../../context/AppContext';

/**
 * Shared derivations for the coach home sections. Each hook subscribes only
 * to the slice(s) it reads, so a section that calls it re-renders on those
 * slices and nothing else.
 */

export type HomeSession = AppSessionsSlice['sessions'][number];

/** Everyone not explicitly inactive — the home screen's notion of "active". */
export function activeOf(clients: Client[]): Client[] {
  return clients.filter(c => c.status !== 'inactive');
}

export function clientName(clients: { id: string; name: string }[], clientId?: string): string {
  if (!clientId) return 'Athlete';
  return clients.find(c => c.id === clientId)?.name || 'Athlete';
}

/** Today's sessions, chronological, cancelled ones dropped. Sessions slice only. */
export function useTodaysSessions(): HomeSession[] {
  const { sessions } = useAppSessions();
  return useMemo(() => {
    const now = new Date();
    return sessions
      .filter(s => {
        const d = new Date(s.date);
        return s.status !== 'cancelled' &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sessions]);
}

export type AtRiskEntry = { client: Client; daysSince: number };

/**
 * At-risk: no completed session (or no session at all since joining) in 7+
 * days. Needs clients AND sessions — the one derivation that spans two slices.
 */
export function useAtRiskClients(): AtRiskEntry[] {
  const { clients } = useAppClients();
  const { sessions } = useAppSessions();
  return useMemo(() => {
    const AT_RISK_DAYS = 7;
    const now = Date.now();
    return activeOf(clients)
      .map(client => {
        const cs = sessions.filter(s => s.client_id === client.id && s.status === 'completed');
        const lastMs = cs.length === 0
          ? new Date(client.created_at).getTime()
          : Math.max(...cs.map(s => new Date(s.date).getTime()));
        return { client, daysSince: Math.floor((now - lastMs) / 86400000) };
      })
      .filter(({ daysSince }) => daysSince >= AT_RISK_DAYS);
  }, [clients, sessions]);
}
