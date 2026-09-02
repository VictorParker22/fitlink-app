// ============================================================
// delete-trainer-account — the coach-side "delete my account".
//
// delete_trainer_account() used to be called straight from the app. It
// cascaded the coach's rows and left every athlete's Stripe subscription
// billing against a Connect account with no owner. Now:
//   1. verify the caller and that they are a coach,
//   2. cancel (immediately) every live Stripe subscription that pays them,
//   3. only then remove the rows via the service-role RPC.
//
// If Stripe cannot be reached the account is NOT deleted and the caller
// is told so — deleting first and hoping is how people keep getting
// charged by a business that no longer exists.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { requireCaller, AuthError, authErrorResponse } from '../_shared/auth.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const caller = await requireCaller(req)
    const admin = caller.admin
    const uid = caller.id

    const { data: trainer } = await admin
      .from('trainers')
      .select('id, stripe_account_id')
      .eq('id', uid)
      .maybeSingle()
    if (!trainer) return json({ error: 'Trainer profile not found' }, 404)

    // Every subscription that still pays this coach.
    const { data: subs, error: subsErr } = await admin
      .from('client_subscriptions')
      .select('id, stripe_subscription_id, status')
      .eq('trainer_id', uid)
      .not('stripe_subscription_id', 'is', null)
      .in('status', ['active', 'trialing', 'past_due', 'unpaid', 'incomplete'])
    if (subsErr) return json({ error: 'Could not read subscriptions' }, 500)

    const failed: string[] = []
    for (const s of subs ?? []) {
      try {
        await stripe.subscriptions.cancel(s.stripe_subscription_id, {
          // Refund policy is the coach's; we stop the clock, nothing more.
          prorate: false,
        })
        await admin
          .from('client_subscriptions')
          .update({ status: 'canceled', updated_at: new Date().toISOString() })
          .eq('id', s.id)
      } catch (e: any) {
        // "already canceled" is success for our purposes.
        if (e?.code === 'resource_missing' || /No such subscription|already been canceled/i.test(e?.message ?? '')) {
          continue
        }
        failed.push(s.stripe_subscription_id)
      }
    }

    if (failed.length > 0) {
      return json({
        error: 'We could not cancel every athlete subscription with our payment processor. Your account has not been deleted. Try again in a moment.',
        failed: failed.length,
      }, 502)
    }

    const { error: rpcErr } = await admin.rpc('delete_trainer_account_for', { p_user_id: uid })
    if (rpcErr) return json({ error: rpcErr.message }, 500)

    return json({ success: true, canceled: (subs ?? []).length })
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'delete-trainer-account' })
    console.error('delete-trainer-account failed:', err?.message)
    return json({ error: 'Account deletion failed' }, 500)
  }
})
