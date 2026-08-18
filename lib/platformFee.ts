/**
 * lib/platformFee.ts — the fee a coach is SHOWN, read from the same place
 * Stripe reads the fee it TAKES.
 *
 * There were three client constants (`analytics.tsx`, `create-plan.tsx`, and
 * an inline `* 0.10` in `checkout.tsx`) mirroring three server literals. A
 * coach could therefore be quoted "you keep $90" while Stripe took a different
 * cut — the two numbers were separate constants that happened to agree, one
 * edit apart from lying to the person whose money it is.
 *
 * Now every quote comes from `payment_split_for_trainer()`, the same function
 * the payment edge functions call.
 *
 * `null` means "not known yet". Screens must OMIT the figure while null rather
 * than falling back to 10% — a number a coach plans their pricing around is
 * exactly the kind that must never be guessed (INVARIANTS §4).
 */

import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface PaymentSplit {
  platformFeeBps: number;
  orgShareBps: number;
  orgId: string | null;
  coachKeepsBps: number;
}

/** 1000 bps -> "10%". Trims a trailing .0 so 10.0% reads as 10%. */
export function bpsToPercentLabel(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

/** What the coach keeps from `amount`, using a resolved split. */
export function coachKeeps(amount: number, split: PaymentSplit): number {
  return (amount * split.coachKeepsBps) / 10000;
}

/** What is deducted from `amount` — platform fee plus any org share. */
export function totalDeduction(amount: number, split: PaymentSplit): number {
  return (amount * (split.platformFeeBps + split.orgShareBps)) / 10000;
}

/**
 * The signed-in coach's split. `null` until it loads, and `null` forever if
 * the read fails — callers omit the figure instead of inventing one.
 */
export function usePaymentSplit(trainerId?: string | null): {
  split: PaymentSplit | null;
  loading: boolean;
} {
  const [split, setSplit] = useState<PaymentSplit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!trainerId) { setSplit(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      // .rpc() resolves with { error }; it does not throw.
      const { data, error } = await supabase
        .rpc('payment_split_for_trainer', { p_trainer_id: trainerId })
        .maybeSingle();
      if (!alive) return;
      if (error || !data) {
        if (__DEV__) console.warn('[platformFee] split unavailable:', error?.message);
        setSplit(null);
      } else {
        const r = data as any;
        setSplit({
          platformFeeBps: Number(r.platform_fee_bps ?? 0),
          orgShareBps: Number(r.org_share_bps ?? 0),
          orgId: r.org_id ?? null,
          coachKeepsBps: Number(r.coach_keeps_bps ?? 0),
        });
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [trainerId]);

  return { split, loading };
}
