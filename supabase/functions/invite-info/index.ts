// ============================================================
// invite-info — what a six-character invite code shows before sign-in.
//
// The website calls this with the anon key (verify_jwt stays ON; the anon
// JWT satisfies it). POST { code } → the public card from invite_public()
// (coach fields from trainers_public only; never the invitee, the message
// or the row), and a hit on mark_invite_opened() when the code is live.
//
// Both RPCs are service-role only, so the function holds the service key
// and does the two calls itself. It never resolves a user.
//
// Rate limit: 60 lookups per hour per client IP, keyed by a sha256 of the
// x-forwarded-for value. This cannot ride _shared/rateLimit.ts:
// check_rate_limit() writes ai_usage.user_id, a FOREIGN KEY to auth.users,
// so a hashed IP would violate it on every call and guardRate would fail
// OPEN on a non-paid bucket. check_key_rate_limit() (same shape, opaque
// text key) is the twin the migration adds; the refusal responses match
// guardRate's so the website handles them the same way. Non-paid bucket:
// an infra error lets the call through.
//
// Logging: never the code and the IP together. Neither is logged at all.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE = { bucket: 'invite-info', limit: 60, windowSeconds: 3600 };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(status === 503 ? { 'Retry-After': '30' } : {}),
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Upper-case, strip everything but letters and digits; null unless six chars remain. */
function normaliseCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.slice(0, 64).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 6 ? code : null;
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for') ?? '';
  const first = forwarded.split(',')[0]?.trim() ?? '';
  return first || 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  try {
    let body: { code?: unknown } | null = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const code = normaliseCode(body?.code);
    if (!code) {
      return json(404, { error: 'not_found' });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Rate limit by hashed IP (fails open: nothing paid behind it) ──
    const key = await sha256Hex(clientIp(req));
    try {
      const { data: allowed, error } = await admin.rpc('check_key_rate_limit', {
        p_key: key,
        p_bucket: RATE.bucket,
        p_limit: RATE.limit,
        p_window_seconds: RATE.windowSeconds,
      });
      if (error) {
        console.error('[invite-info] rate check failed:', error.message);
      } else if (allowed === false) {
        return json(429, { error: 'rate_limited', message: 'Too many requests — try again shortly.' });
      }
    } catch (e) {
      console.error('[invite-info] rate check threw:', e instanceof Error ? e.message : String(e));
    }

    // ── Public card ──
    const { data, error } = await admin.rpc('invite_public', { p_code: code });
    if (error) {
      console.error('[invite-info] invite_public failed:', error.message);
      return json(500, { error: 'lookup_failed' });
    }
    if (!data) {
      return json(404, { error: 'not_found' });
    }

    // ── Opened: only while the invite can still be taken ──
    if ((data as { expired?: unknown }).expired !== true) {
      const { error: markError } = await admin.rpc('mark_invite_opened', { p_code: code });
      if (markError) {
        console.error('[invite-info] mark_invite_opened failed:', markError.message);
      }
    }

    return json(200, data);
  } catch (e) {
    console.error('[invite-info] unexpected:', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'unexpected' });
  }
});
