// lib/copilot/actionGenerator.ts
// Generates CopilotActions from per-client metrics.
// Each client produces 0–3 actions; the ranker picks the best globally.

import type { CopilotClientData, CopilotAction } from './types';
import {
  computeRiskFactors,
  computeCompositeChurnRisk,
  computeTrialRisk,
  computeSessionRisk,
  computeCommunicationRisk,
  computeHabitRisk,
} from './churnRisk';

const firstName = (full: string) => full.split(' ')[0];

// ─────────────────────────────────────────────────────────────────────────────

export const generateActionsFromMetrics = (m: CopilotClientData): CopilotAction[] => {
  const factors    = computeRiskFactors(m);
  const churnRisk  = computeCompositeChurnRisk(factors);
  const actions: CopilotAction[] = [];

  // ─── CRITICAL: Trial expiring / expired ───────────────────────────────────
  if (factors.trialRisk >= 80) {
    const daysLeft = m.trialEndsAt
      ? Math.ceil((new Date(m.trialEndsAt).getTime() - Date.now()) / 86400000)
      : -1;

    const headlineText =
      daysLeft < 0  ? 'Trial expired'          :
      daysLeft === 0 ? 'Trial expires today'    :
      `Trial expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`;

    actions.push({
      id:              `${m.clientId}_trial_expiry`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'critical',
      priorityScore:   95 + (factors.trialRisk >= 95 ? 5 : 0),
      category:        'trial_expiry',
      headline:        headlineText,
      subtext:         `${m.clientName} hasn't upgraded yet. Act now to lock in the conversion.`,
      suggestedAction: 'Send a personalised upgrade offer or schedule a call',
      ctaLabel:        daysLeft < 0 ? 'Upgrade Plan' : 'Follow Up',
      ctaRoute:        '/client/[id]',
      ctaParams:       { id: m.clientId, action: 'upgrade' },
      dismissable:     false,
      expiresAt:       m.trialEndsAt ? new Date(m.trialEndsAt) : undefined,
    });
  }

  // ─── HIGH: Unread messages ────────────────────────────────────────────────
  if (m.unreadMessages > 0) {
    actions.push({
      id:              `${m.clientId}_unread`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        m.unreadMessages >= 3 ? 'high' : 'medium',
      priorityScore:   70 + m.unreadMessages * 3,
      category:        'check_in',
      headline:        `${m.unreadMessages} unread message${m.unreadMessages > 1 ? 's' : ''}`,
      subtext:         `${m.clientName} is waiting for your reply.`,
      suggestedAction: 'Respond to their message and keep the momentum going',
      ctaLabel:        'Reply',
      ctaRoute:        '/messages',
      ctaParams:       { clientId: m.clientId },
      dismissable:     false,
    });
  }

  // ─── HIGH: Ghosted — no session + no recent communication ────────────────
  if (factors.sessionRisk >= 70 && factors.communicationRisk >= 60) {
    const daysGhosted = m.lastSessionAt
      ? Math.floor((Date.now() - new Date(m.lastSessionAt).getTime()) / 86400000)
      : 30;

    actions.push({
      id:              `${m.clientId}_ghosted`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'high',
      priorityScore:   85 + churnRisk / 10,
      category:        'ghosted',
      headline:        `No workout in ${daysGhosted} day${daysGhosted !== 1 ? 's' : ''}`,
      subtext:         `${m.clientName} hasn't logged a session and may be disengaging.`,
      suggestedAction: `Send a check-in: "Hey ${firstName(m.clientName)}, everything okay?"`,
      ctaLabel:        'Send Check-in',
      ctaRoute:        '/messages',
      ctaParams:       { clientId: m.clientId, draft: `Hey ${firstName(m.clientName)}, just checking in — noticed you missed last week. Everything okay?` },
      dismissable:     true,
    });
  }

  // ─── HIGH: Habit slip ────────────────────────────────────────────────────
  else if (factors.habitRisk >= 60 && factors.sessionRisk >= 40) {
    const habitRate = m.habitCompletionRate >= 0
      ? `${Math.round(m.habitCompletionRate * 100)}%`
      : 'Low';

    actions.push({
      id:              `${m.clientId}_habit_slip`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'high',
      priorityScore:   75 + factors.habitRisk / 5,
      category:        'habit_slip',
      headline:        `${habitRate} habit completion this week`,
      subtext:         `${m.clientName} is slipping on daily habits. A nudge now prevents a bigger drop.`,
      suggestedAction: 'Review their habit streak and send encouragement',
      ctaLabel:        'View Habits',
      ctaRoute:        '/client/[id]',
      ctaParams:       { id: m.clientId, tab: 'health' },
      dismissable:     true,
    });
  }

  // ─── MEDIUM: Session gap but still communicating ──────────────────────────
  else if (factors.sessionRisk >= 60) {
    const daysSince = m.lastSessionAt
      ? Math.floor((Date.now() - new Date(m.lastSessionAt).getTime()) / 86400000)
      : 30;

    actions.push({
      id:              `${m.clientId}_session_gap`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'medium',
      priorityScore:   60 + factors.sessionRisk / 4,
      category:        'churn_risk',
      headline:        `Last session ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`,
      subtext:         `${m.clientName} hasn't trained recently. Time to re-engage.`,
      suggestedAction: 'Schedule a session or assign a new workout',
      ctaLabel:        'Book Session',
      ctaRoute:        '/schedule',
      ctaParams:       { clientId: m.clientId },
      dismissable:     true,
    });
  }

  // ─── LOW: Coach hasn't checked in recently ────────────────────────────────
  else if (factors.communicationRisk >= 50) {
    actions.push({
      id:              `${m.clientId}_check_in`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'low',
      priorityScore:   40 + factors.communicationRisk / 3,
      category:        'check_in',
      headline:        `No check-in for ${m.daysSinceLastNotif ?? 14} days`,
      subtext:         `You haven't messaged ${m.clientName} recently.`,
      suggestedAction: 'Send a quick encouragement or ask about their week',
      ctaLabel:        'Message',
      ctaRoute:        '/messages',
      ctaParams:       { clientId: m.clientId },
      dismissable:     true,
    });
  }

  // ─── CELEBRATION: 7-day streak detected ──────────────────────────────────
  if (
    m.habitCompletionRate >= 0.7 &&
    m.sessionsCompleted30d >= 4 &&
    factors.sessionRisk < 40
  ) {
    actions.push({
      id:              `${m.clientId}_celebration`,
      clientId:        m.clientId,
      clientName:      m.clientName,
      priority:        'celebration',
      priorityScore:   50,
      category:        'celebration',
      headline:        `${firstName(m.clientName)} is on fire 🔥`,
      subtext:         `High habit completion + consistent sessions. Celebrate this win out loud.`,
      suggestedAction: 'Send a congratulations message to reinforce momentum',
      ctaLabel:        'Celebrate 🎉',
      ctaRoute:        '/messages',
      ctaParams:       { clientId: m.clientId, draft: `🔥 ${firstName(m.clientName)} — you're crushing it! Keep that streak alive.` },
      dismissable:     true,
    });
  }

  // ─── Return: critical items always shown; max 1 non-critical per client ───
  const sorted    = [...actions].sort((a, b) => b.priorityScore - a.priorityScore);
  const criticals = sorted.filter(a => a.priority === 'critical');
  const others    = sorted.filter(a => a.priority !== 'critical').slice(0, 1);

  return [...criticals, ...others];
};
