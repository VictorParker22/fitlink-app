// ============================================================
// confirm-entitlement — the athlete or coach asks the server to look at
// their RevenueCat record RIGHT NOW and grant what it shows.
//
// Why: clients.premium_until / trainers.elite_until are written by
// revenuecat-webhook, which arrives whenever RevenueCat gets round to it
// (and not at all while the webhook is unconfigured). A paying athlete
// staring at "Activating your subscription…" is the failure this closes.
//
// Trust model: the caller is identified by their Supabase JWT and we ask
// RevenueCat about THAT app_user_id only (lib/revenuecat.ts configures the
// SDK with appUserID = auth user id). The answer comes from RevenueCat's
// server, never from the phone, so the client cannot grant itself. The
// endpoint only ever moves an expiry FORWARD; revocation stays with the
// webhook's EXPIRATION event (compute.ts).
//
// Secret: RC_API_KEY — RevenueCat's v1 GET /subscribers accepts the app's
// public SDK key; a secret key works too and is preferred when one exists.
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts';
import { guardRate } from '../_shared/rateLimit.ts';
import { grantedUntil, nextUntil, type RcEntitlement } from './compute.ts';
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno';
import { syncCoachApplicationFee } from '../_shared/money.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const caller = await requireCaller(req);

    // Not a paid bucket (no model call), but RevenueCat is rate limited too.
    const limited = await guardRate(
      caller.admin,
      caller.id,
      { bucket: 'confirm-entitlement', limit: 30, windowSeconds: 3600, daily: 120, paid: false },
      corsHeaders,
    );
    if (limited) return limited;

    const key = Deno.env.get('RC_API_KEY');
    if (!key) return json({ error: 'not_configured' }, 503);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    let subscriber: any = null;
    try {
      const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(caller.id)}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
        signal: ctl.signal,
      });
      if (!r.ok) {
        console.error('[confirm-entitlement] revenuecat', r.status);
        return json({ error: 'revenuecat_unavailable' }, 502);
      }
      subscriber = (await r.json())?.subscriber ?? null;
    } finally {
      clearTimeout(timer);
    }

    const ents: Record<string, RcEntitlement> = subscriber?.entitlements ?? {};
    const now = Date.now();
    const premiumGrant = grantedUntil(ents.client_premium, now);
    const eliteGrant = grantedUntil(ents.coach_elite, now);

    const admin = caller.admin;
    let premiumUntil: string | null = null;
    let eliteUntil: string | null = null;

    // client_premium → clients.premium_until (row keyed by auth_user_id).
    {
      const { data, error } = await admin
        .from('clients')
        .select('id, premium_until')
        .eq('auth_user_id', caller.id)
        .maybeSingle();
      if (error) throw error;
      premiumUntil = data?.premium_until ?? null;
      const write = nextUntil(premiumGrant, premiumUntil);
      if (write && data?.id) {
        const { error: upErr } = await admin.from('clients').update({ premium_until: write }).eq('id', data.id);
        if (upErr) throw upErr;
        premiumUntil = write;
      }
    }

    // coach_elite → trainers.elite_until (trainers.id IS the auth user id).
    {
      const { data, error } = await admin
        .from('trainers')
        .select('id, elite_until')
        .eq('id', caller.id)
        .maybeSingle();
      if (error) throw error;
      eliteUntil = data?.elite_until ?? null;
      const write = nextUntil(eliteGrant, eliteUntil);
      if (write && data?.id) {
        const { error: upErr } = await admin.from('trainers').update({ elite_until: write }).eq('id', data.id);
        if (upErr) throw upErr;
        eliteUntil = write;
      }
      // Runs once per launch for every coach (RevenueCatContext calls this
      // when entitlements are active) and after every purchase/restore, so a
      // coach's live Stripe subscriptions carry the rate their entitlement
      // earns even if a webhook was missed. Best effort.
      if (data?.id) {
        const stripeSecret = Deno.env.get('STRIPE_SECRET');
        if (stripeSecret) {
          const stripe = new Stripe(stripeSecret, { httpClient: Stripe.createFetchHttpClient() });
          await syncCoachApplicationFee(admin, stripe, data.id);
        }
      }
    }

    return json({
      premium_until: premiumUntil,
      elite_until: eliteUntil,
      active: {
        client_premium: !!premiumUntil && Date.parse(premiumUntil) > now,
        coach_elite: !!eliteUntil && Date.parse(eliteUntil) > now,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders);
    console.error('[confirm-entitlement]', (err as Error)?.message ?? err);
    return json({ error: 'internal' }, 500);
  }
});
