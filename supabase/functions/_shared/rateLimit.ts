// ============================================================
// rateLimit — per-user sliding-window quota for paid-API functions.
//
// Backs onto public.check_rate_limit (service-role only). A function
// calls guardRate() right after it knows the caller; on refusal it
// returns a 429 the app can surface as "slow down" rather than an
// error.
//
// FAIL CLOSED for paid buckets (roast 2026-09-04): a rate-limit outage
// used to remove every ceiling at once, on the endpoints that spend
// money per call. Now an infra error on a paid bucket returns 503 with a
// retry hint; only `paid: false` buckets still fail open.
//
// Daily ceiling: pass `daily` to add a second window (24h) on the same
// bucket so a client cannot ride the hourly limit forever.
// ============================================================

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RateRule {
  bucket: string;
  /** Max calls allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Optional second ceiling over 24 hours. */
  daily?: number;
  /** Default true: an infra error refuses the call instead of allowing it. */
  paid?: boolean;
}

function refuse(corsHeaders: Record<string, string>, status: number, error: string, message: string) {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...(status === 503 ? { 'Retry-After': '30' } : {}) },
  });
}

/** Returns null if allowed, or a 429/503 Response if refused. */
export async function guardRate(
  admin: SupabaseClient,
  userId: string,
  rule: RateRule,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const paid = rule.paid !== false;
  const windows: { bucket: string; limit: number; windowSeconds: number }[] = [
    { bucket: rule.bucket, limit: rule.limit, windowSeconds: rule.windowSeconds },
  ];
  if (rule.daily) windows.push({ bucket: `${rule.bucket}:day`, limit: rule.daily, windowSeconds: 86_400 });

  for (const w of windows) {
    try {
      const { data, error } = await admin.rpc('check_rate_limit', {
        p_user_id: userId,
        p_bucket: w.bucket,
        p_limit: w.limit,
        p_window_seconds: w.windowSeconds,
      });
      if (error) {
        console.error('[rateLimit] check failed:', w.bucket, error.message);
        if (paid) return refuse(corsHeaders, 503, 'rate_limit_unavailable', 'Please try again in a moment.');
        continue;
      }
      if (data === false) {
        return refuse(
          corsHeaders,
          429,
          'rate_limited',
          w.windowSeconds >= 86_400 ? "That's the daily limit — back tomorrow." : 'Too many requests — try again shortly.',
        );
      }
    } catch (e) {
      console.error('[rateLimit] threw:', w.bucket, e);
      if (paid) return refuse(corsHeaders, 503, 'rate_limit_unavailable', 'Please try again in a moment.');
    }
  }
  return null;
}

/** Clamp a free-text field to a max length (token-cost defense). */
export function clampText(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.length > max ? s.slice(0, max) : s;
}
