// supabase/functions/create-payment-intent/index.ts
// Deploy with: supabase functions deploy create-payment-intent
// Set secrets: supabase secrets set STRIPE_SECRET_KEY=sk_test_...

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
  // Handle CORS preflight
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

    // Create a Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch the plan details
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

    // Fetch the client details
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

      // Save Stripe customer ID back to the client record
      await supabaseAdmin
        .from('clients')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', clientId)
    }

    // Create a PaymentIntent
    const amount = Math.round(Number(plan.price) * 100) // Convert dollars to cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: stripeCustomerId,
      application_fee_amount: Math.round(amount * 0.10),
      transfer_data: {
        destination: trainerStripeAccountId,
      },
      metadata: {
        fitlink_plan_id: planId,
        fitlink_client_id: clientId,
        fitlink_trainer_id: trainerId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    })

    // Record the pending payment in our database
    await supabaseAdmin.from('payments').insert({
      trainer_id: trainerId,
      client_id: clientId,
      plan_id: planId,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      currency: 'usd',
      status: 'pending',
    })

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        customerId: stripeCustomerId,
        paymentIntentId: paymentIntent.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Error creating payment intent:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
