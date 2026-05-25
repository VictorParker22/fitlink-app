// supabase/functions/create-subscription/index.ts
// Deploy with: supabase functions deploy create-subscription
// Set secrets: supabase secrets set STRIPE_SECRET=sk_test_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@14.0.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
          interval: 'month',
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

    // Create a Stripe Subscription with a trial or first payment
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: stripePriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        fitlink_plan_id: planId,
        fitlink_client_id: clientId,
        fitlink_trainer_id: trainerId,
      },
    })

    // Get the client secret from the subscription's first invoice
    const invoice = subscription.latest_invoice as Stripe.Invoice
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent

    // Record subscription in our database
    await supabaseAdmin
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

    // Record the initial payment
    await supabaseAdmin.from('payments').insert({
      trainer_id: trainerId,
      client_id: clientId,
      plan_id: planId,
      stripe_payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: 'usd',
      status: 'pending',
    })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
        subscriptionId: subscription.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Error creating subscription:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
