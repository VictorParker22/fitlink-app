// ============================================================
// revenuecat-webhook — the ONLY writer of trainers.elite_until.
//
// RevenueCat calls this on every subscription lifecycle event. The client
// app never touches elite_until: it can render whatever its local
// entitlement cache says, but the fee split and every server-side gate
// read this column, which only moves when RevenueCat says so.
//
// Setup (RevenueCat dashboard → Integrations → Webhooks):
//   URL:    https://<project>.supabase.co/functions/v1/revenuecat-webhook
//   Header: Authorization: Bearer <RC_WEBHOOK_SECRET>
// and `npx supabase secrets set RC_WEBHOOK_SECRET=<same value>`.
// Deploy with --no-verify-jwt (RevenueCat has no Supabase JWT).
//
// app_user_id is the Supabase auth user id (lib/revenuecat.ts configures
// Purchases with appUserID = user.id), which equals trainers.id for
// coaches. Athlete (client_premium) events carry an athlete's id that
// matches no trainers row — the update affects 0 rows, which is fine.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Events that assert an ACTIVE entitlement with a fresh expiration.
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);
// Events that end access now. (CANCELLATION is deliberately absent — a
// cancelled subscription stays paid-up until its expiration, and the
// EXPIRATION event is what closes it.)
const REVOKE_EVENTS = new Set(['EXPIRATION']);

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('RC_WEBHOOK_SECRET');
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const event = body?.event;
  const type = String(event?.type ?? '');
  const appUserId = String(event?.app_user_id ?? '');
  const entitlements: string[] = Array.isArray(event?.entitlement_ids)
    ? event.entitlement_ids
    : event?.entitlement_id ? [event.entitlement_id] : [];

  const isElite = entitlements.includes('coach_elite');
  const isPremium = entitlements.includes('client_premium');
  if (!appUserId || (!isElite && !isPremium)) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // RevenueCat does not guarantee delivery order. A late EXPIRATION for an
  // old period arriving after a fresh purchase must not revoke the new
  // one, and a late grant must not shorten a longer one. Read the current
  // value and only move it in the direction the event justifies.
  const readCurrent = async (): Promise<number> => {
    if (isElite) {
      const { data } = await admin.from('trainers').select('elite_until').eq('id', appUserId).maybeSingle();
      return data?.elite_until ? new Date(data.elite_until).getTime() : 0;
    }
    const { data } = await admin.from('clients').select('premium_until').eq('auth_user_id', appUserId).maybeSingle();
    return data?.premium_until ? new Date(data.premium_until).getTime() : 0;
  };

  let eliteUntil: string | null = null;
  if (GRANT_EVENTS.has(type)) {
    // expiration_at_ms is RevenueCat's authoritative expiry. A 3-day grace
    // window absorbs renewal/billing-retry lag so a card retry doesn't
    // bounce a paying coach's fee rate for a morning.
    const expMs = Number(event?.expiration_at_ms);
    if (Number.isFinite(expMs) && expMs > 0) {
      eliteUntil = new Date(expMs + 3 * 24 * 60 * 60 * 1000).toISOString();
    } else {
      // Non-expiring purchase shape — grant a renewal-length window.
      eliteUntil = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString();
    }
    // Grants only move forward.
    const current = await readCurrent();
    if (current >= new Date(eliteUntil).getTime()) {
      return new Response(JSON.stringify({ ok: true, noop: 'stale-grant' }), { status: 200 });
    }
  } else if (REVOKE_EVENTS.has(type)) {
    // Revoke only if the stored expiry belongs to the period this event
    // closes. If a newer purchase pushed it further out, leave it.
    const current = await readCurrent();
    const expMs = Number(event?.expiration_at_ms);
    const grace = 3 * 24 * 60 * 60 * 1000;
    if (Number.isFinite(expMs) && expMs > 0 && current > expMs + grace + 60_000) {
      return new Response(JSON.stringify({ ok: true, noop: 'stale-expiration' }), { status: 200 });
    }
    eliteUntil = new Date().toISOString();
  } else {
    // TRANSFER, BILLING_ISSUE, CANCELLATION, TEST … — no access change.
    return new Response(JSON.stringify({ ok: true, noop: type }), { status: 200 });
  }

  // coach_elite → trainers.elite_until (app_user_id IS trainers.id);
  // client_premium → clients.premium_until (app_user_id is the athlete's
  // auth user id — the clients row is keyed by auth_user_id).
  let error = null as { message: string } | null;
  if (isElite) {
    ({ error } = await admin
      .from('trainers')
      .update({ elite_until: eliteUntil })
      .eq('id', appUserId));
  }
  if (!error && isPremium) {
    ({ error } = await admin
      .from('clients')
      .update({ premium_until: eliteUntil })
      .eq('auth_user_id', appUserId));
  }

  if (error) {
    console.error('[revenuecat-webhook] update failed:', error.message);
    // 500 so RevenueCat retries — a dropped grant is a paying user on
    // the wrong entitlement.
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, type, until: eliteUntil }), { status: 200 });
});
