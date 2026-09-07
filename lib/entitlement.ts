/**
 * lib/entitlement.ts — ask the server to sync this account's RevenueCat
 * entitlements into clients.premium_until / trainers.elite_until now,
 * instead of waiting for the webhook. Called after a purchase or restore
 * (context/RevenueCatContext.tsx) and by the Solo corner when it meets a
 * 402 right after a purchase.
 *
 * Never throws: a failed confirm just leaves the webhook to do its job.
 */
import { supabase } from './supabase';

export interface EntitlementConfirm {
  premium_until: string | null;
  elite_until: string | null;
  active: { client_premium: boolean; coach_elite: boolean };
}

const ATTEMPT_DELAY_MS = 1500;

export async function confirmEntitlement(attempts = 2): Promise<EntitlementConfirm | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await supabase.functions.invoke<EntitlementConfirm>('confirm-entitlement', { body: {} });
      if (!error && data && data.active) return data;
    } catch {
      // fall through to retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS));
  }
  return null;
}
