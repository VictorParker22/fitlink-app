// hooks/useCoachCopilot.ts
// Wires together useApp() data → per-client metrics → ranked Copilot actions.
// Pure useMemo — no network calls, no loading states, instant on every render.

import { useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { generateActionsFromMetrics } from '../lib/copilot/actionGenerator';
import { rankAndDeduplicate }         from '../lib/copilot/ranker';
import { useDismissedActions }         from './useDismissedActions';
import { useCopilotAnalytics }         from './useCopilotAnalytics';
import type { CopilotClientData, CopilotAction, ActionCategory } from '../lib/copilot/types';

const MS_PER_DAY = 86_400_000;
const now        = () => Date.now();

export const useCoachCopilot = (): {
  actions: CopilotAction[];
  dismissAction: (id: string, category?: ActionCategory) => void;
  trackTap: (category: ActionCategory) => void;
  totalCount: number;
} => {
  // ── Source data from AppContext ────────────────────────────────────────────
  const { clients, sessions, progressLogs, notifications } = useApp();
  const { dismissedIds, dismissAction: baseDismiss } = useDismissedActions();
  const { trackEvent } = useCopilotAnalytics();

  const dismissAction = useCallback((id: string, category?: ActionCategory) => {
    baseDismiss(id);
    if (category) {
      trackEvent('dismissed', category);
    }
  }, [baseDismiss, trackEvent]);

  const trackTap = useCallback((category: ActionCategory) => {
    trackEvent('tapped', category);
  }, [trackEvent]);

  // ── Build per-client metrics + generate actions ───────────────────────────
  const allActions = useMemo(() => {
    const thirtyDaysAgo   = new Date(now() - 30 * MS_PER_DAY);
    const fourteenDaysAgo = new Date(now() - 14 * MS_PER_DAY);

    // Pre-index sessions and progress logs by client_id for O(1) lookups
    const sessionsByClient = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!s.client_id) continue;
      if (!sessionsByClient.has(s.client_id)) sessionsByClient.set(s.client_id, []);
      sessionsByClient.get(s.client_id)!.push(s);
    }

    const progressByClient = new Map<string, typeof progressLogs>();
    for (const p of progressLogs) {
      if (!p.client_id) continue;
      if (!progressByClient.has(p.client_id)) progressByClient.set(p.client_id, []);
      progressByClient.get(p.client_id)!.push(p);
    }

    // Pre-index notifications by client_id (from metadata)
    const notifsByClient = new Map<string, typeof notifications>();
    for (const n of notifications) {
      const cid = (n.metadata as any)?.client_id as string | undefined;
      if (!cid) continue;
      if (!notifsByClient.has(cid)) notifsByClient.set(cid, []);
      notifsByClient.get(cid)!.push(n);
    }

    return clients
      .filter(c => c.status !== 'inactive')
      .flatMap(client => {
        const clientSessions  = sessionsByClient.get(client.id)  ?? [];
        const clientProgress  = progressByClient.get(client.id)  ?? [];
        const clientNotifs    = notifsByClient.get(client.id)     ?? [];

        // ── Session metrics ────────────────────────────────────────────────
        const recentSessions = clientSessions.filter(s => {
          const d = new Date(s.date);
          return d > thirtyDaysAgo && d < new Date();
        });
        const completed30d = recentSessions.filter(s => s.status === 'completed');
        const cancelled30d = recentSessions.filter(s => s.status === 'cancelled');

        const lastCompleted = completed30d
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        // ── Progress metrics ───────────────────────────────────────────────
        const sortedProgress = [...clientProgress]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastProgressLog = sortedProgress[0];
        const progress14d = clientProgress.filter(p => new Date(p.date) > fourteenDaysAgo);

        // ── Communication metrics ──────────────────────────────────────────
        const unread = clientNotifs.filter(n => !n.is_read);
        const sortedNotifs = [...clientNotifs]
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const lastNotif = sortedNotifs[0];
        const daysSinceLastNotif = lastNotif
          ? Math.floor((now() - new Date(lastNotif.created_at).getTime()) / MS_PER_DAY)
          : 14;

        const data: CopilotClientData = {
          clientId:           client.id,
          clientName:         client.name,
          status:             client.status as 'active' | 'trial' | 'inactive',
          trialEndsAt:        client.trial_end_date ?? null,
          sessionsCompleted30d: completed30d.length,
          sessionsCancelled30d: cancelled30d.length,
          lastSessionAt:       lastCompleted?.date ?? null,
          lastProgressLogAt:   lastProgressLog?.date ?? null,
          progressLogs14d:     progress14d.length,
          unreadMessages:      unread.length,
          daysSinceLastNotif,
          habitCompletionRate: -1, // not available from useApp() without extra query
        };

        return generateActionsFromMetrics(data);
      });
  }, [clients, sessions, progressLogs, notifications]);

  // ── Rank globally and apply dismissal filter ──────────────────────────────
  const ranked = useMemo(
    () => rankAndDeduplicate(allActions),
    [allActions],
  );

  const actions = useMemo(
    () => ranked.filter(a => !dismissedIds.has(a.id)),
    [ranked, dismissedIds],
  );

  return { actions, dismissAction, trackTap, totalCount: ranked.length };
};
