// ============================================================
// money.ts — where an athlete's dollar goes, resolved server-side.
//
// The platform's cut used to be the literal 0.10 in six places: three edge
// functions and three client screens. That meant the number a coach was SHOWN
// and the number Stripe actually TOOK were separate constants that happened to
// agree — one edit away from a coach being quoted 90% and paid 85%.
//
// Now there is one source: payment_split_for_trainer() in Postgres. It also
// carries the org share, because a coach on a gym's seat pays no marketplace
// fee (the seat is the fee) and the gym takes a cut the owner sets. Returning
// the whole split together is deliberate — a caller cannot take the platform
// fee from here and the org share from somewhere else.
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface PaymentSplit {
  /** FitLink's cut, basis points. 0 for a coach on an org seat. */
  platformFeeBps: number;
  /** The gym's cut of its coaches' athlete revenue, basis points. */
  orgShareBps: number;
  /** The org the coach belongs to, or null for an independent. */
  orgId: string | null;
  /** What reaches the coach, basis points. */
  coachKeepsBps: number;
}

/** 10% — matches platform_config's default. Used only if the lookup fails. */
const FALLBACK_PLATFORM_FEE_BPS = 1000;

/**
 * Resolve the split for one coach.
 *
 * A failed lookup falls back to the independent-coach default rather than
 * throwing: refusing to take a payment because a config read blipped would
 * cost the coach a real sale. The fallback is the SAFE direction — it charges
 * the standard fee rather than accidentally waiving it, and it never invents
 * an org share for someone who may not have one.
 */
export async function getPaymentSplit(
  admin: SupabaseClient,
  trainerId: string,
): Promise<PaymentSplit> {
  const { data, error } = await admin
    .rpc('payment_split_for_trainer', { p_trainer_id: trainerId })
    .maybeSingle();

  if (error || !data) {
    console.warn('[money] split lookup failed, using platform default:', error?.message);
    return {
      platformFeeBps: FALLBACK_PLATFORM_FEE_BPS,
      orgShareBps: 0,
      orgId: null,
      coachKeepsBps: 10000 - FALLBACK_PLATFORM_FEE_BPS,
    };
  }

  const row = data as Record<string, number | string | null>;
  return {
    platformFeeBps: Number(row.platform_fee_bps ?? FALLBACK_PLATFORM_FEE_BPS),
    orgShareBps: Number(row.org_share_bps ?? 0),
    orgId: (row.org_id as string | null) ?? null,
    coachKeepsBps: Number(row.coach_keeps_bps ?? 10000 - FALLBACK_PLATFORM_FEE_BPS),
  };
}

/**
 * The amount Stripe should take as application_fee_amount, in cents.
 *
 * The org share rides along in the SAME application fee: Stripe moves the
 * remainder to the coach's connected account, and FitLink settles the gym's
 * portion separately. Taking it as a second transfer would leave a window
 * where the money is neither the coach's nor the gym's.
 */
export function applicationFeeCents(amountCents: number, split: PaymentSplit): number {
  const bps = split.platformFeeBps + split.orgShareBps;
  return Math.round((amountCents * bps) / 10000);
}

/** Same split as a percent, for Stripe's subscription API which wants one. */
export function applicationFeePercent(split: PaymentSplit): number {
  return (split.platformFeeBps + split.orgShareBps) / 100;
}
