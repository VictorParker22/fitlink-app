// ============================================================
// rateLimit — per-user sliding-window quota for paid-API functions.
//
// Backs onto public.check_rate_limit (service-role only). A function
// calls guardRate() right after it knows the caller; on refusal it
// returns a 429 the app can surface as "slow down" rather than an
// error. Fails OPEN on an infra error (a rate-limit outage must not
// take a paid feature down) — the abuse ceiling is the whole point,
// not per-call correctness.
//
// caps: input-size clamps so a single call can't inflate token cost.
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateRule {
  bucket: string;
  /** Max calls allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/** Returns null if allowed, or a 429 Response if the limit is hit. */
export async function guardRate(
  admin: SupabaseClient,
  userId: string,
  rule: RateRule,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_user_id: userId,
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    if (error) {
      console.warn('[rateLimit] check failed, allowing:', error.message);
      return null; // fail open
    }
    if (data === false) {
      return new Response(
        JSON.stringify({ error: 'rate_limited', message: 'Too many requests — try again shortly.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    return null;
  } catch (e) {
    console.warn('[rateLimit] threw, allowing:', e);
    return null; // fail open
  }
}

/** Clamp a free-text field to a max length (token-cost defense). */
export function clampText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}
