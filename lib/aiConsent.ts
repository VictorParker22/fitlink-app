/**
 * aiConsent — Apple 5.1.2(i): the athlete must affirmatively agree before
 * any of their data leaves the app for a third-party AI model (Gemini, via
 * solo-corner / coach-assistant). Consent lives on the auth user's own
 * metadata — it survives reinstalls and travels with the account, not the
 * device — and is mirrored onto the `clients` row (when one exists) so
 * server-side functions can check it without a second auth round trip.
 */
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** True once this account has ever agreed to send data to the AI model. */
export function hasAiConsent(user: User | null | undefined): boolean {
  return !!user?.user_metadata?.ai_consent_at;
}

/**
 * Record consent now. Writes the auth user's metadata (source of truth) and,
 * best-effort, the `clients` row for this account — a coachless athlete may
 * not have one yet, and a trainer asking their own AI coach never will;
 * either way the auth-metadata write is what `hasAiConsent` reads.
 */
export async function grantAiConsent(): Promise<void> {
  const iso = new Date().toISOString();
  const { data, error } = await supabase.auth.updateUser({ data: { ai_consent_at: iso } });
  if (error) throw error;

  const userId = data?.user?.id;
  if (userId) {
    const { error: clientErr } = await supabase
      .from('clients')
      .update({ ai_consent_at: iso })
      .eq('auth_user_id', userId);
    // A no-op when this account has no clients row (e.g. a trainer) — only
    // log the unexpected case where a row exists but the write failed.
    if (clientErr && __DEV__) console.warn('[aiConsent] clients row not updated:', clientErr.message);
  }
}
