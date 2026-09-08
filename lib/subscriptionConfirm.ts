/**
 * lib/subscriptionConfirm.ts — ask the server to look at Stripe now and
 * activate this athlete's pass, instead of waiting for the webhook.
 *
 * Same doctrine as lib/entitlement.ts for RevenueCat. Called by checkout
 * right after the payment sheet succeeds (and when create-subscription says
 * the plan is already active), and once per session by ClientContext when
 * the membership row is still 'incomplete' (a paid athlete whose webhook
 * never landed). Never throws.
 */
import { supabase } from './supabase';

export interface SubscriptionConfirm {
  active: boolean;
  planId: string | null;
  subscriptionId: string | null;
}

const ATTEMPT_DELAY_MS = 1500;

export async function confirmSubscription(clientId: string, opts: { subscriptionId?: string; attempts?: number } = {}): Promise<SubscriptionConfirm | null> {
  const attempts = opts.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.functions.invoke<SubscriptionConfirm>('confirm-subscription', {
        body: { clientId, ...(opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}) },
      });
      if (!error && data) {
        if (data.active) return data;
        // Not active yet (Stripe still settling the invoice): try again.
      }
    } catch {
      // fall through to retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS));
  }
  return null;
}
