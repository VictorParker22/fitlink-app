// ============================================================
// search-unassigned-clients — REWRITTEN for security, 2026-08-18.
// See .agents/SECURITY_FIX_PLAN.md (B5).
//
// The previous version held three separate critical vulnerabilities,
// all reachable with the anon key that ships inside the app binary:
//
//  1. `action:'claim'` took authUserId + email from the body and wrote
//     `clients.auth_user_id = authUserId` on the row matched BY EMAIL.
//     An attacker signed up, posted a victim's email, and bound the
//     victim's client record to their own login — full takeover of that
//     athlete's health data, logs, photos and coach thread. **That
//     action is deleted outright.** The app never called it (verified
//     across app/, components/, context/, lib/); only `search` and
//     `link` are used, by app/add-client.tsx.
//
//  2. `action:'link'` reassigned ANY client to ANY coach, both ids
//     self-asserted. Now: the caller must be the coach, and only a
//     genuinely unassigned client (trainer_id IS NULL) can be claimed.
//
//  3. The search returned other coaches' clients and enumerated
//     auth.users, leaking email/phone/age/gender/weight/height for
//     every client-role account matching a 2-character query. Now it
//     returns only unassigned records, and the auth.users sweep is
//     restricted to accounts with no client row at all.
//
// Also fixed: PostgREST filter injection. `q` was interpolated raw into
// `.or(...)`, where commas, parentheses and dots are structural — so a
// crafted query broke out of the predicate and turned the search into a
// selectable dump of `clients` under the service-role key.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  requireCaller,
  requireTrainerSelf,
  AuthError,
  authErrorResponse,
} from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

/**
 * PostgREST's `or` grammar treats , . ( ) : and quotes as structure.
 * A value containing them can append arbitrary filters, so strip them
 * rather than escape them — a name search has no legitimate need for
 * any of these characters, and stripping cannot be got wrong.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,().:"'\\%*]/g, '').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, query, trainerId } = body;

    // Identify the caller BEFORE any service-role work. The anon key
    // resolves to no user and is rejected here.
    const caller = await requireCaller(req);
    // The coach is whoever is signed in — never whoever the body says.
    requireTrainerSelf(caller, trainerId);
    const supabase = caller.admin;

    // ── link: claim an UNASSIGNED client ──────────────────────────
    if (action === 'link') {
      const { clientId } = body;
      if (!clientId) return json({ error: 'clientId required' }, 400);

      // `trainer_id IS NULL` is the whole security property: a client
      // who already has a coach can never be taken from them.
      const { data, error } = await supabase
        .from('clients')
        .update({ trainer_id: caller.id })
        .eq('id', clientId)
        .is('trainer_id', null)
        .select('id')
        .maybeSingle();

      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ error: 'That client already has a coach' }, 409);
      return json({ success: true });
    }

    // ── search ────────────────────────────────────────────────────
    if (!query || typeof query !== 'string') return json({ data: [] });
    const q = sanitizeSearchTerm(query.toLowerCase());
    if (q.length < 2) return json({ data: [] });

    const results: any[] = [];
    const seenEmails = new Set<string>();

    // Only genuinely unassigned client rows. Other coaches' clients are
    // not the caller's business and are no longer returned at all.
    const { data: foundClients } = await supabase
      .from('clients')
      .select('id, name, email, phone, avatar_url, status')
      .is('trainer_id', null)
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);

    for (const client of foundClients || []) {
      const email = client.email?.toLowerCase();
      if (email) seenEmails.add(email);
      results.push({
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        avatar_url: client.avatar_url,
        status: client.status,
        hasTrainer: false,
      });
    }

    // Accounts that signed up but have no client row yet. Restricted to
    // exactly that set: an account already attached to a coach is never
    // surfaced, so this can no longer be used to enumerate the userbase.
    const { data: linkedRows } = await supabase
      .from('clients')
      .select('auth_user_id')
      .not('auth_user_id', 'is', null);
    const linkedAuthIds = new Set((linkedRows || []).map((r: any) => r.auth_user_id));

    const { data: userPage } = await supabase.auth.admin.listUsers({ perPage: 50 });
    for (const user of userPage?.users || []) {
      if (user.user_metadata?.role !== 'client') continue;
      if (linkedAuthIds.has(user.id)) continue;

      const email = user.email?.toLowerCase() || '';
      const name = (user.user_metadata?.name || '').toLowerCase();
      if (!email.includes(q) && !name.includes(q)) continue;
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);

      results.push({
        id: `auth_${user.id}`,
        authUserId: user.id,
        name: user.user_metadata?.name || email.split('@')[0],
        email: user.email,
        phone: user.phone || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        status: 'new',
        hasTrainer: false,
        // Intake the athlete themselves completed. Shown to the coach only
        // at the moment they add them. TWO generations of keys exist:
        // signup-era metadata gated on `onboarding_complete`, and the
        // client-onboarding flow's `intake_*` keys gated on
        // `client_onboarded` (added 2026-08-20 with the coachless-athlete
        // path). Gating on only the old flag made every new coachless
        // athlete look like they had no intake at all — a false "No intake
        // yet" in the coach's search results about data that exists.
        assessment_data: (user.user_metadata?.onboarding_complete || user.user_metadata?.client_onboarded)
          ? {
              // New-generation intake (client-onboarding). Nulls when absent;
              // the app omits absent fields rather than rendering them.
              intake_goal: user.user_metadata.intake_goal || null,
              intake_days: user.user_metadata.intake_days ?? null,
              intake_experience: user.user_metadata.intake_experience || null,
              intake_limitation: user.user_metadata.intake_limitation || null,
              // Signup-era intake.
              fitness_goals: user.user_metadata.fitness_goals || [],
              fitness_goal: user.user_metadata.fitness_goal || null,
              training_styles: user.user_metadata.training_styles || [],
              activities: user.user_metadata.activities || [],
              commit_days: user.user_metadata.commit_days || null,
              age: user.user_metadata.age || null,
              gender: user.user_metadata.gender || null,
              weight: user.user_metadata.weight || null,
              height: user.user_metadata.height || null,
            }
          : null,
      });
    }

    return json({ data: results.slice(0, 10) });
  } catch (error: any) {
    if (error instanceof AuthError) return authErrorResponse(error, corsHeaders, { req, endpoint: 'search-unassigned-clients' });
    console.error('search-unassigned-clients failed:', error?.message);
    return json({ error: 'Search failed', data: [] }, 500);
  }
});
