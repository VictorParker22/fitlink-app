// lib/copilot/churnRisk.ts
// Five independent risk factor algorithms + composite churn score.
// All inputs come from CopilotClientData which is built from useApp() data.

import type { CopilotClientData, RiskFactors } from './types';

// ─── Individual risk factors ──────────────────────────────────────────────────

export const computeSessionRisk = (data: CopilotClientData): number => {
  const daysSinceLast = data.lastSessionAt
    ? Math.floor((Date.now() - new Date(data.lastSessionAt).getTime()) / 86400000)
    : 999;

  // Cancelled sessions as proxy for no-show rate
  const totalSessions = data.sessionsCompleted30d + data.sessionsCancelled30d;
  const noShowRate = totalSessions > 0 ? data.sessionsCancelled30d / totalSessions : 0;

  // Exponential decay: each day beyond 7 matters more
  const recencyScore = Math.min(100, Math.pow(daysSinceLast / 7, 1.6) * 20);
  const noShowScore  = noShowRate * 40;

  return Math.min(100, recencyScore + noShowScore);
};

export const computeHabitRisk = (data: CopilotClientData): number => {
  // Habit data not available from useApp() without a dedicated query.
  // Return neutral 50 so it doesn't skew the composite score either way.
  if (data.habitCompletionRate === -1) return 50;

  const rate = data.habitCompletionRate;
  if (rate >= 0.8) return 0;
  if (rate >= 0.6) return 30;
  if (rate >= 0.4) return 60;
  return 100;
};

export const computeCommunicationRisk = (data: CopilotClientData): number => {
  // daysSinceLastNotif approximates "days since coach heard from this client"
  const daysSince = data.daysSinceLastNotif ?? 14;

  // Coach silence penalty (notifications === 0 means coach hasn't checked in)
  const coachSilence = Math.min(50, Math.max(0, (daysSince - 3) * 5));

  // Unread messages compound the risk — client IS reaching out, coach isn't replying
  const unreadPenalty = Math.min(50, data.unreadMessages * 15);

  return Math.min(100, coachSilence + unreadPenalty);
};

export const computeTrialRisk = (data: CopilotClientData): number => {
  if (data.status !== 'trial' || !data.trialEndsAt) return 0;

  const daysLeft = Math.ceil(
    (new Date(data.trialEndsAt).getTime() - Date.now()) / 86400000
  );

  if (daysLeft < 0)  return 100; // expired
  if (daysLeft === 0) return 95;  // today
  if (daysLeft === 1) return 80;  // tomorrow
  if (daysLeft <= 3)  return 60;  // this week
  if (daysLeft <= 7)  return 30;  // soon
  return 0;
};

export const computeProgressRisk = (data: CopilotClientData): number => {
  if (!data.lastProgressLogAt) return 70; // never logged = concerning

  const daysSince = Math.floor(
    (Date.now() - new Date(data.lastProgressLogAt).getTime()) / 86400000
  );

  if (daysSince <= 7)  return 0;
  if (daysSince <= 14) return 30;
  if (daysSince <= 21) return 60;
  return 100;
};

// ─── Composite ───────────────────────────────────────────────────────────────

export const computeRiskFactors = (data: CopilotClientData): RiskFactors => ({
  sessionRisk:       computeSessionRisk(data),
  habitRisk:         computeHabitRisk(data),
  communicationRisk: computeCommunicationRisk(data),
  trialRisk:         computeTrialRisk(data),
  progressRisk:      computeProgressRisk(data),
});

export const computeCompositeChurnRisk = (factors: RiskFactors): number => {
  // Session and trial are strongest predictors of churn
  const weights = {
    session:       0.30,
    habit:         0.25,
    communication: 0.20,
    trial:         0.15,
    progress:      0.10,
  };

  const raw =
    factors.sessionRisk       * weights.session       +
    factors.habitRisk         * weights.habit         +
    factors.communicationRisk * weights.communication +
    factors.trialRisk         * weights.trial         +
    factors.progressRisk      * weights.progress;

  // Compound boost: multiple red flags at once are worse than any single one
  const redFlags     = Object.values(factors).filter(v => v >= 70).length;
  const compoundBoost = redFlags * 8;

  return Math.min(100, raw + compoundBoost);
};
