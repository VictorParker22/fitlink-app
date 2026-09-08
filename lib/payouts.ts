/**
 * lib/payouts.ts — the ONE way the app opens Stripe Connect for a coach
 * (design canvas "FitLink Payouts", 2026-09-08).
 *
 * Before this there were four: the sign-up wizard (auth session), the home
 * setup card's modal (external Safari via Linking.openURL, which returned as
 * a deep link the router could not place — the "unmatched route" after
 * "Return to FitLink"), Earnings (auth session with Linking.createURL) and
 * Settings (auth session through AppContext). Each read a different flag
 * and told the coach a different story. Now every surface routes to
 * /payouts (app/payouts.tsx) or embeds the same panel, and every Stripe
 * hop goes through here:
 *
 *   openPayoutsOnboarding — Stripe opens INSIDE the app as an auth session
 *                           and returns as a resolved promise, never as a
 *                           deep link. Whatever the coach did in Stripe,
 *                           the caller then asks fetchPayoutsStatus.
 *   fetchPayoutsStatus    — connect-account-link in status mode: refreshes
 *                           the trainer flags and says what Stripe still
 *                           needs. Never mints a link; safe on every focus.
 *   openStripeDashboard   — the Express dashboard (a plain web page) when
 *                           set up, else the onboarding session.
 *
 * The pure state logic lives in ./payoutsState.ts.
 */
import * as WebBrowser from 'expo-web-browser';
import * as Sentry from '@sentry/react-native';
import { supabase, SUPABASE_URL } from './supabase';
import { withNetworkRetry } from './authErrors';
import type { PayoutsStatus } from './payoutsState';

export * from './payoutsState';

export const STRIPE_RETURN_URL = 'fitlink://stripe-return';
export const STRIPE_REFRESH_URL = 'fitlink://stripe-refresh';

export type OnboardingOutcome = 'returned' | 'cancelled' | 'already_connected';
export type DashboardOutcome = 'dashboard' | OnboardingOutcome;

type LinkAnswer = Partial<PayoutsStatus> & { url?: string; type?: 'status' | 'dashboard' | 'onboarding'; error?: string };

async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('You are signed out. Sign in and try again.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Stripe did not answer (${res.status}). Try again in a moment.`);
  }
  return data;
}

/** Refresh the trainer's Stripe flags and learn what Stripe still needs. */
export async function fetchPayoutsStatus(trainerId: string): Promise<PayoutsStatus> {
  const data = await withNetworkRetry(
    () => callFn<LinkAnswer>('connect-account-link', { trainerId, mode: 'status' }),
    { retries: 1, delayMs: 800 },
  );
  payoutsBreadcrumb('status', { hasAccount: !!data.hasAccount, charges: !!data.chargesEnabled });
  return {
    hasAccount: !!data.hasAccount,
    onboardingComplete: !!data.onboardingComplete,
    chargesEnabled: !!data.chargesEnabled,
    pendingVerification: !!data.pendingVerification,
    due: data.due ?? { details: !data.chargesEnabled, bank: !data.chargesEnabled, identity: !data.chargesEnabled },
  };
}

/**
 * Open Stripe's hosted onboarding inside the app. Resolves when the coach
 * comes back — by finishing, by tapping Stripe's "Return to FitLink" part
 * way through, or by closing the sheet. The caller refreshes status after
 * every outcome; nothing about the return URL is trusted.
 */
export async function openPayoutsOnboarding(opts: {
  trainerId: string;
  email?: string | null;
  name?: string | null;
  hasAccount: boolean;
}): Promise<OnboardingOutcome> {
  const common = { trainerId: opts.trainerId, returnUrl: STRIPE_RETURN_URL, refreshUrl: STRIPE_REFRESH_URL };
  const data = opts.hasAccount
    ? await callFn<LinkAnswer>('connect-account-link', common)
    : await callFn<LinkAnswer>('create-connect-account', { ...common, email: opts.email || undefined, name: opts.name || undefined });
  if (data.type === 'dashboard') return 'already_connected';
  if (!data.url) throw new Error('Stripe did not return a link. Try again in a moment.');
  payoutsBreadcrumb('open', { hasAccount: opts.hasAccount });
  const result = await WebBrowser.openAuthSessionAsync(data.url, STRIPE_RETURN_URL);
  payoutsBreadcrumb('return', { type: result.type });
  return result.type === 'success' ? 'returned' : 'cancelled';
}

/** The Express dashboard when set up, else the onboarding session. */
export async function openStripeDashboard(trainerId: string): Promise<DashboardOutcome> {
  const data = await callFn<LinkAnswer>('connect-account-link', {
    trainerId, returnUrl: STRIPE_RETURN_URL, refreshUrl: STRIPE_REFRESH_URL,
  });
  if (!data.url) throw new Error('Stripe did not return a link. Try again in a moment.');
  if (data.type === 'dashboard') {
    await WebBrowser.openBrowserAsync(data.url);
    return 'dashboard';
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, STRIPE_RETURN_URL);
  return result.type === 'success' ? 'returned' : 'cancelled';
}

// ── Instrumentation ─────────────────────────────────────────────────────────

type CrumbData = Record<string, string | number | boolean | null | undefined>;

export function payoutsBreadcrumb(message: string, data?: CrumbData): void {
  Sentry.addBreadcrumb({ category: 'payouts', message, level: 'info', data });
}

export function reportPayoutsFailure(err: unknown, data: CrumbData): void {
  Sentry.captureException(err instanceof Error ? err : new Error(String((err as any)?.message ?? err)), {
    tags: { flow: 'payouts' },
    extra: { ...data },
  });
}

export function payoutsErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String((err as any)?.message ?? '');
  if (/network request failed|failed to fetch|abort/i.test(msg)) {
    return "Couldn't reach FitLink. Check your connection and try again.";
  }
  return msg || 'Something went wrong opening Stripe. Try again in a moment.';
}
