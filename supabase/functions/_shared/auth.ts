// ============================================================
// requireCaller — the missing gate on nearly every edge function.
//
// WHY THIS EXISTS. `verify_jwt = true` (the platform default) only
// proves the Authorization header carries a JWT signed by this project.
// The **anon key satisfies that**, and the anon key ships inside the
// app binary. So "verify_jwt" never established WHO is calling, and
// every function that took a `clientId` / `trainerId` from the request
// body and acted on it with the service-role key was doing so for a
// caller it had never identified. That single pattern was the root of
// the critical findings in .agents/SECURITY_FIX_PLAN.md: subscribe or
// cancel anyone, hijack a coach's Stripe payout destination, take over
// an athlete's record.
//
// `supabaseClient.auth.getUser()` is the difference: it resolves the
// bearer to a real row in auth.users. An anon key resolves to null.
//
// transfer-vod already did this correctly and is the pattern this
// generalises.
// ============================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface Caller {
  id: string;
  email?: string;
  /** Service-role client. Only reachable AFTER the caller is identified. */
  admin: SupabaseClient;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolves the request's bearer token to a real authenticated user.
 * Throws AuthError(401) for the anon key, a missing header, or an
 * expired/invalid token.
 */
export async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new AuthError('Missing Authorization header');

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  // The anon key is a VALID JWT with no user behind it — this is the
  // check that distinguishes "signed by the project" from "is someone".
  if (error || !data?.user) throw new AuthError('Unauthorized');

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    admin: createClient(SUPABASE_URL, SERVICE_ROLE_KEY),
  };
}

/**
 * The caller must BE this client, or be the coach that client belongs
 * to. Returns the client row so callers don't re-query it.
 *
 * Covers both id spaces deliberately (INVARIANTS §1): `clientId` may
 * arrive as clients.id or as an auth user id depending on the caller,
 * and both are matched against the SAME caller identity, so neither
 * spelling grants access to someone else's row.
 */
export async function requireClientAccess(caller: Caller, clientId: string) {
  const { data: client, error } = await caller.admin
    .from('clients')
    .select('id, trainer_id, auth_user_id, email, stripe_customer_id, name')
    .or(`id.eq.${clientId},auth_user_id.eq.${clientId}`)
    .maybeSingle();

  if (error || !client) throw new AuthError('Client not found', 404);

  const isTheAthlete = client.auth_user_id === caller.id;
  const isTheirCoach = client.trainer_id === caller.id;
  if (!isTheAthlete && !isTheirCoach) {
    throw new AuthError('Not authorized for this client', 403);
  }
  return client;
}

/** The caller must BE this trainer. */
export function requireTrainerSelf(caller: Caller, trainerId: string) {
  if (!trainerId || trainerId !== caller.id) {
    throw new AuthError('Not authorized for this coach', 403);
  }
}

/**
 * Only the service role may run this (webhook-internal, cron payouts).
 * Compares the bearer to the service-role key directly — these paths
 * have no user and must never be reachable from the app.
 */
export function requireServiceRole(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || token !== serviceKey) {
    throw new AuthError('Service role required', 403);
  }
}

/**
 * Record a denial so the ops status centre has an auth-failure stream to show.
 *
 * Until now every guard in this codebase REJECTED silently: an attacker
 * hammering the payment endpoints and a user with an expired token looked
 * identical from the outside, because neither left a trace. Fire-and-forget by
 * design — a logging failure must never turn into a request failure.
 *
 * Never logs the token, the body, or anything else that could carry a
 * credential; the endpoint name and the status are what a signal needs.
 */
export function logDenial(err: unknown, opts?: { req?: Request; endpoint?: string }): void {
  if (!(err instanceof AuthError)) return;
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    void admin.from('audit_events').insert({
      event_type: 'auth.denied',
      severity: err.status === 403 ? 'warn' : 'info',
      subject: opts?.endpoint ?? null,
      detail: {
        status: err.status,
        reason: err.message,
        // Caller-supplied and spoofable, but it is what groups a burst of
        // denials into one signal. Treated as a hint, never as identity.
        ip: opts?.req?.headers.get('x-forwarded-for') ?? null,
      },
    }).then(undefined, () => {});
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Uniform error response so every function fails the same way — and, since
 * every guarded function already routes its denials through here, the single
 * place that can turn all of them into a stream without touching 15 files.
 *
 * Pass `opts` where the request is in scope to get the grouping hint too.
 */
export function authErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string>,
  opts?: { req?: Request; endpoint?: string },
) {
  logDenial(err, opts);
  const status = err instanceof AuthError ? err.status : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
