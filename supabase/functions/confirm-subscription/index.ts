// ============================================================
// confirm-subscription — activation that does not wait for the webhook.
//
// The doctrine mirrors confirm-entitlement (RevenueCat): after the athlete's
// card is charged, the app asks the server to look at Stripe NOW and apply
// what it sees, instead of hoping the webhook lands. On 2026-09-08 every
// Stripe delivery was being rejected (a sync signature check the Deno SDK
// refuses), and a paid athlete came back to a pass still "behind" the
// payment, a second tap that failed, and a coach with no revenue. The
// webhook is fixed too, but a paying athlete must never depend on it.
//
// Caller: the athlete themselves or their coach (requireClientAccess).
// Reads the athlete's own client_subscriptions rows, asks Stripe for each
// live one, and for an active/trialing subscription writes exactly what the
// webhook's invoice.payment_succeeded branch writes (shared code in
// _shared/enrollment.ts). Idempotent: a second call changes nothing.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { requireCaller, requireClientAccess, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { guardRate } from '../_shared/rateLimit.ts'
import { internalError } from '../_shared/http.ts'
import { activateStripeSubscription } from '../_shared/enrollment.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const caller = await requireCaller(req)
    const body = await req.json().catch(() => ({}))
    const clientId = String(body?.clientId ?? '')
    const onlySub = typeof body?.subscriptionId === 'string' ? body.subscriptionId.slice(0, 80) : null
    if (!clientId) return json({ error: 'Missing required field: clientId' }, 400)
    const client = await requireClientAccess(caller, clientId)
    const admin = caller.admin

    // Cheap and idempotent, but still bounded: a loop in a broken client
    // must not turn into a Stripe read storm.
    const rl = await guardRate(admin, caller.id, { bucket: 'confirm-subscription', limit: 30, windowSeconds: 3600, daily: 120, global: 5000, paid: false }, corsHeaders)
    if (rl) return rl

    const secret = Deno.env.get('STRIPE_SECRET')
    if (!secret) throw new Error('STRIPE_SECRET is not set')
    const stripe = new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() })

    let q = admin
      .from('client_subscriptions')
      .select('id, client_id, plan_id, trainer_id, stripe_subscription_id, status')
      .eq('client_id', client.id)
      .not('stripe_subscription_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(5)
    if (onlySub) q = q.eq('stripe_subscription_id', onlySub)
    const { data: rows, error } = await q
    if (error) throw error

    const results: { subscriptionId: string; status: string; activated: boolean; planId: string | null }[] = []
    for (const row of rows ?? []) {
      const r = await activateStripeSubscription(admin, stripe, row)
      results.push({ subscriptionId: row.stripe_subscription_id, status: r.status, activated: r.activated, planId: r.activated ? row.plan_id : null })
    }
    const active = results.find((r) => r.activated) ?? null
    console.log('[confirm-subscription]', client.id, 'rows', results.length, 'active', active?.subscriptionId ?? 'none')
    return json({ active: !!active, planId: active?.planId ?? null, subscriptionId: active?.subscriptionId ?? null, results })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'confirm-subscription' })
    console.error('[confirm-subscription]', err?.message ?? err)
    return internalError('confirm-subscription', err, corsHeaders)
  }
})
