/**
 * lib/payoutsState.ts — the pure half of the coach payouts flow (design
 * canvas "FitLink Payouts", 2026-09-08). No imports, so the tests and the
 * edge function's mirror can agree on one definition of each state.
 *
 * Three states, read from the trainer row and refreshed from Stripe:
 *   not_connected — no Connect account yet
 *   in_progress   — an account exists but Stripe cannot charge for it yet
 *                   (details missing, or Stripe is verifying)
 *   connected     — charges enabled: athletes can be charged, payouts flow
 *
 * `connected` is charges_enabled, not details_submitted: details_submitted
 * turns true the moment the coach reaches the end of Stripe's form, while
 * charges stay off until verification clears — and create-subscription
 * refuses a charge until they are on. Showing "connected" on the earlier
 * flag told coaches they could sell passes that the server then rejected.
 */

export type PayoutsState = 'not_connected' | 'in_progress' | 'connected';

export interface PayoutsDue {
  details: boolean;
  bank: boolean;
  identity: boolean;
}

export interface PayoutsStatus {
  hasAccount: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  pendingVerification: boolean;
  due: PayoutsDue;
}

export type TrainerPayoutFlags = {
  stripe_account_id?: string | null;
  stripe_onboarding_complete?: boolean | null;
  stripe_charges_enabled?: boolean | null;
} | null | undefined;

export const ALL_DUE: PayoutsDue = { details: true, bank: true, identity: true };
export const NOTHING_DUE: PayoutsDue = { details: false, bank: false, identity: false };

/** State from the cached trainer row — what every screen shows before Stripe answers. */
export function payoutsStateFor(trainer: TrainerPayoutFlags): PayoutsState {
  if (!trainer) return 'not_connected';
  if (trainer.stripe_charges_enabled) return 'connected';
  if (trainer.stripe_account_id) return 'in_progress';
  return 'not_connected';
}

/** State from a fresh connect-account-link status answer. */
export function payoutsStateFromStatus(status: PayoutsStatus): PayoutsState {
  if (status.chargesEnabled) return 'connected';
  if (status.hasAccount) return 'in_progress';
  return 'not_connected';
}

/** True when athletes can actually be charged for this coach's passes. */
export function payoutsReady(trainer: TrainerPayoutFlags): boolean {
  return payoutsStateFor(trainer) === 'connected';
}

/**
 * Stripe's requirement keys folded into the three lines the in-progress
 * screen shows. `external_account` is the bank; anything about verification,
 * an ID number or the last four of an SSN is identity; the rest (name, DOB,
 * address, phone, terms) is "your details". Mirrored in
 * supabase/functions/connect-account-link; keep the two in step.
 */
export function dueFromRequirements(keys: readonly string[]): PayoutsDue {
  const due: PayoutsDue = { details: false, bank: false, identity: false };
  for (const k of keys) {
    if (k === 'external_account') due.bank = true;
    else if (/verification|id_number|ssn_last_4/.test(k)) due.identity = true;
    else due.details = true;
  }
  return due;
}

/**
 * Where fitlink://stripe-return and stripe-refresh land when the router, not
 * the in-app auth session, receives them (external Safari, Android, a cold
 * start). A coach goes to the payouts screen, which re-reads Stripe on
 * focus; nothing else about the return is trusted.
 */
export function landingAfterStripe(
  role: 'client' | 'trainer' | string | null | undefined,
  authenticated: boolean,
): string {
  if (!authenticated) return '/(auth)/welcome';
  if (role === 'client') return '/(client-tabs)';
  return '/payouts';
}

/** Copy for the status header, per state. The panel and the wizard share it. */
export function payoutsHeadline(state: PayoutsState, pendingVerification = false): { title: string; subtitle: string } {
  switch (state) {
    case 'connected':
      return { title: 'Payouts are on.', subtitle: 'Stripe pays your bank after every charge.' };
    case 'in_progress':
      return pendingVerification
        ? { title: 'Almost there.', subtitle: 'Stripe is checking your details. Usually a day or two.' }
        : { title: 'Almost there.', subtitle: 'Stripe still needs a few details from you.' };
    default:
      return { title: 'Where should the money go?', subtitle: 'Athletes pay in the app. Stripe pays your bank. Setting it up takes about five minutes and happens inside FitLink.' };
  }
}
