/**
 * hooks/usePayouts.ts — the coach's payouts state and the three actions on
 * it, shared by app/payouts.tsx and the sign-up wizard's Payouts stop.
 *
 * State starts from the cached trainer row (instant) and is replaced by
 * Stripe's answer once `refresh()` runs. Every action ends with a refresh,
 * so the screen the coach comes back to always matches what Stripe says.
 *
 * No navigation hooks in here: the wizard mounts outside a navigator in
 * tests, and focus-driven refreshes belong to the screen that has focus.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  type OnboardingOutcome, type PayoutsState, type PayoutsStatus,
  ALL_DUE, NOTHING_DUE,
  fetchPayoutsStatus, openPayoutsOnboarding, openStripeDashboard,
  payoutsErrorText, payoutsStateFor, payoutsStateFromStatus, reportPayoutsFailure,
} from '../lib/payouts';

export type PayoutsBusy = 'none' | 'refreshing' | 'opening' | 'dashboard';

export function usePayouts() {
  const { user } = useAuth();
  const app = useApp() as ReturnType<typeof useApp> & { refreshData?: () => Promise<void> };
  const trainer = app.trainer;
  const refreshData = app.refreshData;
  const trainerId = user?.id ?? trainer?.id ?? null;

  const [status, setStatus] = useState<PayoutsStatus | null>(null);
  const [busy, setBusy] = useState<PayoutsBusy>('none');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const state: PayoutsState = status ? payoutsStateFromStatus(status) : payoutsStateFor(trainer);
  const due = useMemo(() => {
    if (status) return status.due;
    return state === 'connected' ? NOTHING_DUE : ALL_DUE;
  }, [status, state]);
  const pendingVerification = status?.pendingVerification ?? false;

  const refresh = useCallback(async (): Promise<PayoutsStatus | null> => {
    if (!trainerId) return null;
    setBusy((b) => (b === 'none' ? 'refreshing' : b));
    try {
      const next = await fetchPayoutsStatus(trainerId);
      if (!alive.current) return next;
      setStatus(next);
      setError(null);
      // The trainer row changed server-side; pull it so every other screen
      // (home checklist, earnings, settings) agrees without a relaunch.
      refreshData?.().catch(() => {});
      return next;
    } catch (e) {
      if (alive.current) setError(payoutsErrorText(e));
      return null;
    } finally {
      if (alive.current) setBusy((b) => (b === 'refreshing' ? 'none' : b));
    }
  }, [trainerId, refreshData]);

  const start = useCallback(async (): Promise<OnboardingOutcome | 'failed'> => {
    if (!trainerId) return 'failed';
    setBusy('opening');
    setError(null);
    try {
      const outcome = await openPayoutsOnboarding({
        trainerId,
        email: trainer?.email ?? user?.email ?? null,
        name: trainer?.name ?? null,
        hasAccount: !!(status?.hasAccount || trainer?.stripe_account_id),
      });
      if (alive.current) setBusy('refreshing');
      await refresh();
      return outcome;
    } catch (e) {
      reportPayoutsFailure(e, { step: 'start', hasAccount: !!trainer?.stripe_account_id });
      if (alive.current) setError(payoutsErrorText(e));
      return 'failed';
    } finally {
      if (alive.current) setBusy('none');
    }
  }, [trainerId, trainer?.email, trainer?.name, trainer?.stripe_account_id, user?.email, status?.hasAccount, refresh]);

  const openDashboard = useCallback(async () => {
    if (!trainerId) return;
    setBusy('dashboard');
    setError(null);
    try {
      const outcome = await openStripeDashboard(trainerId);
      // Coming back from onboarding (not the dashboard) may have changed the flags.
      if (outcome !== 'dashboard') await refresh();
    } catch (e) {
      reportPayoutsFailure(e, { step: 'dashboard' });
      if (alive.current) setError(payoutsErrorText(e));
    } finally {
      if (alive.current) setBusy('none');
    }
  }, [trainerId, refresh]);

  return { trainerId, state, status, due, pendingVerification, busy, error, refresh, start, openDashboard };
}
