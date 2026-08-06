// lib/copilot/types.ts
// Shared TypeScript interfaces for the Coach Copilot system.
// All data is derived from useApp() context — no Supabase RPC required.

export type ActionPriority = 'critical' | 'high' | 'medium' | 'low' | 'celebration';
export type ActionCategory =
  | 'churn_risk'
  | 'trial_expiry'
  | 'habit_slip'
  | 'ghosted'
  | 'celebration'
  | 'check_in';

/**
 * Per-client metrics aggregated from the coach's useApp() data slices.
 * Built in useCoachCopilot.ts; consumed by churnRisk.ts and actionGenerator.ts.
 */
export interface CopilotClientData {
  clientId: string;
  clientName: string;
  status: 'active' | 'trial' | 'inactive';
  trialEndsAt: string | null;

  // Session metrics (last 30 days)
  sessionsCompleted30d: number;
  sessionsCancelled30d: number; // proxy for no-shows
  lastSessionAt: string | null; // ISO date of most recent completed session

  // Progress metrics
  lastProgressLogAt: string | null;
  progressLogs14d: number;

  // Communication (from notifications[])
  unreadMessages: number;
  daysSinceLastNotif: number; // days since last notification about this client

  // Habit metric — not available from useApp() without a separate query.
  // -1 means "unknown"; churnRisk defaults to neutral 50 in that case.
  habitCompletionRate: number; // 0.0–1.0, or -1 for unknown
}

/**
 * A single ranked, actionable item displayed in the Copilot card.
 */
export interface CopilotAction {
  id: string;
  clientId: string;
  clientName: string;
  priority: ActionPriority;
  priorityScore: number; // 0–100, higher = shown first
  category: ActionCategory;
  headline: string;
  subtext: string;
  suggestedAction: string;
  ctaLabel: string;
  ctaRoute: string; // Expo Router path, [id] resolved via ctaParams
  ctaParams?: Record<string, string | number | boolean>;
  dismissable: boolean;
  expiresAt?: Date;
}

export interface RiskFactors {
  sessionRisk: number;       // 0 = active, 100 = completely ghosted
  habitRisk: number;         // 0 = compliant, 100 = failing
  communicationRisk: number; // 0 = engaged, 100 = silent
  trialRisk: number;         // 0 = healthy, 100 = expired/expiring today
  progressRisk: number;      // 0 = logging, 100 = stalled
}
