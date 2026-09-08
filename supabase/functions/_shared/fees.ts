// ============================================================
// fees.ts — the pure rules for keeping a coach's Stripe fee in step with
// their entitlement. No imports, so tests/fees.test.ts can load it.
//
// The rate itself comes from payment_split_for_trainer() (Elite = 500 bps,
// org seat = 0, default = platform_config). What this file decides is
// WHETHER a live Stripe subscription needs its application_fee_percent
// rewritten, and what a draft invoice's fee should be.
// ============================================================

/** Subscriptions whose future invoices are still ours to re-price. */
export const LIVE_SUB_STATUSES: readonly string[] = ['active', 'trialing', 'past_due', 'incomplete'];

export function isLiveSubStatus(status: string | null | undefined): boolean {
  return !!status && LIVE_SUB_STATUSES.includes(status);
}

/**
 * Stripe stores application_fee_percent with two decimals; a missing value
 * (a subscription created without one) always counts as different.
 */
export function feeDiffers(current: number | string | null | undefined, desiredPercent: number): boolean {
  if (current === null || current === undefined || current === '') return true;
  const n = typeof current === 'number' ? current : Number(current);
  if (!Number.isFinite(n)) return true;
  return Math.abs(n - desiredPercent) > 0.005;
}

/** Fee in cents for an invoice total, at the given percent. Never negative. */
export function invoiceFeeCents(totalCents: number, feePercent: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  return Math.max(0, Math.round((totalCents * feePercent) / 100));
}

/**
 * Invoices we re-price. The creation invoice was priced moments ago by
 * create-subscription from the same split; only renewals and manual
 * invoices can have drifted.
 */
export function shouldRepriceInvoice(billingReason: string | null | undefined, status: string | null | undefined): boolean {
  if (billingReason === 'subscription_create') return false;
  return status === 'draft';
}
