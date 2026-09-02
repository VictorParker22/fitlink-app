// supabase/functions/create-subscription/index.ts
// Deploy with: supabase functions deploy create-subscription
// Set secrets: supabase secrets set STRIPE_SECRET=sk_test_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireCaller, requireClientAccess, AuthError, authErrorResponse } from '../_shared/auth.ts'
import { getPaymentSplit, applicationFeePercent } from '../_shared/money.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET')!, {
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { planId, clientId, trainerId } = await req.json()

    if (!planId || !clientId || !trainerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: planId, clientId, trainerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // The caller must BE this athlete, or be their coach. Without this,
    // any holder of the anon key — which ships in the app binary — could
    // open a live recurring Stripe subscription against a stranger's saved
    // card and bill them every month.
    // trainerId is deliberately NOT bound to the caller: an athlete
    // legitimately subscribes to a coach who is not themselves.
    const caller = await requireCaller(req)
    await requireClientAccess(caller, clientId)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch plan details
    const { data: plan, error: planError } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Plan not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch client details
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch trainer's Stripe Connect account
    const { data: trainer, error: trainerError } = await supabaseAdmin
      .from('trainers')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('id', trainerId)
      .single()

    if (trainerError || !trainer) {
      return new Response(
        JSON.stringify({ error: 'Trainer not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!trainer.stripe_charges_enabled) {
      return new Response(
        JSON.stringify({ error: 'Coach has not completed payment setup' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const trainerStripeAccountId = trainer.stripe_account_id

    // Create or retrieve Stripe Customer
    let stripeCustomerId = client.stripe_customer_id

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: client.name || undefined,
        metadata: {
          fitlink_client_id: clientId,
          fitlink_trainer_id: trainerId,
        },
      })
      stripeCustomerId = customer.id

      await supabaseAdmin
        .from('clients')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', clientId)
    }

    // Find or create Stripe Price for this plan
    // We store stripe_price_id on the plan to avoid recreating
    let stripePriceId = plan.stripe_price_id

    if (!stripePriceId) {
      // First create a Stripe Product
      const product = await stripe.products.create({
        name: plan.name,
        metadata: {
          fitlink_plan_id: planId,
          fitlink_trainer_id: trainerId,
        },
      })

      // Then create a recurring Price
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(Number(plan.price) * 100), // dollars to cents
        currency: 'usd',
        recurring: {
          interval: plan.period === 'year' ? 'year' : 'month',
        },
        metadata: {
          fitlink_plan_id: planId,
        },
      })

      stripePriceId = price.id

      // Save stripe IDs back to the plan for reuse
      await supabaseAdmin
        .from('plans')
        .update({
          stripe_price_id: price.id,
          stripe_product_id: product.id,
        })
        .eq('id', planId)
    }

    const split = await getPaymentSplit(supabaseAdmin, trainerId)

    // A second tap must not open a second subscription. If this athlete
    // already has a live subscription for this plan, hand back its
    // pending invoice's client secret (or tell the caller it is already
    // active) instead of creating another one that bills forever.
    const { data: existingSub } = await supabaseAdmin
      .from('client_subscriptions')
      .select('stripe_subscription_id, status')
      .eq('client_id', clientId)
      .eq('plan_id', planId)
      .maybeSingle()

    if (existingSub?.stripe_subscription_id && ['incomplete', 'active', 'trialing', 'past_due'].includes(existingSub.status)) {
      try {
        const live = await stripe.subscriptions.retrieve(existingSub.stripe_subscription_id, {
          expand: ['latest_invoice.payment_intent'],
        })
        if (live.status === 'active' || live.status === 'trialing') {
          return new Response(
            JSON.stringify({ alreadyActive: true, subscriptionId: live.id, customerId: stripeCustomerId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        if (live.status === 'incomplete') {
          const inv = live.latest_invoice as Stripe.Invoice
          const pi = inv?.payment_intent as Stripe.PaymentIntent | null
          if (pi?.client_secret) {
            return new Response(
              JSON.stringify({ clientSecret: pi.client_secret, customerId: stripeCustomerId, subscriptionId: live.id }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        // canceled / incomplete_expired / unpaid → fall through and create anew
      } catch (e) {
        console.warn('existing subscription lookup failed; creating fresh:', (e as any)?.message)
      }
    }

    // Idempotency: the same athlete + plan within the same hour maps to
    // one Stripe subscription even if two requests race.
    const hourBucket = Math.floor(Date.now() / 3_600_000)
    const idempotencyKey = `sub:${clientId}:${planId}:${hourBucket}`

    // Create a Stripe Subscription with a trial or first payment
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      // Server-resolved, not a literal — see _shared/money.ts.
      application_fee_percent: applicationFeePercent(split),
      transfer_data: {
        destination: trainerStripeAccountId,
      },
      metadata: {
        fitlink_plan_id: planId,
        fitlink_client_id: clientId,
        fitlink_trainer_id: trainerId,
        fitlink_platform_fee_bps: String(split.platformFeeBps),
        fitlink_org_share_bps: String(split.orgShareBps),
        ...(split.orgId ? { fitlink_org_id: split.orgId } : {}),
      },
    }, { idempotencyKey })

    // Get the client secret from the subscription's first invoice
    const invoice = subscription.latest_invoice as Stripe.Invoice
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent

    // Record subscription in our database. This row is what the webhook
    // uses to find the athlete when the invoice is paid — if it is not
    // written, the athlete pays and is never enrolled. So a failure here
    // is a failure of the whole request: cancel the subscription we just
    // opened and tell the caller.
    const { error: subRowErr } = await supabaseAdmin
      .from('client_subscriptions')
      .upsert({
        client_id: clientId,
        plan_id: planId,
        trainer_id: trainerId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
        status: subscription.status, // 'incomplete' until payment succeeds
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,plan_id' })

    if (subRowErr) {
      console.error('client_subscriptions write failed; voiding subscription:', subRowErr.message)
      try { await stripe.subscriptions.cancel(subscription.id) } catch {}
      return new Response(
        JSON.stringify({ error: 'Could not record your subscription. You have not been charged.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Record the initial payment
    await supabaseAdmin.from('payments').upsert({
      trainer_id: trainerId,
      client_id: clientId,
      plan_id: planId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: 'usd',
      status: 'pending',
    }, { onConflict: 'stripe_payment_intent_id', ignoreDuplicates: true })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
        subscriptionId: subscription.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    if (err instanceof AuthError) return authErrorResponse(err, corsHeaders, { req, endpoint: 'create-subscription' })
    console.error('Error creating subscription:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
