// ============================================================
// search-unassigned-clients — "is this person already on FitLink?"
//
// HISTORY OF THIS FUNCTION, because each cut was a real leak:
//  1. `action:'claim'` took authUserId + email from the body and wrote
//     auth_user_id onto a client row — an attacker signed up, posted a
//     victim's email, and bound the victim's account to a stranger's roster.
//  2. It then searched every coachless athlete by name/email/phone prefix
//     and returned email, phone and the athlete's own intake (goals, age,
//     limitations) to any coach, and `action:'link'` let any coach CLAIM any
//     coachless athlete — every Solo athlete on the platform — with the
//     service role, no consent, no invite (found 2026-09-08).
//
// What it is now: a yes/no answer for one EXACT contact. The coach types the
// email or phone of someone they already know; if that person has a
// FitLink account with no coach, they get the name and avatar back and an
// "Invite" button in the app. Joining is the athlete's act (accept_invite).
// Nothing here writes, nothing returns a contact the coach did not type,
// and there is no prefix search to enumerate people with.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireCaller, requireTrainerSelf, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { asEmail, asPhoneDigits, escapeLike } from '../_shared/contact.ts';
import { guardRate } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { trainerId, action } = body ?? {};

    const caller = await requireCaller(req);
    // The coach is whoever is signed in — never whoever the body says.
    requireTrainerSelf(caller, trainerId);
    // Exact-match only, but a probe is a probe: thirty an hour is plenty
    // for a coach typing real contacts.
    const rl = await guardRate(caller.admin, caller.id, { bucket: 'client-lookup', limit: 30, windowSeconds: 3600, daily: 100, paid: false }, corsHeaders);
    if (rl) return rl;

    if (action === 'link' || action === 'claim') {
      return json({ error: 'Athletes join through an invitation now. Send them one from Add athlete.' }, 410);
    }

    const contact = typeof body?.contact === 'string' ? body.contact : (typeof body?.query === 'string' ? body.query : '');
    const email = asEmail(contact);
    const phone = email ? null : asPhoneDigits(contact);
    if (!email && !phone) return json({ data: [] });

    const admin = caller.admin;
    let q = admin
      .from('clients')
      .select('id, name, avatar_url, email, phone, auth_user_id')
      .is('trainer_id', null)
      .not('auth_user_id', 'is', null)
      .limit(5);
    // ilike so a coach-typed "Coach@Example.com" still matches the stored
    // lower-cased row — with the pattern characters escaped, or "%@gmail.com"
    // would match every Gmail athlete (input review, 2026-09-08).
    q = email ? q.ilike('email', escapeLike(email)) : q;
    const { data, error } = await q;
    if (error) return json({ error: 'Search failed' }, 500);

    const rows = (data ?? []).filter((c: { phone?: string | null }) => {
      if (email) return true;
      return asPhoneDigits(c.phone ?? '') === phone;
    });

    // Never echo a stored contact: the coach learns only that the contact
    // THEY typed belongs to someone on FitLink, plus a name and picture to
    // recognise them by.
    return json({
      data: rows.slice(0, 1).map((c: { id: string; name: string | null; avatar_url: string | null }) => ({
        id: c.id,
        name: c.name || 'FitLink athlete',
        avatar_url: c.avatar_url || null,
        onFitLink: true,
        contact: email ?? contact.trim(),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'search-unassigned-clients' });
    console.error('[search-unassigned-clients]', (err as Error)?.message ?? err);
    return json({ error: 'Search failed' }, 500);
  }
});
